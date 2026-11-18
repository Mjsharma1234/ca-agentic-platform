# Tally agent: purchase register into Firm OS (design)

Status: agreed in conversation 2026-11-18; the user asked to go straight to a plan and build.

## Intent

Firm OS reconciles a client's books against GSTR-2B. Tally holds the books, on the client's own PC,
and a cloud server cannot reach it. A small Windows agent runs next to Tally, reads the purchase
register over Tally's local HTTP/XML interface (port 9000) and sends it to Firm OS over HTTPS.

## Goals

- First version: purchase and debit-note vouchers for GSTR-2B reconciliation. Bank reconciliation is a later version.
- Read-only: the agent never writes to Tally.
- Data lands in the existing `invoices` table (source `ERP_SYNC`, direction `INWARD`), so the existing
  `/returns/reconciliation` endpoint works without changes.
- A firm admin issues, lists and revokes agent keys; one Tally company is linked to one Firm OS client.

## Non-goals (this version)

Bank reconciliation, sales/outward vouchers, writing back to Tally, GSTR-2B download, a signed installer.

## Anti-goals

- Exposing Tally's unauthenticated XML port to the internet.
- A sync that silently drops, duplicates or mislabels vouchers.
- Cross-firm data access through an agent key.

## Approaches considered

1. **Thin relay agent (chosen).** Agent forwards Tally's XML; the backend parses it with the existing safe parser. Parsing fixes need one server deploy, not an update on every client PC.
2. Smart agent that parses on the client PC. Every parsing fix means re-installing agents; Tally's XML varies by version.
3. Tunnel to port 9000. Rejected: Tally's interface has no login.

Language: Python (shares repo, tests and skills with the backend). The agent ships as one `.exe` via PyInstaller.

## Design

- **Agent → server:** outbound HTTPS only, header `X-Agent-Key`. Per-firm key, stored hashed, revocable.
- **Snapshot sync, not incremental (change from the earlier proposal):** each sync sends all purchase vouchers for one company and one period (default: current financial year). The server upserts by Tally voucher GUID and soft-deletes vouchers in that period that are no longer in Tally. Edits and deletions in Tally therefore propagate, which an alteration-ID delta cannot do.
- **Company linking:** the first contact from an unknown Tally company creates an unlinked company record. Ingest returns 409 until a manager links it to a client. The agent reports "waiting for link".
- **Tables (migration 0013):** `tally_agents`, `tally_companies`; `invoices.external_ref` (the Tally GUID) with a unique index per client.
- **Voucher mapping:** supplier = party ledger and party GSTIN; invoice number = the supplier's reference, else the Tally voucher number; taxable value = non-party, non-tax, non-round-off ledger lines; CGST/SGST/IGST/cess = ledger lines by name. Debit notes are stored as negative amounts. Cancelled and optional vouchers are skipped.
- **Safety:** request bodies are gzip, size-capped after decompression; XML goes through `SafeTallyXMLParser`; every ingest writes an audit-chain block in the same transaction.

## Left to the builder / known limits

- Tally's XML differs by version and by how each company is configured. The parser is written to tolerate variants but was built against synthetic XML modelled on Tally's format, not a real install. **It must be run against the user's real Tally before it is trusted.**
- Very large companies may need chunked uploads; the cap is 50 MB after decompression.
- The PostgreSQL row-level-security part of the migration is written to match migrations 0010 and 0011 but has not been run on PostgreSQL.
