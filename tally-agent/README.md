# Firm OS Tally Agent

A small program that runs on the PC where Tally is installed. It reads the **purchase register** from Tally
(read-only) and sends it to Firm OS over HTTPS, where it feeds GSTR-2B reconciliation. It never writes to Tally,
and Tally's port is never exposed to the internet: the agent only makes outbound connections.

## Connect a PC (automatic)

1. **In Tally:** F1 (Help) > Settings > Connectivity > Client/Server configuration: set TallyPrime to act as *Both* (or *Server*), port **9000**. Open the client's company.
2. **Start the agent** on that PC (double-click `FirmOSTallyAgent.exe`, or run `firmos-tally-agent`). It opens Firm OS in the browser with a short code.
3. **A manager or partner, signed in to Firm OS, checks the code matches the one on the PC and clicks Approve.** This one click is deliberate: without it, anyone could attach any PC to any firm.

That is all. The agent receives its own key (nothing to copy), syncs straight away, keeps syncing every hour, and starts again when Windows starts
(`firmos-tally-agent autostart off` turns that off). Each Tally company links itself to the client whose name matches it **exactly**
(ignoring case and punctuation); anything else shows "Pick a client" on the Tally sync page and is linked by hand.
The agent connects to `https://ca-agentic-platform.onrender.com` unless `FIRMOS_SERVER` is set. If Render's free plan is asleep, the first
connection can take about a minute; the agent waits and retries.

If a manager disconnects the PC in Firm OS, start the agent again and approve it again.

**Advanced / no browser on the PC:** a manager can issue a key by hand on the Tally sync page, then run `firmos-tally-agent setup` and paste it.

Settings live in `%APPDATA%\FirmOSTallyAgent\config.json`; the key is encrypted with Windows DPAPI. The log is `agent.log` beside it.

## What a sync does

For each linked company it sends the whole current financial year (1 April to 31 March) of purchase and debit-note vouchers. Firm OS
upserts by Tally voucher GUID and removes vouchers that no longer exist in Tally, so edits and deletions in Tally carry over. Set
`financial_years` to 2 in the settings to also cover the previous year. If Tally returns nothing for a period that already has
stored vouchers, Firm OS refuses to wipe them and the agent reports it.

## Commands

| Command | Does |
|---|---|
| *(no command)* | Connects if needed (opens the browser), then keeps syncing |
| `connect` | Pairs this PC with your firm; `--no-browser` prints the link instead, `--no-autostart` skips start-at-login |
| `autostart on/off/status` | Starts the agent when this Windows user logs in (per-user registry Run key, no admin rights) |
| `setup` | Saves the Firm OS address and a hand-issued key after checking it works |
| `check` | Tests Tally and Firm OS and lists company link status |
| `sync` | One sync now |
| `run` | Syncs on a timer (for a scheduled task) |
| `tray` | Same, with a tray icon (needs `pip install pystray pillow`) |
| `dump "<company>"` | Saves Tally's raw purchase XML to a file, for checking against a real install |

## Build the .exe

```
powershell -File build_exe.ps1
```

Produces `dist\FirmOSTallyAgent.exe` (about 9.5 MB, no Python needed on the client PC) and prints its SHA-256. The script builds in a throwaway
virtual environment under `%TEMP%` (installing PyInstaller and httpx there, not into your main Python), and `dist/` is not committed.

- The exe keeps a console window so it can show the pairing code; at login it starts minimised.
- Windows SmartScreen or antivirus may warn about an unsigned exe. Sign it with a code-signing certificate before giving it to clients.
- Run it with no arguments (double-click) to connect and sync; `FirmOSTallyAgent.exe --help` lists the other commands.
- The tray icon is not included in the exe (it would need `pystray` and `pillow` added to the build environment).

## Tests

```
pip install -e ".[dev]"
python -m pytest tests
```

`tests/test_integration_backend.py` runs this agent against the real backend in `../backend` (in-process, temporary database).

## Verified and not verified

Tested: the agent logic, retry and failure handling, and the wire format against the real backend.

**Tested against a real TallyPrime** (2026-11-18, a dummy company on one PC, Educational Mode): the agent listed the open company, pulled
3 purchase vouchers, 1 purchase test voucher and 1 debit note (intra-state and inter-state), and the parser read every amount, GSTIN, supplier
invoice number and date correctly (debit note negative). The agent then synced them to a local backend and `/returns/reconciliation` returned
matching totals; a second sync changed nothing. This covers **one Tally version, one company, a handful of vouchers**.
Not yet seen: vouchers with inventory/HSN lines, multi-currency, TDS/TCS ledgers, cancelled or optional vouchers, a large company
(upload cap is 50 MB after decompression), TallyPrime Server or ERP 9. Run `dump` on a real client company before relying on its numbers.

Tally in Educational Mode only accepts vouchers dated the 1st, 2nd or last day of a month; that affects entering test data, not reading it.
The tray icon has not been run. The PostgreSQL row-level-security part of migration 0013 has not been run on PostgreSQL.
