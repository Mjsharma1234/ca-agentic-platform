import re
from typing import List, Dict, Any, Tuple
from decimal import Decimal
from dataclasses import dataclass, asdict

BLOCKED_17_5_KEYWORDS = [
    "motor vehicle", "car", "passenger vehicle",
    "food", "beverage", "catering", "restaurant",
    "beauty", "cosmetic", "health club", "gym", "fitness",
    "life insurance", "health insurance",
    "gift", "free sample", "personal consumption", "club membership"
]

def normalize_inv_number(inv: str) -> str:
    """Normalize invoice number by stripping special chars, slashes, and leading zeros."""
    if not inv:
        return ""
    clean = re.sub(r'[^A-Za-z0-9]', '', str(inv)).upper()
    return clean.lstrip('0')

@dataclass
class MatchResult:
    invoice_id: str
    invoice_number: str
    supplier_gstin: str
    supplier_name: str
    invoice_date: str
    taxable_value: float
    cgst: float
    sgst: float
    igst: float
    total_tax: float
    match_status: str  # EXACT_MATCH, FUZZY_MATCH, VALUE_MISMATCH, IN_BOOKS_NOT_IN_2B, IN_2B_NOT_IN_BOOKS
    ims_status: str    # ACCEPTED, REJECTED, PENDING
    is_blocked_17_5: bool
    blocked_reason: str
    variance_amount: float
    gstr2b_ref: Dict[str, Any]

def check_17_5_blocked(item_desc: str, hsn: str = "") -> Tuple[bool, str]:
    """Deterministically checks if an invoice item falls under Section 17(5) blocked credits."""
    desc = (item_desc or "").lower()
    for kw in BLOCKED_17_5_KEYWORDS:
        if kw in desc:
            return True, f"Blocked under Section 17(5): matches '{kw}'"
    # Specific HSN chapters for passenger vehicles (8702, 8703)
    if hsn and (hsn.startswith("8702") or hsn.startswith("8703")):
        return True, "Blocked under Section 17(5)(a): Motor vehicles for transportation of persons"
    return False, ""

def reconcile_books_with_gstr2b(books_invoices: List[Dict[str, Any]], gstr2b_invoices: List[Dict[str, Any]]) -> Dict[str, Any]:
    """
    Executes a high-precision multi-pass reconciliation between Books (Purchase Register)
    and GSTR-2B / IMS inward feeds.
    """
    results: List[MatchResult] = []
    matched_2b_indices = set()
    
    total_books_itc = Decimal("0.00")
    total_2b_itc = Decimal("0.00")
    total_matched_itc = Decimal("0.00")
    total_blocked_itc = Decimal("0.00")
    total_in_books_only_itc = Decimal("0.00")

    # Pass 1 & Pass 2: Match each invoice in Books against 2B
    for inv in books_invoices:
        inv_no = str(inv.get("invoice_number", ""))
        norm_inv = normalize_inv_number(inv_no)
        gstin = str(inv.get("supplier_gstin", "")).strip().upper()
        taxable = float(inv.get("taxable_value", 0.0))
        cgst = float(inv.get("cgst", 0.0))
        sgst = float(inv.get("sgst", 0.0))
        igst = float(inv.get("igst", 0.0))
        tax = cgst + sgst + igst
        total_books_itc += Decimal(str(tax))

        is_blocked, blocked_reason = check_17_5_blocked(
            inv.get("goods_description", "") or inv.get("supplier_name", ""),
            inv.get("hsn_code", "")
        )
        if is_blocked:
            total_blocked_itc += Decimal(str(tax))

        best_match_idx = None
        match_type = None
        var_amt = 0.0

        for idx, g2b in enumerate(gstr2b_invoices):
            if idx in matched_2b_indices:
                continue
            g2b_gstin = str(g2b.get("supplier_gstin", "")).strip().upper()
            g2b_inv_no = str(g2b.get("invoice_number", ""))
            g2b_norm_inv = normalize_inv_number(g2b_inv_no)
            g2b_taxable = float(g2b.get("taxable_value", 0.0))
            g2b_tax = float(g2b.get("cgst", 0.0)) + float(g2b.get("sgst", 0.0)) + float(g2b.get("igst", 0.0))

            if gstin == g2b_gstin:
                # Check Exact Match
                if inv_no.upper() == g2b_inv_no.upper() and abs(taxable - g2b_taxable) <= 1.0:
                    best_match_idx = idx
                    match_type = "EXACT_MATCH"
                    break
                # Check Normalized / Fuzzy Match
                elif norm_inv and norm_inv == g2b_norm_inv and abs(taxable - g2b_taxable) <= 1.0:
                    best_match_idx = idx
                    match_type = "FUZZY_MATCH"
                    break
                # Check Value Mismatch
                elif (inv_no.upper() == g2b_inv_no.upper() or norm_inv == g2b_norm_inv):
                    best_match_idx = idx
                    match_type = "VALUE_MISMATCH"
                    var_amt = abs(tax - g2b_tax)
                    break

        if best_match_idx is not None:
            matched_2b_indices.add(best_match_idx)
            g2b_ref = gstr2b_invoices[best_match_idx]
            ims_status = "REJECTED" if is_blocked else ("PENDING" if match_type == "VALUE_MISMATCH" else "ACCEPTED")
            if match_type in ["EXACT_MATCH", "FUZZY_MATCH"] and not is_blocked:
                total_matched_itc += Decimal(str(tax))
            
            results.append(MatchResult(
                invoice_id=str(inv.get("id", "")),
                invoice_number=inv_no,
                supplier_gstin=gstin,
                supplier_name=inv.get("supplier_name", ""),
                invoice_date=inv.get("invoice_date", ""),
                taxable_value=taxable,
                cgst=cgst,
                sgst=sgst,
                igst=igst,
                total_tax=tax,
                match_status=match_type,
                ims_status=ims_status,
                is_blocked_17_5=is_blocked,
                blocked_reason=blocked_reason,
                variance_amount=var_amt,
                gstr2b_ref=g2b_ref
            ))
        else:
            # Invoice in Books, missing in GSTR-2B
            total_in_books_only_itc += Decimal(str(tax))
            results.append(MatchResult(
                invoice_id=str(inv.get("id", "")),
                invoice_number=inv_no,
                supplier_gstin=gstin,
                supplier_name=inv.get("supplier_name", ""),
                invoice_date=inv.get("invoice_date", ""),
                taxable_value=taxable,
                cgst=cgst,
                sgst=sgst,
                igst=igst,
                total_tax=tax,
                match_status="IN_BOOKS_NOT_IN_2B",
                ims_status="PENDING",
                is_blocked_17_5=is_blocked,
                blocked_reason="Missing in supplier GSTR-1/2B; Credit locked under Sec 16(2)(aa)" if not is_blocked else blocked_reason,
                variance_amount=tax,
                gstr2b_ref={}
            ))

    # Pass 3: Check remaining entries in 2B that are NOT in Books
    for idx, g2b in enumerate(gstr2b_invoices):
        g2b_tax = float(g2b.get("cgst", 0.0)) + float(g2b.get("sgst", 0.0)) + float(g2b.get("igst", 0.0))
        total_2b_itc += Decimal(str(g2b_tax))
        if idx not in matched_2b_indices:
            results.append(MatchResult(
                invoice_id=f"g2b-{idx}",
                invoice_number=str(g2b.get("invoice_number", "")),
                supplier_gstin=str(g2b.get("supplier_gstin", "")),
                supplier_name=g2b.get("supplier_name", "Unknown Supplier"),
                invoice_date=g2b.get("invoice_date", ""),
                taxable_value=float(g2b.get("taxable_value", 0.0)),
                cgst=float(g2b.get("cgst", 0.0)),
                sgst=float(g2b.get("sgst", 0.0)),
                igst=float(g2b.get("igst", 0.0)),
                total_tax=g2b_tax,
                match_status="IN_2B_NOT_IN_BOOKS",
                ims_status="PENDING",
                is_blocked_17_5=False,
                blocked_reason="Available in 2B but missing in Tally/Books; Unclaimed credit opportunity",
                variance_amount=g2b_tax,
                gstr2b_ref=g2b
            ))

    # Calculate GSTR-3B Table 4 Values
    eligible_3b_itc = total_matched_itc
    
    summary = {
        "total_books_invoices": len(books_invoices),
        "total_2b_invoices": len(gstr2b_invoices),
        "total_matched": len([r for r in results if r.match_status in ["EXACT_MATCH", "FUZZY_MATCH"]]),
        "total_mismatched": len([r for r in results if r.match_status == "VALUE_MISMATCH"]),
        "total_in_books_only": len([r for r in results if r.match_status == "IN_BOOKS_NOT_IN_2B"]),
        "total_in_2b_only": len([r for r in results if r.match_status == "IN_2B_NOT_IN_BOOKS"]),
        "total_blocked_17_5": len([r for r in results if r.is_blocked_17_5]),
        "financials": {
            "total_books_itc": float(total_books_itc),
            "total_2b_itc": float(total_2b_itc),
            "eligible_3b_itc": float(eligible_3b_itc),
            "blocked_itc_17_5": float(total_blocked_itc),
            "locked_itc_missing_2b": float(total_in_books_only_itc),
            "unclaimed_itc_in_2b": float(sum(r.total_tax for r in results if r.match_status == "IN_2B_NOT_IN_BOOKS"))
        },
        "gstr3b_table_4": {
            "4_A_5_all_other_itc": float(eligible_3b_itc),
            "4_B_1_ineligible_17_5": float(total_blocked_itc),
            "4_B_2_others": 0.00,
            "net_itc_available": float(eligible_3b_itc)
        },
        "items": [asdict(r) for r in results]
    }
    return summary
