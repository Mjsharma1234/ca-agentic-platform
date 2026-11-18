# Firm OS Tally Agent

A small program that runs on the PC where Tally is installed. It reads the **purchase register** from Tally
(read-only) and sends it to Firm OS over HTTPS, where it feeds GSTR-2B reconciliation. It never writes to Tally,
and Tally's port is never exposed to the internet: the agent only makes outbound connections.

## Set up (once per Tally PC)

1. **In Firm OS (manager):** `POST /api/v1/tally-agent/agents` with a name such as "Reception PC". Copy the key (`fosk_...`); it is shown once.
2. **In Tally:** F1 (Help) > Settings > Connectivity > Client/Server configuration: set TallyPrime to act as *Both* (or *Server*), port **9000**. Open the client's company.
3. **On the PC:**
   ```
   pip install .            (or use the built FirmOSTallyAgent.exe)
   firmos-tally-agent setup
   firmos-tally-agent check
   ```
   `check` lists the open Tally companies and whether each is linked.
4. **In Firm OS (manager):** `GET /api/v1/tally-agent/companies`, then `PUT /api/v1/tally-agent/companies/{id}/link` with the client's id. Until a company is linked the agent reports "waiting for link" and sends nothing.
5. `firmos-tally-agent sync` for one pass, or `firmos-tally-agent run` / `tray` to keep syncing every hour (change `interval_minutes` in the settings file).

Settings live in `%APPDATA%\FirmOSTallyAgent\config.json`; the key is encrypted with Windows DPAPI. The log is `agent.log` beside it.

## What a sync does

For each linked company it sends the whole current financial year (1 April to 31 March) of purchase and debit-note vouchers. Firm OS
upserts by Tally voucher GUID and removes vouchers that no longer exist in Tally, so edits and deletions in Tally carry over. Set
`financial_years` to 2 in the settings to also cover the previous year. If Tally returns nothing for a period that already has
stored vouchers, Firm OS refuses to wipe them and the agent reports it.

## Commands

| Command | Does |
|---|---|
| `setup` | Saves the Firm OS address and key after checking the key works |
| `check` | Tests Tally and Firm OS and lists company link status |
| `sync` | One sync now |
| `run` | Syncs on a timer (for a scheduled task) |
| `tray` | Same, with a tray icon (needs `pip install pystray pillow`) |
| `dump "<company>"` | Saves Tally's raw purchase XML to a file, for checking against a real install |

## Build the .exe

`powershell -File build_exe.ps1` (needs `pip install pyinstaller`). Unsigned executables may be flagged by antivirus; sign the file before giving it to clients.

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
The tray icon and the PyInstaller build have not been run. The PostgreSQL row-level-security part of migration 0013 has not been run on PostgreSQL.
