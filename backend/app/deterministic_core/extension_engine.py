import hashlib
from datetime import datetime, date, timedelta
from typing import Dict, Any, List, Optional
from dataclasses import dataclass, asdict

@dataclass
class ExtensionNotification:
    id: str
    notification_number: str   # e.g. "CBIC Notification No. 28/2026-Central Tax"
    issuing_authority: str     # CBIC / CBDT / MCA
    domain: str                # GST / ITX / TDS / ROC
    form_id: str               # GSTR-3B, GSTR-1, ITR-6, etc.
    period: str                # "Oct 2026" or "2026-10" or "All"
    original_due_date: str     # YYYY-MM-DD
    extended_due_date: str     # YYYY-MM-DD
    days_extended: int
    reason: str
    official_circular_url: str
    issued_at: str
    is_active: bool = True

INITIAL_EXTENSIONS = [
    ExtensionNotification(
        id="EXT-2026-CBIC-28",
        notification_number="Notification No. 28/2026 - Central Tax",
        issuing_authority="Central Board of Indirect Taxes and Customs (CBIC)",
        domain="GST",
        form_id="GSTR-3B",
        period="Oct 2026",
        original_due_date="2026-10-20",
        extended_due_date="2026-10-25",
        days_extended=5,
        reason="GSTN Common Portal technical latency during peak filing hours and regional holidays",
        official_circular_url="https://taxinformation.cbic.gov.in/notifications/28-2026-ct.pdf",
        issued_at="2026-10-18T14:30:00Z",
        is_active=True
    ),
    ExtensionNotification(
        id="EXT-2026-CBDT-44",
        notification_number="Circular No. 14/2026 - Income Tax",
        issuing_authority="Central Board of Direct Taxes (CBDT)",
        domain="AUDIT",
        form_id="Form-3CD",
        period="AY 2026-27",
        original_due_date="2026-09-30",
        extended_due_date="2026-10-07",
        days_extended=7,
        reason="Representations from ICAI and trade bodies regarding portal schema adjustments",
        official_circular_url="https://incometaxindia.gov.in/circulars/circular-14-2026.pdf",
        issued_at="2026-09-27T17:00:00Z",
        is_active=True
    )
]

class GovernmentExtensionEngine:
    """
    Automated Regulatory Due Date Re-dating Engine (Statutory Compliance).
    When government departments issue official deadline extension notifications (CBIC / CBDT / MCA),
    this engine automatically updates all open client compliance obligations, recalculates the
    mandatory 3-day internal CA safety buffer, and creates an immutable cryptographic audit record.
    """
    def __init__(self):
        self.extensions: Dict[str, ExtensionNotification] = {
            e.id: e for e in INITIAL_EXTENSIONS
        }

    def list_active_extensions(self) -> List[Dict[str, Any]]:
        return [asdict(e) for e in self.extensions.values() if e.is_active]

    def register_extension(
        self,
        notification_number: str,
        issuing_authority: str,
        domain: str,
        form_id: str,
        period: str,
        original_due_date: str,
        extended_due_date: str,
        reason: str,
        circular_url: Optional[str] = None
    ) -> Dict[str, Any]:
        """Registers a new government extension notification."""
        d1 = datetime.strptime(original_due_date, "%Y-%m-%d").date()
        d2 = datetime.strptime(extended_due_date, "%Y-%m-%d").date()
        days_extended = (d2 - d1).days

        ext_id = f"EXT-{domain}-{form_id}-{datetime.utcnow().strftime('%y%m%d%H%M')}"
        ext = ExtensionNotification(
            id=ext_id,
            notification_number=notification_number,
            issuing_authority=issuing_authority,
            domain=domain.upper(),
            form_id=form_id.upper(),
            period=period,
            original_due_date=original_due_date,
            extended_due_date=extended_due_date,
            days_extended=days_extended,
            reason=reason,
            official_circular_url=circular_url or "https://cbic.gov.in",
            issued_at=datetime.utcnow().isoformat() + "Z",
            is_active=True
        )
        self.extensions[ext.id] = ext
        return asdict(ext)

    def apply_extension_to_tasks(
        self,
        tasks: List[Dict[str, Any]],
        extension_id: str
    ) -> Dict[str, Any]:
        """
        Re-dates all matching open obligations to the new extended due date
        and moves the internal 3-day buffer forward.
        """
        ext = self.extensions.get(extension_id)
        if not ext:
            raise ValueError(f"Extension ID '{extension_id}' not found.")

        ext_due_date = datetime.strptime(ext.extended_due_date, "%Y-%m-%d").date()
        new_internal_buffer = ext_due_date - timedelta(days=3)

        re_dated_tasks = []
        for t in tasks:
            t_domain = str(t.get("domain", "")).upper()
            t_form = str(t.get("form_id", "")).upper()
            t_state = str(t.get("state", "scheduled")).lower()

            # Skip completed or filed returns
            if t_state in ["filed", "acknowledged"]:
                continue

            # Match criteria: same domain and form (or general matching)
            matches_domain = (t_domain == ext.domain) or (ext.domain == "GST" and "GST" in t_domain)
            matches_form = (t_form == ext.form_id) or (ext.form_id in t_form)
            
            if matches_domain and matches_form:
                old_due = t.get("statutory_due_date")
                t["statutory_due_date"] = ext.extended_due_date
                t["internal_buffer_date"] = new_internal_buffer.isoformat()
                t["extension_applied"] = {
                    "notification": ext.notification_number,
                    "previous_due_date": old_due,
                    "new_due_date": ext.extended_due_date,
                    "extended_by_days": ext.days_extended,
                    "reason": ext.reason,
                    "applied_at": datetime.utcnow().isoformat()
                }
                re_dated_tasks.append({
                    "task_id": t.get("id"),
                    "client_id": t.get("client_id"),
                    "client_name": t.get("client_name"),
                    "form_id": t_form,
                    "previous_due_date": old_due,
                    "new_statutory_due_date": ext.extended_due_date,
                    "new_internal_safe_date": new_internal_buffer.isoformat()
                })

        # Generate cryptographic audit ledger record
        audit_payload = {
            "extension_id": ext.id,
            "notification": ext.notification_number,
            "tasks_updated_count": len(re_dated_tasks),
            "extended_due_date": ext.extended_due_date,
            "timestamp": datetime.utcnow().isoformat()
        }
        audit_hash = hashlib.sha256(str(audit_payload).encode()).hexdigest()

        return {
            "status": "DUE_DATES_RE_DATED_SUCCESSFULLY",
            "extension": asdict(ext),
            "tasks_updated_count": len(re_dated_tasks),
            "audit_hash": audit_hash,
            "re_dated_tasks": re_dated_tasks
        }

# Global singleton engine
extension_engine = GovernmentExtensionEngine()
