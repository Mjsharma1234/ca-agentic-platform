from dataclasses import dataclass
from decimal import Decimal

@dataclass
class AuditCapacity:
    current_count: int
    max_allowed: int
    remaining: int
    utilization_pct: float
    at_risk: bool

@dataclass
class BillingEstimate:
    task_breakup: dict
    subtotal: Decimal
    gst_on_fees: Decimal
    total: Decimal
    previous_dues: Decimal
    net_receivable: Decimal

def get_partner_audit_count(partner_id: str, financial_year: str) -> AuditCapacity:
    max_allowed = 60
    current_count = 45 # Mocked DB call
    remaining = max_allowed - current_count
    utilization_pct = (current_count / max_allowed) * 100
    
    return AuditCapacity(
        current_count=current_count,
        max_allowed=max_allowed,
        remaining=remaining,
        utilization_pct=utilization_pct,
        at_risk=remaining <= 5
    )

def calculate_client_fees(client_id: str, period: str, tasks_completed: list) -> BillingEstimate:
    subtotal = Decimal('15000') # Mocked
    gst = subtotal * Decimal('0.18')
    previous = Decimal('5000')
    
    return BillingEstimate(
        task_breakup={"GST Monthly": 15000},
        subtotal=subtotal,
        gst_on_fees=gst,
        total=subtotal + gst,
        previous_dues=previous,
        net_receivable=subtotal + gst + previous
    )
