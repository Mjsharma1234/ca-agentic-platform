"""Command line for the agent: setup, check, sync, run, dump, tray."""
import argparse
import getpass
import logging
import logging.handlers
import sys
import time
from datetime import date
from pathlib import Path

from . import __version__, autostart
from .config import Config, ConfigError, config_dir, default_server, load, save, validate_server_url
from .pairing import PairingError, pair
from .sync import financial_year, run_loop, run_sync
from .tally_client import TallyClient, TallyError
from .uploader import ServerRejected, ServerUnavailable, Uploader

log = logging.getLogger("tally_agent")


def _setup_logging() -> None:
    d = config_dir()
    d.mkdir(parents=True, exist_ok=True)
    handler = logging.handlers.RotatingFileHandler(d / "agent.log", maxBytes=1_000_000, backupCount=3, encoding="utf-8")
    handler.setFormatter(logging.Formatter("%(asctime)s %(levelname)s %(message)s"))
    root = logging.getLogger("tally_agent")
    root.setLevel(logging.INFO)
    root.addHandler(handler)
    if sys.stdout is not None:   # a windowless build has no console
        root.addHandler(logging.StreamHandler(sys.stdout))


def _clients(cfg: Config):
    return TallyClient(cfg.tally_url), Uploader(cfg.server_url, cfg.agent_key)


def cmd_setup(args) -> int:
    server = validate_server_url(args.server or input("Firm OS address (https://...): "))
    key = args.key or getpass.getpass("Agent key (starts with fosk_, input is hidden): ").strip()
    cfg = Config(server_url=server, agent_key=key, tally_url=args.tally_url).validate()
    try:
        Uploader(cfg.server_url, cfg.agent_key).heartbeat([])
    except ServerRejected as e:
        print(f"Firm OS refused the key: {e.message}")
        return 1
    except ServerUnavailable as e:
        print(f"Could not check the key: {e}")
        return 1
    print(f"Settings saved to {save(cfg)}")
    print("Next: run 'firmos-tally-agent check', then ask a manager to link your Tally company to a client in Firm OS.")
    return 0


def _first_sync(cfg: Config) -> int:
    tally, up = _clients(cfg)
    report = run_sync(tally, up, cfg.financial_years, cfg.fetch_all_voucher_types, log=log.info)
    print("First sync:", report.summary())
    return 0 if report.ok else 1


def _connect(server: str, tally_url: str, open_browser: bool, want_autostart: bool) -> int:
    """Pairs this PC with a firm, saves the key, optionally starts at login, then syncs once straight away."""
    try:
        names = TallyClient(tally_url).list_companies()
    except TallyError as e:
        names = []
        print(f"Note: {e}")
        print("Continuing anyway; open Tally before the first sync.")
    try:
        key = pair(server, names, open_browser=open_browser)
    except PairingError as e:
        print(e)
        return 1
    cfg = Config(server_url=server, agent_key=key, tally_url=tally_url).validate()
    print(f"Connected. Settings saved to {save(cfg)}")
    if want_autostart and sys.platform == "win32":
        try:
            autostart.enable()
            print("The agent will now start by itself when you log in to Windows (turn off with: autostart off).")
        except OSError as e:
            print(f"Could not set up start at login ({e}); run the agent yourself after a restart.")
    return _first_sync(cfg)


def cmd_connect(args) -> int:
    server = validate_server_url(args.server or default_server())
    return _connect(server, args.tally_url, not args.no_browser, not args.no_autostart)


def cmd_auto(_args) -> int:
    """What happens when the program is simply started: pair if needed, then keep syncing."""
    try:
        cfg = load()
        try:
            Uploader(cfg.server_url, cfg.agent_key).heartbeat([])
            # A code is only shown when a PC is NOT connected, so say plainly why there is none to enter.
            print(f"This PC is already connected to Firm OS ({cfg.server_url}). There is no code to enter.\n"
                  "Leave this window open (you can minimise it): it syncs now, then every hour.\n"
                  "To connect it again (a different firm, or to start fresh), click Disconnect next to this PC on the\n"
                  "Tally sync page in Firm OS, close this window, and run the agent again: it will show a new code.\n")
        except ServerRejected as e:
            if e.status != 401:
                raise
            print("This PC's connection was removed in Firm OS. Pairing again...")
            return _connect(cfg.server_url, cfg.tally_url, True, True) or cmd_run(None)
        except ServerUnavailable:
            print(f"This PC is already connected to Firm OS ({cfg.server_url}), but Firm OS did not answer just now "
                  "(it may be waking up). The agent keeps trying; there is no code to enter.\n")
    except ConfigError:
        code = _connect(default_server(), "http://localhost:9000", True, True)
        if code not in (0,):
            return code
    return cmd_run(None)


def cmd_autostart(args) -> int:
    if sys.platform != "win32":
        print("Starting at login is only supported on Windows.")
        return 1
    if args.mode == "on":
        print("Will run at login:", autostart.enable())
    elif args.mode == "off":
        print("Removed from startup." if autostart.disable() else "It was not set to start at login.")
    else:
        print(autostart.status() or "Not set to start at login.")
    return 0


def cmd_check(_args) -> int:
    cfg = load()
    tally, up = _clients(cfg)
    bad = 0
    try:
        names = tally.list_companies()
        print(f"Tally: OK. Open companies: {', '.join(names) if names else '(none: open a company in Tally)'}")
    except TallyError as e:
        print(f"Tally: PROBLEM. {e}")
        names, bad = [], bad + 1
    try:
        res = up.heartbeat(names)
        print("Firm OS: OK.")
        for c in res["companies"]:
            print(f"  {c['company_name']}: {'linked' if c['linked'] else 'NOT LINKED yet (a manager links it in Firm OS)'}")
    except (ServerRejected, ServerUnavailable) as e:
        print(f"Firm OS: PROBLEM. {getattr(e, 'message', e)}")
        bad += 1
    return 1 if bad else 0


def cmd_sync(_args) -> int:
    cfg = load()
    tally, up = _clients(cfg)
    report = run_sync(tally, up, cfg.financial_years, cfg.fetch_all_voucher_types, log=log.info)
    log.info("Sync finished: %s", report.summary())
    return 0 if report.ok else 1


def cmd_run(_args) -> int:
    cfg = load()
    tally, up = _clients(cfg)
    log.info("Agent %s started; syncing every %d minutes, and whenever Firm OS asks.", __version__, cfg.interval_minutes)
    return run_loop(tally, up, cfg.interval_minutes, cfg.financial_years, cfg.fetch_all_voucher_types, log=log.info)


def cmd_dump(args) -> int:
    """Saves Tally's raw answer so it can be inspected or attached to a bug report. Contains the company's data."""
    cfg = load()
    tally = TallyClient(cfg.tally_url)
    start, end = financial_year(date.today())
    xml = tally.fetch_purchase_vouchers(args.company, start, end, cfg.fetch_all_voucher_types)
    out = Path(args.out)
    out.write_text(xml, encoding="utf-8")
    print(f"Wrote {len(xml):,} characters to {out}. This file contains the company's purchase data; share it only with Worksmith support.")
    return 0


def cmd_tray(_args) -> int:
    from .tray import run_tray
    return run_tray(load())


def main(argv=None) -> int:
    p = argparse.ArgumentParser(prog="firmos-tally-agent", description="Sends Tally purchase registers to Firm OS (read-only). Run with no command to connect and start syncing.")
    p.add_argument("--version", action="version", version=__version__)
    sub = p.add_subparsers(dest="cmd", required=False)
    p.set_defaults(fn=cmd_auto)
    c = sub.add_parser("connect", help="pair this PC with your firm in Firm OS (opens your browser)")
    c.add_argument("--server")
    c.add_argument("--tally-url", default="http://localhost:9000")
    c.add_argument("--no-browser", action="store_true", help="print the link instead of opening it")
    c.add_argument("--no-autostart", action="store_true", help="do not start the agent when Windows starts")
    c.set_defaults(fn=cmd_connect)
    a = sub.add_parser("autostart", help="start the agent at Windows login")
    a.add_argument("mode", choices=["on", "off", "status"])
    a.set_defaults(fn=cmd_autostart)
    s = sub.add_parser("setup", help="save the Firm OS address and agent key")
    s.add_argument("--server")
    s.add_argument("--key")
    s.add_argument("--tally-url", default="http://localhost:9000")
    s.set_defaults(fn=cmd_setup)
    sub.add_parser("check", help="test the connection to Tally and Firm OS").set_defaults(fn=cmd_check)
    sub.add_parser("sync", help="run one sync now").set_defaults(fn=cmd_sync)
    sub.add_parser("run", help="sync repeatedly (for a scheduled task or service)").set_defaults(fn=cmd_run)
    d = sub.add_parser("dump", help="save Tally's raw purchase XML for one company to a file")
    d.add_argument("company")
    d.add_argument("--out", default="tally_purchase_dump.xml")
    d.set_defaults(fn=cmd_dump)
    sub.add_parser("tray", help="run with a system-tray icon").set_defaults(fn=cmd_tray)

    args = p.parse_args(argv)
    _setup_logging()
    try:
        return args.fn(args)
    except ConfigError as e:
        print(e)
        return 2
    except KeyboardInterrupt:
        return 130
    except TallyError as e:
        print(e)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
