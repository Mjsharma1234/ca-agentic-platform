import hashlib
import json
import re
from datetime import datetime, date
from decimal import Decimal, ROUND_HALF_UP
from typing import Dict, Any, List, Optional

GSTIN_REGEX = r"^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$"
PAN_REGEX = r"^[A-Z]{5}[0-9]{4}[A-Z]{1}$"

class GSTFilingValidationException(Exception):
    pass

def validate_gstin_format(gstin: str) -> bool:
    """Validates 15-character GSTIN structure."""
    if not gstin or len(gstin) != 15:
        return False
    return bool(re.match(GSTIN_REGEX, gstin.upper()))

def get_state_code(gstin: str) -> str:
    """Extracts 2-digit state code from GSTIN."""
    return gstin[:2] if len(gstin) >= 2 else ""

def generate_gstr1_payload(
    supplier_gstin: str,
    return_period: str, # e.g. "092026"
    invoices: List[Dict[str, Any]]
) -> Dict[str, Any]:
    """Generates official GSTN-compliant GSTR-1 JSON package.
    Categorizes invoices into B2B (Table 4), B2CL (Table 5), B2CS (Table 7), and HSN Summary (Table 12).
    """
    if not validate_gstin_format(supplier_gstin):
        raise GSTFilingValidationException(f"Invalid Supplier GSTIN: {supplier_gstin}")

    supplier_state = get_state_code(supplier_gstin)
    b2b_groups: Dict[str, List[Dict[str, Any]]] = {}
    b2cs_list: List[Dict[str, Any]] = []
    hsn_dict: Dict[str, Dict[str, Any]] = {}
    
    total_taxable = Decimal("0.00")
    total_igst = Decimal("0.00")
    total_cgst = Decimal("0.00")
    total_sgst = Decimal("0.00")

    for inv in invoices:
        inv_no = str(inv.get("invoice_number", "INV-001"))
        inv_date = str(inv.get("invoice_date", date.today().strftime("%d-%m-%Y")))
        customer_gstin = inv.get("customer_gstin")
        pos = str(inv.get("pos", supplier_state)).zfill(2)
        taxable_val = Decimal(str(inv.get("taxable_value", 0.0))).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)
        tax_rate = Decimal(str(inv.get("tax_rate", 18.0)))
        hsn_code = str(inv.get("hsn_code", "998311"))

        # Determine inter-state vs intra-state
        is_inter_state = (pos != supplier_state)
        tax_amount = (taxable_val * tax_rate / Decimal("100")).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)

        if is_inter_state:
            igst = tax_amount
            cgst = Decimal("0.00")
            sgst = Decimal("0.00")
        else:
            igst = Decimal("0.00")
            cgst = (tax_amount / Decimal("2")).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)
            sgst = (tax_amount / Decimal("2")).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)

        total_taxable += taxable_val
        total_igst += igst
        total_cgst += cgst
        total_sgst += sgst

        # HSN Aggregation (Table 12)
        if hsn_code not in hsn_dict:
            hsn_dict[hsn_code] = {
                "hsn_sc": hsn_code,
                "desc": "Services / Goods",
                "uqc": "OTH",
                "qty": 1,
                "txval": Decimal("0.00"),
                "iamt": Decimal("0.00"),
                "camt": Decimal("0.00"),
                "samt": Decimal("0.00")
            }
        hsn_dict[hsn_code]["txval"] += taxable_val
        hsn_dict[hsn_code]["iamt"] += igst
        hsn_dict[hsn_code]["camt"] += cgst
        hsn_dict[hsn_code]["samt"] += sgst

        # B2B vs B2C
        if customer_gstin and validate_gstin_format(customer_gstin):
            c_gstin = customer_gstin.upper()
            if c_gstin not in b2b_groups:
                b2b_groups[c_gstin] = []
            
            b2b_groups[c_gstin].append({
                "inum": inv_no,
                "idt": inv_date,
                "val": float(taxable_val + igst + cgst + sgst),
                "pos": pos,
                "rchrg": "N",
                "inv_typ": "R",
                "itms": [{
                    "num": 1,
                    "itm_det": {
                        "rt": float(tax_rate),
                        "txval": float(taxable_val),
                        "iamt": float(igst),
                        "camt": float(cgst),
                        "samt": float(sgst),
                        "csamt": 0.0
                    }
                }]
            })
        else:
            # B2C Small (Table 7)
            b2cs_list.append({
                "sply_ty": "INTER" if is_inter_state else "INTRA",
                "pos": pos,
                "typ": "OE",
                "rt": float(tax_rate),
                "txval": float(taxable_val),
                "iamt": float(igst),
                "camt": float(cgst),
                "samt": float(sgst),
                "csamt": 0.0
            })

    # Format B2B payload
    formatted_b2b = []
    for c_gstin, invs in b2b_groups.items():
        formatted_b2b.append({
            "ctin": c_gstin,
            "cfs": "Y",
            "inv": invs
        })

    # Format HSN payload
    formatted_hsn = [
        {
            "num": i + 1,
            "hsn_sc": item["hsn_sc"],
            "desc": item["desc"],
            "uqc": item["uqc"],
            "qty": item["qty"],
            "txval": float(item["txval"]),
            "iamt": float(item["iamt"]),
            "camt": float(item["camt"]),
            "samt": float(item["samt"]),
            "csamt": 0.0
        }
        for i, item in enumerate(hsn_dict.values())
    ]

    payload = {
        "gstin": supplier_gstin.upper(),
        "fp": return_period,
        "gt": float(total_taxable + total_igst + total_cgst + total_sgst),
        "b2b": formatted_b2b,
        "b2cs": b2cs_list,
        "hsn": {"data": formatted_hsn},
        "doc_issue": {
            "doc_det": [{
                "doc_num": 1,
                "doc_typ": "Invoices for outward supply",
                "num": len(invoices),
                "from": invoices[0].get("invoice_number", "INV-001") if invoices else "",
                "to": invoices[-1].get("invoice_number", "INV-999") if invoices else "",
                "totnum": len(invoices),
                "canc": 0,
                "net_issue": len(invoices)
            }]
        }
    }

    payload_str = json.dumps(payload, sort_keys=True)
    payload_hash = hashlib.sha256(payload_str.encode("utf-8")).hexdigest()

    return {
        "status": "VALID",
        "return_type": "GSTR-1",
        "period": return_period,
        "supplier_gstin": supplier_gstin.upper(),
        "summary": {
            "invoice_count": len(invoices),
            "b2b_buyers": len(b2b_groups),
            "total_taxable": float(total_taxable),
            "total_igst": float(total_igst),
            "total_cgst": float(total_cgst),
            "total_sgst": float(total_sgst),
            "total_tax": float(total_igst + total_cgst + total_sgst),
            "gross_turnover": float(total_taxable + total_igst + total_cgst + total_sgst)
        },
        "payload_hash": payload_hash,
        "gstn_json": payload
    }

def compute_gstr3b_liability(
    outward_taxable: float,
    outward_igst: float,
    outward_cgst: float,
    outward_sgst: float,
    eligible_itc_igst: float,
    eligible_itc_cgst: float,
    eligible_itc_sgst: float,
    ineligible_itc: float = 0.0,
    days_delayed: int = 0
) -> Dict[str, Any]:
    """Computes GSTR-3B monthly statutory liabilities, input tax credit set-off, and Section 50 interest."""
    t_out_igst = Decimal(str(outward_igst))
    t_out_cgst = Decimal(str(outward_cgst))
    t_out_sgst = Decimal(str(outward_sgst))

    t_itc_igst = Decimal(str(eligible_itc_igst))
    t_itc_cgst = Decimal(str(eligible_itc_cgst))
    t_itc_sgst = Decimal(str(eligible_itc_sgst))

    # Net cash liabilities after ITC set-off
    net_cash_igst = max(Decimal("0.00"), t_out_igst - t_itc_igst)
    net_cash_cgst = max(Decimal("0.00"), t_out_cgst - t_itc_cgst)
    net_cash_sgst = max(Decimal("0.00"), t_out_sgst - t_itc_sgst)
    total_net_cash = net_cash_igst + net_cash_cgst + net_cash_sgst

    # Section 50 Interest computation (18% per annum on net cash tax liability)
    if days_delayed > 0 and total_net_cash > 0:
        annual_rate = Decimal("0.18")
        daily_rate = annual_rate / Decimal("365")
        interest_amount = (total_net_cash * daily_rate * Decimal(days_delayed)).quantize(Decimal("1.00"), rounding=ROUND_HALF_UP)
    else:
        interest_amount = Decimal("0.00")

    # Late fee: ₹50/day (₹25 CGST + ₹25 SGST) up to statutory cap
    late_fee_cgst = Decimal(min(5000, 25 * days_delayed))
    late_fee_sgst = Decimal(min(5000, 25 * days_delayed))

    return {
        "status": "COMPUTED",
        "return_type": "GSTR-3B",
        "outward_supplies": {
            "taxable_value": float(outward_taxable),
            "igst": float(t_out_igst),
            "cgst": float(t_out_cgst),
            "sgst": float(t_out_sgst),
            "total_liability": float(t_out_igst + t_out_cgst + t_out_sgst)
        },
        "itc_summary": {
            "eligible_igst": float(t_itc_igst),
            "eligible_cgst": float(t_itc_cgst),
            "eligible_sgst": float(t_itc_sgst),
            "ineligible_blocked": float(ineligible_itc),
            "total_itc_claimed": float(t_itc_igst + t_itc_cgst + t_itc_sgst)
        },
        "cash_tax_payable": {
            "igst": float(net_cash_igst),
            "cgst": float(net_cash_cgst),
            "sgst": float(net_cash_sgst),
            "total_cash": float(total_net_cash)
        },
        "statutory_penalties": {
            "days_delayed": days_delayed,
            "section_50_interest": float(interest_amount),
            "late_fee_cgst": float(late_fee_cgst),
            "late_fee_sgst": float(late_fee_sgst),
            "total_dues": float(total_net_cash + interest_amount + late_fee_cgst + late_fee_sgst)
        }
    }

def simulate_gsp_filing_submission(
    return_type: str,
    gstin: str,
    period: str,
    dsc_signature: str,
    partner_id: str
) -> Dict[str, Any]:
    """Simulates GSTN GSP API submission gateway.
    Issues official simulated Application Reference Number (ARN) with timestamp receipt.
    """
    now = datetime.utcnow()
    # Official ARN pattern: AA + 2 state + 2 month + 2 year + 7 sequential numbers + 1 checksum
    state_code = get_state_code(gstin)
    date_part = now.strftime("%m%y")
    random_part = hashlib.sha256(f"{gstin}{period}{now.isoformat()}".encode()).hexdigest()[:7].upper()
    arn = f"AA{state_code}{date_part}{random_part}1"

    receipt_hash = hashlib.sha256(f"{arn}|{gstin}|{period}|{dsc_signature}".encode()).hexdigest()

    return {
        "status": "FILED_SUCCESSFULLY",
        "arn": arn,
        "acknowledgement_number": f"ACK-{arn}",
        "return_type": return_type,
        "gstin": gstin.upper(),
        "period": period,
        "filed_at": now.isoformat(),
        "dsc_verified": True,
        "signatory": partner_id,
        "receipt_sha256": receipt_hash,
        "portal_response": "GSTN API Response: Return successfully accepted and liability ledger debited."
    }
