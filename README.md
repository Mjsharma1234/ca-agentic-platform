# CA Agentic Compliance Platform (MVP)

> **Core Invariant**: *"The Machine Prepares. The Professional Decides."*  
> An autonomous compliance orchestrator with deterministic financial accuracy, strict ICAI compliance, and hardened human-in-the-loop governance for Indian Chartered Accountants.

[![Python](https://img.shields.io/badge/Python-3.11+-blue.svg)](https://www.python.org/)
[![FastAPI](https://img.shields.io/badge/FastAPI-0.110+-green.svg)](https://fastapi.tiangolo.com/)
[![Next.js](https://img.shields.io/badge/Next.js-15-black.svg)](https://nextjs.org/)
[![TailwindCSS](https://img.shields.io/badge/TailwindCSS-v3-blue.svg)](https://tailwindcss.com/)
[![ICAI SQC 1 Compliant](https://img.shields.io/badge/ICAI-SQC%201%20Compliant-orange.svg)](https://www.icai.org/)

---

## 🏛️ Platform Architecture: 3 Strata Model

```
┌────────────────────────────────────────────────────────────────────────┐
│                        STRATUM 3: HUMAN GOVERNANCE                     │
│  G1 Document Review │ G2 OCR Audit │ G3 IMS Commit │ G6 Four-Eyes │ G7 DSC │
└────────────────────────────────────┬───────────────────────────────────┘
                                     │ Approved Decisions Only
┌────────────────────────────────────▼───────────────────────────────────┐
│                     STRATUM 2: AGENTIC ORCHESTRATION                    │
│   Agent GS-1 Inward Collector   │   Agent GS-3 Vendor Communicator     │
│   Agent GS-2 OCR & Extraction   │   Agent GS-5 Returns Assembler       │
└────────────────────────────────────┬───────────────────────────────────┘
                                     │ Deterministic Function Calls Only
┌────────────────────────────────────▼───────────────────────────────────┐
│                      STRATUM 1: DETERMINISTIC CORE                     │
│   • Multi-Pass 2B Reco Engine   • 38 Return Verification Rules         │
│   • Rule 88C/88D Variance Calc  • Sec 17(5) Reversal & Table 4 Auto-Math│
│   • TallyPrime XML Bridge       • SHA-256 PKCS#7 DSC Signing           │
└────────────────────────────────────────────────────────────────────────┘
```

- **Stratum 1 (Deterministic Core)**: Pure, zero-hallucination calculation engines written in Python. Implements the 38 statutory GST rules, Rule 88C/88D variance calculations, Section 17(5) blocked credit reversals, and TallyPrime XML imports. Zero LLM math.
- **Stratum 2 (Agentic Orchestration)**: Autonomous agents handle ingestion, document extraction, statutory deadline monitoring, and vendor follow-ups.
- **Stratum 3 (Human Governance Gates)**: The professional firewall. Every tax credit claim, return filing, and DSC signature requires a licensed professional's review and sign-off.

---

## 🚀 Key Features

### 1. Multi-Pass Reconciliation Core
- **Pass 1 (Exact Match)**: Invoice Number + Supplier GSTIN + Tax Amount.
- **Pass 2 (Fuzzy Match)**: Date + Value + Normalized Vendor ID.
- **Pass 3 (Value Mismatch / Rule 88D)**: Identifies tax discrepancies and caps claims to prevent DRC-01C notices.
- **Pass 4 (Section 17(5) Blocked Credits)**: Detects motor vehicles, catering, club memberships, and automates Table 4(B)(1) reversal.
- **Pass 5 (Missing in 2B)**: Flags vendor defaults and queues automated reminders.
- **Pass 6 (Unclaimed in Books)**: Detects valid 2B entries missing in accounts and creates draft purchase vouchers.

### 2. GSTR-3B Table 4 Construction Matrix
Automatically computes:
- **Table 4(A)(5)**: All Other ITC (Inward from 2B)
- **Table 4(B)(1)**: Ineligible Reversal under Rule 38/42/43 & Sec 17(5)
- **Table 4(C)**: Net ITC Available (4A - 4B)
- **Table 4(D)(2)**: Ineligible ITC under Sec 16(4)

### 3. Two-Way TallyPrime XML Integration
- Produces valid Tally XML import payloads (`<ENVELOPE>`, `<VOUCHER VCHTYPE="Purchase">`) for inward invoices and unreconciled vouchers so that CA firms can sync matched books directly with client Tally company files.

### 4. Hardened Human Governance Gates
- **Gate G2**: Low-Confidence OCR Review (side-by-side invoice image vs field extractor).
- **Gate G3**: IMS Inward Invoice Commit (Accept, Reject, Pending).
- **Gate G4**: ITC Mismatch & Sec 17(5) Claim Resolution.
- **Gate G6**: Four-Eyes Pre-Filing Review with UDIN validation check.
- **Gate G7**: Partner Class-3 DSC USB Token Signing (Simulated PKCS#7 detached signature with memory wipe of PIN).

---

## ⚡ Quick Start

### Option A: 1-Click Launch (Windows)
Double-click [`start_mvp.bat`](./start_mvp.bat) or run `.\start_mvp.ps1` in PowerShell.  
This automatically spins up the FastAPI backend and Next.js frontend, and opens the dashboard at [http://localhost:3000](http://localhost:3000).

### Option B: Manual Setup

#### 1. Backend (FastAPI + SQLite/PostgreSQL)
```bash
cd backend
python -m venv venv
# Windows:
.\venv\Scripts\activate
# Linux/macOS:
source venv/bin/activate

pip install -r requirements.txt
python -m uvicorn app.main:app --host 127.0.0.1 --port 8000 --reload
```
- Swagger API Docs: [http://localhost:8000/docs](http://localhost:8000/docs)

#### 2. Frontend (Next.js 15 + Tailwind CSS)
```bash
cd frontend
npm install
npm run dev
```
- Web Application: [http://localhost:3000](http://localhost:3000)

---

## 🧪 3-Minute Demo Script

1. **Deterministic Reconciliation**:
   - Open [http://localhost:3000/returns](http://localhost:3000/returns).
   - Click **"Run 2B & IMS Reco"** to trigger the deterministic engine.
   - Inspect the real-time breakdown: 4 exact matches, 1 Rule 88D mismatch, ₹38,000 Section 17(5) reversal, and ₹3,37,500 Net Table 4(C) ITC.
   - Click **"Export Tally XML"** to download the TallyPrime import file.
2. **Four-Eyes Pre-Filing Review (Gate G6)**:
   - Open [http://localhost:3000/gates/G6-9845](http://localhost:3000/gates/G6-9845) to inspect the 38-rule compliance check, UDIN flag, and approve the return.
3. **Partner Class-3 DSC Signing (Gate G7)**:
   - Open [http://localhost:3000/gates/G7-9846](http://localhost:3000/gates/G7-9846) to simulate the USB token PIN entry, generating a SHA-256 PKCS#7 signature with volatile memory wipe.

---

## 📑 Specification & Documentation
- **Product Specification PDF**: [`docs/CA_Platform_Product_Specification.pdf`](./docs/CA_Platform_Product_Specification.pdf) — Complete 9-page publication-grade PDF covering all 18 gates, 38 return rules, IMS protocols, and the ICAI Disciplinary Shield.
- **Walkthrough Guide**: [`MVP_WALKTHROUGH_GUIDE.md`](./MVP_WALKTHROUGH_GUIDE.md)

---

## ⚖️ Legal & Regulatory Invariant
This platform does not file returns autonomously. In accordance with the Chartered Accountants Act, 1949 and ICAI Code of Ethics:
- All statutory filings require an explicit, un-delegated DSC signature by a practicing member holding a valid Certificate of Practice (CoP).
- Audit trails are cryptographically hashed and immutable under SQC 1 compliance.
