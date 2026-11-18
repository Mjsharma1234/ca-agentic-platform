# CA Agentic Compliance Platform — Working MVP Walkthrough Guide

> **Core Invariant**: *"The Machine Prepares. The Professional Decides."*  
> Zero autonomous filing. Zero LLM calculations on financial returns. Strict alignment with ICAI SQC 1, Rule 88C/88D DRC defense, and IMS 2024–2026 workflows.

---

## 1. Quick Start (Single-Click Launch)

You can launch the **FastAPI backend**, which also serves the **Firm OS web app**, using either launcher:

- **Windows Batch Launcher**: Double-click [`start_mvp.bat`](file:///c:/Users/sharm/OneDrive/Desktop/Worksmith/CA%20Automation/start_mvp.bat)
- **PowerShell Launcher**: Run `.\start_mvp.ps1` in PowerShell

### Running manually:
```bash
cd ca-agentic-platform/backend
python -m uvicorn app.main:app --host 127.0.0.1 --port 8000 --reload
```
- **Firm OS web app**: [http://localhost:8000](http://localhost:8000)
- **Swagger Docs**: [http://localhost:8000/docs](http://localhost:8000/docs)

---

## 2. What Was Built in This MVP

### A. Deterministic Reconciliation Core (`backend/app/deterministic_core/reconciler.py`)
- **Multi-Pass Matching Engine**:
  1. **Pass 1 (Exact Match)**: Matches normalized Invoice Number + Supplier GSTIN + Total Tax.
  2. **Pass 2 (Fuzzy Match)**: Matches Supplier GSTIN + Date + Value (handling typo variance in invoice formatting).
  3. **Pass 3 (Value Mismatch & Rule 88D)**: Identifies instances where invoice exists in both Books and 2B but taxes differ (caps credit to lower of books vs 2B to prevent DRC-01C notices).
  4. **Pass 4 (Sec 17(5) Blocked Credits)**: Automatically tags motor vehicles, employee food/beverages, club memberships for mandatory reversal.
  5. **Pass 5 (Missing in 2B)**: Flags vendor defaults (supplier didn't file GSTR-1), queues automated vendor reminder notices.
  6. **Pass 6 (Unclaimed in Books)**: Flags genuine credits appearing in GSTR-2B feed not yet recorded in accounting books.
- **Automated GSTR-3B Table 4 Construction**:
  - Computes Table 4(A)(5) All Other ITC.
  - Computes Table 4(B)(1) Ineligible Reversal under Rule 38/42/43 & Sec 17(5).
  - Computes Table 4(C) Net ITC Available.
  - Computes Table 4(D)(2) Ineligible ITC under Sec 16(4).

### B. Two-Way TallyPrime XML Bridge (`backend/app/deterministic_core/tally_bridge.py`)
- Produces valid Tally XML import payloads (`<ENVELOPE>`, `<VOUCHER VCHTYPE="Purchase">`) for inward invoices and unreconciled vouchers so that the CA firm can push matched entries directly into client Tally company files without re-keying data.

### C. Hardened Human Governance Gates (Firm OS web: **Gates & approvals**, `#/gates`)
- **Gate G2**: Low-Confidence OCR Review (side-by-side invoice image vs field extractor).
- **Gate G3**: Inward Invoice IMS Review (Accept, Reject, Pending commit).
- **Gate G4**: ITC Mismatch & Sec 17(5) Resolution with DRC-01C defense simulation.
- **Gate G6**: Four-Eyes Pre-Filing Review (Audit trail, rule compliance summary).
- **Gate G7**: Partner Approval (ordinary partner approval recorded in the audit chain; the firm files the return itself outside the platform).

### D. Reconciliation (Firm OS web: **Reconciliation**, `#/recon`)
- **Bank tab**: upload a bank statement CSV and run the reconciler, or import a Tally trial-balance XML.
- **Export Tally XML**: `GET /api/v1/returns/export-tally-xml` (needs a signed-in session).

---

## 3. End-to-End Walkthrough (Demo Script)

1. Open [http://localhost:8000](http://localhost:8000) and sign in with a demo persona (local development only).
2. **Reconciliation** (`#/recon`) → **Bank** tab: upload a bank CSV, run the reconciler, and import a Tally trial-balance XML.
3. **Intake & vault** (`#/intake`): review uploaded bills and their extraction confidence (Gate G2).
4. **Gates & approvals** (`#/gates`): a reviewer approves at G6 (four-eyes), then a partner approves at G7. Every decision is sealed into the audit chain (`#/record`).
