# CA Firm OS: Internal Ops Tracker & Autonomous Filings Platform

> **Core Invariant**: *"The Machine Prepares. The Professional Decides."*  
> An autonomous operations tracker and deterministic compliance orchestrator built specifically for Indian Chartered Accountant firms, enforcing strict ICAI SQC 1 governance, ethical walls, four-eyes reviews, and Class-3 DSC cryptographic signing.

[![Python](https://img.shields.io/badge/Python-3.11+-blue.svg)](https://www.python.org/)
[![FastAPI](https://img.shields.io/badge/FastAPI-0.110+-green.svg)](https://fastapi.tiangolo.com/)
[![SQLite/Postgres](https://img.shields.io/badge/SQLAlchemy-2.0+-red.svg)](https://www.sqlalchemy.org/)
[![ICAI SQC 1 Compliant](https://img.shields.io/badge/ICAI-SQC%201%20Compliant-orange.svg)](https://www.icai.org/)

---

## 🏛️ Platform Architecture: 3 Strata Model

```
┌────────────────────────────────────────────────────────────────────────┐
│                        STRATUM 3: HUMAN GOVERNANCE                     │
│  G1 Chase │ G2 OCR Audit │ G3 IMS Commit │ G4 Reco │ G6 Four-Eyes │ G7 DSC │
└────────────────────────────────────┬───────────────────────────────────┘
                                     │ Approved Decisions Only
┌────────────────────────────────────▼───────────────────────────────────┐
│                     STRATUM 2: AGENTIC ORCHESTRATION                    │
│   19 Autonomous Agents (IN-1..4, GS-1..6, DT-1..4, PY-1, CO-1, AU-1..2)│
│   Level 1 Advisory Extraction & Level 2 Deterministic Return Assembly │
└────────────────────────────────────┬───────────────────────────────────┘
                                     │ Deterministic Function Calls Only
┌────────────────────────────────────▼───────────────────────────────────┐
│                      STRATUM 1: DETERMINISTIC CORE                     │
│   • 6-Pass 2B Reco Engine       • 38 Return Verification Rules         │
│   • Rule 88C/88D Variance Calc  • Sec 17(5) Blocked Reversal & Table 4 │
│   • TallyPrime XML Bridge       • SHA-256 PKCS#7 DSC Signing Ceremony  │
└────────────────────────────────────────────────────────────────────────┘
```

---

## 🚀 Key Modules & Capabilities

### 1. Internal Ops Tracker
- **The Line**: 6-stage pipeline (`Documents Pending` → `Intake & OCR` → `Reconciliation` → `Review` → `Signing` → `Filed & Acknowledged`).
- **Partner's 09:00 Morning Brief**: Automated daily briefing on WhatsApp/Web summarizing overnight portal messages, overdue notices, high-value gate items, and staff capacity.
- **Daybook**: Sealed, daily immutable operational diary of everything done across the firm.
- **Statutory Clock**: Real-time regulatory countdown with 3-day internal safety buffers across 12 compliance domains.
- **Notice Desk**: Structured tax notice response pipeline (DRC-01, DRC-01A, ASMT-10, Sec 148, Sec 143(1)) with mandatory 5-day hearing buffers.
- **Team & Capacity (CEILING-60)**: Workload tracking, attendance, timesheets, and strict adherence to the ICAI 60-tax-audit ceiling per partner.
- **Billing & Recovery**: WIP tracking, draft invoice generation from finished work, fee collection, and rebillable client expense reimbursement.

### 2. Autonomous Filing Fleet (12 Statutory Domains)
- **GST**: GSTR-1, IFF, GSTR-1A, GSTR-3B, PMT-06, CMP-08, GSTR-4, GSTR-9/9C.
- **Income Tax**: ITR-1 to ITR-7, Form 3CA/3CB-3CD (Tax Audit), 10B/10BB.
- **TDS / TCS**: 24Q, 26Q, 27Q, 27EQ with automated FVU schema validation.
- **Companies (MCA V3)**: AOC-4, MGT-7/7A, DIR-3 KYC, DPT-3, MSME-1.
- **LLP**: Form 8, Form 11, FiLLiP.
- **Payroll & Labour**: EPF ECR, ESI Monthly, State Professional Tax (PT).
- **Books & Close**: Monthly close, trial balance, and two-way TallyPrime XML sync.
- **FEMA, SEBI & Certifications**: FLA return, LODR filings, and UDIN-backed certificates.

### 3. Production Backend APIs (`/api/v1/firm-os`)
- `GET /api/v1/firm-os/state`: Persistent firm state loaded from SQLite/PostgreSQL.
- `POST /api/v1/firm-os/state/sync`: Two-way state synchronization with SHA-256 integrity hash.
- `POST /api/v1/firm-os/gates/{gate_code}/decide`: Production gate engine enforcing four-eyes reviews, role hierarchy (MP, PT, MG, SA), and transaction limits.
- `POST /api/v1/firm-os/dsc/sign`: Partner Class-3 DSC USB token signing ceremony with immediate volatile memory wipe of PIN.
- `POST /api/v1/firm-os/reconciliation/run`: Deterministic 6-pass reconciliation engine.
- `GET /api/v1/firm-os/export/tally-xml`: Downloadable TallyPrime XML import payload.
- `GET /api/v1/firm-os/audit-trail`: Immutable SHA-256 hash-chained audit ledger for ICAI peer review.

---

## ⚡ Quick Start

### 1-Click Launch (Windows)
Double-click [`start_mvp.bat`](./start_mvp.bat) or run `.\start_mvp.ps1` in PowerShell.  
This starts the unified FastAPI production backend and opens the dashboard at:
👉 **[http://localhost:8000](http://localhost:8000)**

### Interactive Documentation
- **CA Firm OS Dashboard**: [http://localhost:8000](http://localhost:8000)
- **Swagger API Docs**: [http://localhost:8000/docs](http://localhost:8000/docs)
- **Health Check**: [http://localhost:8000/health](http://localhost:8000/health)

### Running Automated Test Suite
```bash
python -m pytest ca-agentic-platform/backend/tests
```
*Current test suite: 34 tests passing (100% pass rate).*
