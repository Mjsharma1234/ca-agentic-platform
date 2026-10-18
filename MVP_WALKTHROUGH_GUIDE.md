# CA Agentic Compliance Platform — Working MVP Walkthrough Guide

> **Core Invariant**: *"The Machine Prepares. The Professional Decides."*  
> Zero autonomous filing. Zero LLM calculations on financial returns. Strict alignment with ICAI SQC 1, UDIN standards, Rule 88C/88D DRC defense, and IMS 2024–2026 workflows.

---

## 1. Quick Start (Single-Click Launch)

You can launch both the **FastAPI Deterministic Backend** and the **Next.js Web Application** using either launcher:

- **Windows Batch Launcher**: Double-click [`start_mvp.bat`](file:///c:/Users/sharm/OneDrive/Desktop/Worksmith/CA%20Automation/start_mvp.bat)
- **PowerShell Launcher**: Run `.\start_mvp.ps1` in PowerShell

### Running Manually in Separate Terminals:
1. **Backend Terminal**:
   ```bash
   cd ca-agentic-platform/backend
   python -m uvicorn app.main:app --host 127.0.0.1 --port 8000 --reload
   ```
   *Swagger Docs: [http://localhost:8000/docs](http://localhost:8000/docs)*

2. **Frontend Terminal**:
   ```bash
   cd ca-agentic-platform/frontend
   npm run dev
   ```
   *Web Dashboard: [http://localhost:3000](http://localhost:3000)*

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

### C. Hardened Human Governance Gates (`frontend/src/app/gates/`)
- **Gate G2**: Low-Confidence OCR Review (side-by-side invoice image vs field extractor).
- **Gate G3**: Inward Invoice IMS Review (Accept, Reject, Pending commit).
- **Gate G4**: ITC Mismatch & Sec 17(5) Resolution with DRC-01C defense simulation.
- **Gate G6**: Four-Eyes Pre-Filing Review (Audit trail, UDIN requirement check, rule compliance summary).
- **Gate G7**: Partner Class-3 DSC USB Token Signing (Simulated PKCS#7 detached signature with memory wipe of PIN).

### D. Live Interactive Returns Dashboard (`frontend/src/app/returns/page.tsx`)
- **"Seed DB" Button**: Re-seeds SQLite database with realistic client data (*Rajesh Fabrics Pvt Ltd*, 8 purchase invoices, 7 GSTR-2B feed records).
- **"Run 2B & IMS Reco" Button**: Calls the Python deterministic engine live, calculating Table 4 figures and displaying matched vs mismatched items.
- **"Export Tally XML" Button**: Downloads `TallyPrime_Purchase_Import_<Date>.xml` directly in your browser.
- **"Assemble GSTR-3B" Button**: Runs the 38-rule compliance check on live obligation records.

---

## 3. End-to-End CA Workflow Walkthrough (Demo Script)

1. **Step 1: Open the Returns Engine**
   - Navigate to [http://localhost:3000/returns](http://localhost:3000/returns).
   - Click **"Seed DB"** to verify backend connectivity.
   - Click **"Run 2B & IMS Reco"**. Observe the real-time calculated breakdown:
     - 4 Exact Matches
     - 1 Value Mismatch (Rule 88D)
     - ₹38,000 Sec 17(5) Blocked Credit
     - ₹3,37,500 Net Eligible ITC
     - Complete Table 4(A)(5), 4(B)(1), and 4(C) matrix!
   - Click **"Export Tally XML"** to verify generation of valid Tally XML.

2. **Step 2: Review Inward Invoices (Gate G2 & G3)**
   - Navigate to [http://localhost:3000/documents](http://localhost:3000/documents).
   - Review uploaded bills, extracted HSN/SAC codes, and confidence scores.

3. **Step 3: Four-Eyes Approval (Gate G6)**
   - Open [http://localhost:3000/gates/G6-9845](http://localhost:3000/gates/G6-9845).
   - Review the complete pre-filing audit checklist: 38 deterministic rules passed, variance checks, and UDIN requirement flag.
   - Click **"Approve Return & Dispatch for DSC"**.

4. **Step 4: Partner DSC Signing (Gate G7)**
   - Open [http://localhost:3000/gates/G7-9846](http://localhost:3000/gates/G7-9846).
   - The Partner enters their DSC PIN.
   - The platform generates a SHA-256 PKCS#7 signature and wipes the PIN from volatile RAM immediately upon completion.
