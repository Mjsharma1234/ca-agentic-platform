from dataclasses import dataclass
from datetime import date
from decimal import Decimal, ROUND_HALF_UP

@dataclass
class InterestResult:
    principal: Decimal
    rate: Decimal
    due_date: date
    payment_date: date
    days_delayed: int
    interest_amount: Decimal
    total_payable: Decimal

@dataclass
class LateFeeResult:
    return_type: str
    due_date: date
    filing_date: date
    days_delayed: int
    cgst_fee: Decimal
    sgst_fee: Decimal
    total_fee: Decimal
    is_capped: bool

@dataclass
class Rule37Result:
    itc_amount: Decimal
    invoice_date: date
    aging_days: int
    is_reversal_required: bool
    interest_amount: Decimal
    days_to_deadline: int
    alert_level: str

def calculate_sec50_interest(tax_amount: Decimal, due_date: date, payment_date: date, rate: Decimal = Decimal('18')) -> InterestResult:
    days_delayed = max(0, (payment_date - due_date).days)
    interest = (tax_amount * (rate / Decimal('100')) * Decimal(days_delayed) / Decimal('365')).quantize(Decimal('1'), rounding=ROUND_HALF_UP)
    return InterestResult(
        principal=tax_amount,
        rate=rate,
        due_date=due_date,
        payment_date=payment_date,
        days_delayed=days_delayed,
        interest_amount=interest,
        total_payable=tax_amount + interest
    )

def calculate_late_fee(return_type: str, filing_date: date, due_date: date, is_nil_return: bool = False) -> LateFeeResult:
    days_delayed = max(0, (filing_date - due_date).days)
    daily_fee = Decimal('20') if is_nil_return else Decimal('50')
    cap = Decimal('500') if is_nil_return else Decimal('5000')
    
    cgst_fee = min(Decimal(days_delayed) * daily_fee, cap)
    sgst_fee = min(Decimal(days_delayed) * daily_fee, cap)
    
    is_capped = cgst_fee == cap
    return LateFeeResult(
        return_type=return_type,
        due_date=due_date,
        filing_date=filing_date,
        days_delayed=days_delayed,
        cgst_fee=cgst_fee,
        sgst_fee=sgst_fee,
        total_fee=cgst_fee + sgst_fee,
        is_capped=is_capped
    )

def calculate_rule37_interest(itc_amount: Decimal, invoice_date: date, current_date: date) -> Rule37Result:
    aging_days = (current_date - invoice_date).days
    is_reversal = aging_days > 180
    days_to_deadline = max(0, 180 - aging_days)
    interest = Decimal('0')
    alert_level = 'GREEN'
    if is_reversal:
        delayed_days = aging_days - 180
        interest = (itc_amount * (Decimal('18') / Decimal('100')) * Decimal(delayed_days) / Decimal('365')).quantize(Decimal('1'), rounding=ROUND_HALF_UP)
        alert_level = 'RED'
    elif days_to_deadline <= 30:
        alert_level = 'YELLOW'
        
    return Rule37Result(
        itc_amount=itc_amount,
        invoice_date=invoice_date,
        aging_days=aging_days,
        is_reversal_required=is_reversal,
        interest_amount=interest,
        days_to_deadline=days_to_deadline,
        alert_level=alert_level
    )
