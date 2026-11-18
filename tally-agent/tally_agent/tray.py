"""System-tray front end: a status icon with "Sync now", "Open log" and "Quit". Needs the optional `tray` extra.

Not covered by automated tests (it needs a desktop session); the sync logic it calls is.
"""
import os
import threading
import time

from . import __version__
from .config import Config, config_dir
from .sync import run_sync
from .tally_client import TallyClient
from .uploader import Uploader


def run_tray(cfg: Config) -> int:
    try:
        import pystray
        from PIL import Image, ImageDraw
    except ImportError:
        print("The tray needs extra packages: pip install pystray pillow")
        return 1

    tally, up = TallyClient(cfg.tally_url), Uploader(cfg.server_url, cfg.agent_key)
    state = {"text": "Starting...", "ok": True, "stop": False}
    wake = threading.Event()

    def icon_image(ok: bool):
        img = Image.new("RGB", (64, 64), (22, 163, 74) if ok else (220, 38, 38))
        ImageDraw.Draw(img).rectangle((20, 20, 44, 44), fill="white")
        return img

    icon = pystray.Icon("firmos-tally-agent", icon_image(True), "Firm OS Tally Agent")

    def worker():
        while not state["stop"]:
            report = run_sync(tally, up, cfg.financial_years, cfg.fetch_all_voucher_types)
            state["ok"], state["text"] = report.ok, f"{time.strftime('%H:%M')} {report.summary()}"[:120]
            icon.icon, icon.title = icon_image(report.ok), f"Firm OS Tally Agent: {state['text']}"
            wake.wait(cfg.interval_minutes * 60)
            wake.clear()

    def sync_now(_icon, _item):
        wake.set()

    def open_log(_icon, _item):
        os.startfile(str(config_dir() / "agent.log"))  # type: ignore[attr-defined]  (Windows only)

    def quit_(_icon, _item):
        state["stop"] = True
        wake.set()
        icon.stop()

    icon.menu = pystray.Menu(
        pystray.MenuItem(lambda _i: state["text"], None, enabled=False),
        pystray.MenuItem("Sync now", sync_now),
        pystray.MenuItem("Open log", open_log),
        pystray.MenuItem(f"Version {__version__}", None, enabled=False),
        pystray.MenuItem("Quit", quit_),
    )
    threading.Thread(target=worker, daemon=True).start()
    icon.run()
    return 0
