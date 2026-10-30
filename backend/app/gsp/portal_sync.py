from datetime import datetime, date, timedelta
from typing import Dict, Any, List, Optional
from dataclasses import dataclass, field
from .client import GSPClient, GSPResponse

@dataclass
class FilingResult:
    success: bool
    arn: Optional[str] = None
    submitted_at: Optional[str] = None
    partner_id: Optional[str] = None
    return_type: Optional[str] = None
    gstin: Optional[str] = None
    period: Optional[str] = None
    error_code: Optional[str] = None
    error_message: Optional[str] = None
    raw: Dict[str, Any] = field(default_factory=dict)

class PortalSyncEngine:
    """
    High-level orchestrator interfacing GSP client responses with the CA Firm OS.
    Handles data normalization, automatic statutory date calculation, and idempotent filing.
    """
    def __init__(self, client: Optional[GSPClient] = None):
        self.client = client or GSPClient()

    def sync_client_gstr2b(self, gstin: str, period: str) -> List[Dict[str, Any]]:
        """Pulls and normalizes GSTR-2B feed for a given GSTIN and tax period."""
        resp = self.client.get_gstr2b(gstin, period)
        if not resp.success:
            return []

        raw_invoices = resp.data.get("b2b", [])
        normalized = []
        for inv in raw_invoices:
            normalized.append({
                "invoice_number": inv.get("invoice_number") or inv.get("inv_no"),
                "invoice_date": inv.get("invoice_date") or inv.get("date"),
                "supplier_gstin": inv.get("supplier_gstin"),
                "supplier_name": inv.get("supplier_name", "Supplier"),
                "taxable_value": float(inv.get("taxable_value", 0.0)),
                "cgst": float(inv.get("cgst", 0.0)),
                "sgst": float(inv.get("sgst", 0.0)),
                "igst": float(inv.get("igst", 0.0)),
                "total_tax": float(inv.get("cgst", 0.0)) + float(inv.get("sgst", 0.0)) + float(inv.get("igst", 0.0)),
                "itc_available": inv.get("itc_available", "Y") == "Y",
                "hsn": inv.get("hsn", "998311")
            })

        return normalized

    def sync_ims_dashboard(self, gstin: str, period: str) -> Dict[str, Any]:
        """Retrieves and summarizes IMS state for client inward vouchers."""
        resp = self.client.get_ims_data(gstin, period)
        if not resp.success:
            return {"status": "ERROR", "message": resp.error_message}
        return resp.data

    def check_all_filing_statuses(self, gstins: List[str], return_type: str, period: str) -> Dict[str, Any]:
        """Bulk polls GSTN filing status across a list of firm client GSTINs."""
        results = {}
        for g in gstins:
            resp = self.client.get_filing_status(g, return_type, period)
            results[g] = resp.data if resp.success else {"status": "NOT_FILED"}
        return results

    def file_return(
        self,
        gstin: str,
        period: str,
        return_type: str,
        payload_json: Dict[str, Any],
        dsc_signature: str,
        partner_id: str
    ) -> FilingResult:
        """Submits GSTR-1 or GSTR-3B return via GSP with partner DSC signature."""
        rt = return_type.upper()
        if "3B" in rt:
            resp = self.client.submit_gstr3b(gstin, period, payload_json, dsc_signature)
        else:
            resp = self.client.submit_gstr1(gstin, period, payload_json, dsc_signature)

        if not resp.success:
            return FilingResult(
                success=False,
                gstin=gstin,
                period=period,
                return_type=return_type,
                partner_id=partner_id,
                error_code=resp.error_code or "SUBMISSION_FAILED",
                error_message=resp.error_message or "Failed to file return via GSP gateway"
            )

        data = resp.data
        return FilingResult(
            success=True,
            arn=data.get("arn"),
            submitted_at=data.get("filed_at") or datetime.utcnow().isoformat(),
            partner_id=partner_id,
            return_type=return_type,
            gstin=gstin,
            period=period,
            raw=data
        )

    def get_due_dates(self, return_type: str, gstin: str) -> Dict[str, Any]:
        """Computes official statutory due dates and firm 3-day internal buffer dates."""
        today = date.today()
        if return_type.upper() == "GSTR-1":
            statutory_day = 11
        elif return_type.upper() == "GSTR-3B":
            statutory_day = 20
        else:
            statutory_day = 14

        statutory_date = date(today.year, today.month, statutory_day)
        internal_buffer = statutory_date - timedelta(days=3)

        return {
            "return_type": return_type,
            "statutory_due_date": statutory_date.isoformat(),
            "internal_buffer_date": internal_buffer.isoformat(),
            "days_remaining": (statutory_date - today).days,
            "is_within_buffer": today >= internal_buffer
        }
