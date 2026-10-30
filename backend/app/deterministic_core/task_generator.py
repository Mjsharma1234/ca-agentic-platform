import re
from datetime import date, timedelta
from typing import Dict, Any, List, Optional
from dataclasses import dataclass, asdict

PAN_REGEX = r"^[A-Z]{5}[0-9]{4}[A-Z]{1}$"
GSTIN_REGEX = r"^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$"

@dataclass
class GeneratedTask:
    id: str
    client_id: str
    client_name: str
    domain: str        # GST, ITX, TDS, ROC, AUDIT
    form_id: str       # GSTR-3B, GSTR-1, 26Q, ITR-6, 3CD, AOC-4, etc.
    title: str
    period: str        # e.g. "Oct 2026", "Q2 FY 2026-27"
    statutory_due_date: str # YYYY-MM-DD
    internal_buffer_date: str # statutory_date - 3 days
    assigned_partner: str
    state: str = "scheduled" # scheduled, awaiting, preparing, review, signed, filed
    frequency: str = "Monthly"
    act_reference: str = ""
    is_critical: bool = True

class ProfileTaskGenerator:
    """
    Deterministic rule engine that automatically analyzes a client's statutory profile
    (constitution, GST registration, composition flag, turnover, PAN) and instantiates
    their statutory compliance obligations.
    """

    @staticmethod
    def generate_tasks_for_client(client: Dict[str, Any], filing_year: Optional[int] = None) -> List[GeneratedTask]:
        today = date.today()
        year = filing_year or today.year
        month = today.month

        client_id = str(client.get("id", "c1"))
        client_name = str(client.get("name") or client.get("client_name", "Corporate Client"))
        pan = str(client.get("pan", "")).upper()
        gstin = str(client.get("gstin", "")).upper()
        client_type = str(client.get("type") or client.get("client_type", "Private Limited")).title()
        turnover = float(client.get("turnover") or client.get("annual_turnover", 0.0))
        is_composition = bool(client.get("is_composition", False))
        partner = str(client.get("assignedPartner") or client.get("assigned_partner", "CA Amit Sharma"))

        tasks: List[GeneratedTask] = []
        month_str = today.strftime("%b %Y") # e.g. "Oct 2026"

        # ----------------------------------------------------------------------
        # 1. GST DOMAIN TASKS (Triggered if client has a valid GSTIN)
        # ----------------------------------------------------------------------
        has_gst = bool(gstin and re.match(GSTIN_REGEX, gstin))
        if has_gst:
            state_code = gstin[:2]
            
            # GSTR-1 (Outward Supplies)
            g1_due = date(year, month, 11)
            tasks.append(GeneratedTask(
                id=f"TASK-GST-G1-{client_id}-{year}{month:02d}",
                client_id=client_id,
                client_name=client_name,
                domain="GST",
                form_id="GSTR-1",
                title=f"GSTR-1 Outward Supply Return ({month_str})",
                period=month_str,
                statutory_due_date=g1_due.isoformat(),
                internal_buffer_date=(g1_due - timedelta(days=3)).isoformat(),
                assigned_partner=partner,
                frequency="Monthly",
                act_reference="CGST Act, 2017 Section 37",
                is_critical=True
            ))

            # IMS Review (Invoice Management System - 14th cutoff)
            ims_due = date(year, month, 14)
            tasks.append(GeneratedTask(
                id=f"TASK-GST-IMS-{client_id}-{year}{month:02d}",
                client_id=client_id,
                client_name=client_name,
                domain="GST",
                form_id="IMS-INWARD",
                title=f"IMS Inward Voucher Commit ({month_str})",
                period=month_str,
                statutory_due_date=ims_due.isoformat(),
                internal_buffer_date=(ims_due - timedelta(days=2)).isoformat(),
                assigned_partner=partner,
                frequency="Monthly",
                act_reference="GSTN IMS Framework / Rule 36(4)",
                is_critical=True
            ))

            # GSTR-3B (Summary Return & Tax Settlement) or CMP-08 for Composition
            if is_composition:
                cmp_due = date(year, month, 18)
                tasks.append(GeneratedTask(
                    id=f"TASK-GST-CMP08-{client_id}-{year}{month:02d}",
                    client_id=client_id,
                    client_name=client_name,
                    domain="GST",
                    form_id="CMP-08",
                    title=f"CMP-08 Composition Statement ({month_str})",
                    period=month_str,
                    statutory_due_date=cmp_due.isoformat(),
                    internal_buffer_date=(cmp_due - timedelta(days=3)).isoformat(),
                    assigned_partner=partner,
                    frequency="Quarterly",
                    act_reference="CGST Rules, 2017 Rule 62",
                    is_critical=True
                ))
            else:
                g3b_due = date(year, month, 20)
                tasks.append(GeneratedTask(
                    id=f"TASK-GST-G3B-{client_id}-{year}{month:02d}",
                    client_id=client_id,
                    client_name=client_name,
                    domain="GST",
                    form_id="GSTR-3B",
                    title=f"GSTR-3B Monthly Return & Tax Settlement ({month_str})",
                    period=month_str,
                    statutory_due_date=g3b_due.isoformat(),
                    internal_buffer_date=(g3b_due - timedelta(days=3)).isoformat(),
                    assigned_partner=partner,
                    frequency="Monthly",
                    act_reference="CGST Act, 2017 Section 39",
                    is_critical=True
                ))

            # Annual Return GSTR-9 (Mandatory if turnover > Rs. 2 Crore)
            if turnover >= 20000000:
                g9_due = date(year, 12, 31)
                tasks.append(GeneratedTask(
                    id=f"TASK-GST-G9-{client_id}-{year}",
                    client_id=client_id,
                    client_name=client_name,
                    domain="GST",
                    form_id="GSTR-9",
                    title=f"GSTR-9 Annual Return (FY {year-1}-{str(year)[2:]})",
                    period=f"FY {year-1}-{str(year)[2:]}",
                    statutory_due_date=g9_due.isoformat(),
                    internal_buffer_date=(g9_due - timedelta(days=5)).isoformat(),
                    assigned_partner=partner,
                    frequency="Annual",
                    act_reference="CGST Act, 2017 Section 44",
                    is_critical=True
                ))

            # Reconciliation Statement GSTR-9C (Mandatory if turnover > Rs. 5 Crore)
            if turnover >= 50000000:
                g9c_due = date(year, 12, 31)
                tasks.append(GeneratedTask(
                    id=f"TASK-GST-G9C-{client_id}-{year}",
                    client_id=client_id,
                    client_name=client_name,
                    domain="GST",
                    form_id="GSTR-9C",
                    title=f"GSTR-9C Reconciliation Statement (FY {year-1}-{str(year)[2:]})",
                    period=f"FY {year-1}-{str(year)[2:]}",
                    statutory_due_date=g9c_due.isoformat(),
                    internal_buffer_date=(g9c_due - timedelta(days=5)).isoformat(),
                    assigned_partner=partner,
                    frequency="Annual",
                    act_reference="CGST Act, 2017 Section 44(2)",
                    is_critical=True
                ))

        # ----------------------------------------------------------------------
        # 2. TDS DOMAIN TASKS (Corporate, Partnership or Turnover > Rs. 1 Crore)
        # ----------------------------------------------------------------------
        is_corporate_or_firm = any(k in client_type.lower() for k in ["company", "limited", "pvt", "llp", "partnership"])
        if is_corporate_or_firm or turnover >= 10000000:
            # Monthly TDS Payment (Challan 281 - due 7th)
            tds_pay_due = date(year, month, 7)
            tasks.append(GeneratedTask(
                id=f"TASK-TDS-PAY-{client_id}-{year}{month:02d}",
                client_id=client_id,
                client_name=client_name,
                domain="TDS",
                form_id="Challan-281",
                title=f"TDS/TCS Monthly Tax Deposit ({month_str})",
                period=month_str,
                statutory_due_date=tds_pay_due.isoformat(),
                internal_buffer_date=(tds_pay_due - timedelta(days=3)).isoformat(),
                assigned_partner=partner,
                frequency="Monthly",
                act_reference="Income Tax Act, 1961 Section 200(1)",
                is_critical=True
            ))

            # Quarterly TDS Return (Form 26Q)
            q_month = 10 if month <= 9 else (1 if month <= 12 else 4)
            q_year = year if month <= 9 else year + 1
            t_26q_due = date(q_year, q_month, 31)
            tasks.append(GeneratedTask(
                id=f"TASK-TDS-26Q-{client_id}-{year}-Q2",
                client_id=client_id,
                client_name=client_name,
                domain="TDS",
                form_id="Form-26Q",
                title="Form 26Q Quarterly Non-Salary TDS Return",
                period=f"Q2 FY {year}-{str(year+1)[2:]}",
                statutory_due_date=t_26q_due.isoformat(),
                internal_buffer_date=(t_26q_due - timedelta(days=4)).isoformat(),
                assigned_partner=partner,
                frequency="Quarterly",
                act_reference="Income Tax Rules, 1962 Rule 31A",
                is_critical=True
            ))

        # ----------------------------------------------------------------------
        # 3. CORPORATE & ROC DOMAIN TASKS (Companies & LLPs)
        # ----------------------------------------------------------------------
        if "company" in client_type.lower() or "limited" in client_type.lower() or "pvt" in client_type.lower():
            # Form AOC-4 (Financial Statements Filing)
            aoc_due = date(year, 10, 29)
            tasks.append(GeneratedTask(
                id=f"TASK-ROC-AOC4-{client_id}-{year}",
                client_id=client_id,
                client_name=client_name,
                domain="ROC",
                form_id="AOC-4",
                title=f"MCA Form AOC-4 Financial Statements (FY {year-1}-{str(year)[2:]})",
                period=f"FY {year-1}-{str(year)[2:]}",
                statutory_due_date=aoc_due.isoformat(),
                internal_buffer_date=(aoc_due - timedelta(days=4)).isoformat(),
                assigned_partner=partner,
                frequency="Annual",
                act_reference="Companies Act, 2013 Section 137",
                is_critical=True
            ))

            # Form MGT-7 (Annual Return)
            mgt_due = date(year, 11, 28)
            tasks.append(GeneratedTask(
                id=f"TASK-ROC-MGT7-{client_id}-{year}",
                client_id=client_id,
                client_name=client_name,
                domain="ROC",
                form_id="MGT-7",
                title=f"MCA Form MGT-7 Annual Return (FY {year-1}-{str(year)[2:]})",
                period=f"FY {year-1}-{str(year)[2:]}",
                statutory_due_date=mgt_due.isoformat(),
                internal_buffer_date=(mgt_due - timedelta(days=4)).isoformat(),
                assigned_partner=partner,
                frequency="Annual",
                act_reference="Companies Act, 2013 Section 92",
                is_critical=True
            ))

            # DIR-3 KYC (Director KYC)
            dir_due = date(year, 9, 30)
            tasks.append(GeneratedTask(
                id=f"TASK-ROC-DIR3-{client_id}-{year}",
                client_id=client_id,
                client_name=client_name,
                domain="ROC",
                form_id="DIR-3-KYC",
                title="Annual Director KYC Verification",
                period=f"FY {year-1}-{str(year)[2:]}",
                statutory_due_date=dir_due.isoformat(),
                internal_buffer_date=(dir_due - timedelta(days=3)).isoformat(),
                assigned_partner=partner,
                frequency="Annual",
                act_reference="Companies (Appointment of Directors) Rules, 2014",
                is_critical=False
            ))

        elif "llp" in client_type.lower():
            # LLP Form 8 & Form 11
            f8_due = date(year, 10, 30)
            tasks.append(GeneratedTask(
                id=f"TASK-ROC-LLP8-{client_id}-{year}",
                client_id=client_id,
                client_name=client_name,
                domain="ROC",
                form_id="Form-8-LLP",
                title=f"LLP Form 8 Statement of Account & Solvency",
                period=f"FY {year-1}-{str(year)[2:]}",
                statutory_due_date=f8_due.isoformat(),
                internal_buffer_date=(f8_due - timedelta(days=3)).isoformat(),
                assigned_partner=partner,
                frequency="Annual",
                act_reference="LLP Act, 2008 Section 34",
                is_critical=True
            ))

        # ----------------------------------------------------------------------
        # 4. INCOME TAX & TAX AUDIT DOMAIN TASKS
        # ----------------------------------------------------------------------
        requires_audit = turnover >= 10000000 or ("company" in client_type.lower())
        if requires_audit:
            # Form 3CD Tax Audit Report
            audit_due = date(year, 9, 30)
            tasks.append(GeneratedTask(
                id=f"TASK-AUDIT-3CD-{client_id}-{year}",
                client_id=client_id,
                client_name=client_name,
                domain="AUDIT",
                form_id="Form-3CD",
                title=f"Tax Audit Report Form 3CD / 3CA (AY {year}-{str(year+1)[2:]})",
                period=f"AY {year}-{str(year+1)[2:]}",
                statutory_due_date=audit_due.isoformat(),
                internal_buffer_date=(audit_due - timedelta(days=5)).isoformat(),
                assigned_partner=partner,
                frequency="Annual",
                act_reference="Income Tax Act, 1961 Section 44AB",
                is_critical=True
            ))

            # Corporate / Audited ITR
            itr_due = date(year, 10, 31)
            itr_form = "ITR-6" if "company" in client_type.lower() else "ITR-5"
            tasks.append(GeneratedTask(
                id=f"TASK-ITX-{itr_form}-{client_id}-{year}",
                client_id=client_id,
                client_name=client_name,
                domain="ITX",
                form_id=itr_form,
                title=f"Income Tax Return {itr_form} (Corporate/Audit)",
                period=f"AY {year}-{str(year+1)[2:]}",
                statutory_due_date=itr_due.isoformat(),
                internal_buffer_date=(itr_due - timedelta(days=5)).isoformat(),
                assigned_partner=partner,
                frequency="Annual",
                act_reference="Income Tax Act, 1961 Section 139(1)",
                is_critical=True
            ))
        else:
            # Non-Audit ITR (Individual, Proprietorship, Small Firm)
            itr_due = date(year, 7, 31)
            tasks.append(GeneratedTask(
                id=f"TASK-ITX-NONAUDIT-{client_id}-{year}",
                client_id=client_id,
                client_name=client_name,
                domain="ITX",
                form_id="ITR-3/4",
                title=f"Income Tax Return (Non-Audit Individual/Firm)",
                period=f"AY {year}-{str(year+1)[2:]}",
                statutory_due_date=itr_due.isoformat(),
                internal_buffer_date=(itr_due - timedelta(days=5)).isoformat(),
                assigned_partner=partner,
                frequency="Annual",
                act_reference="Income Tax Act, 1961 Section 139(1)",
                is_critical=True
            ))

        return tasks
