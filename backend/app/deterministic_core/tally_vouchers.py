"""Parses a Tally purchase-register export (purchase and debit-note vouchers) into purchase-register rows.

The Tally desktop agent forwards Tally's XML untouched; all interpretation lives here so a parsing fix is one
server deploy. Output rows have the shape the GSTR-2B reconciler reads (see reconciler.reconcile_books_with_gstr2b).

Sign convention in Tally's XML: debit entries are ISDEEMEDPOSITIVE=Yes with a negative AMOUNT, credit entries the
opposite. We never trust the sign alone: when ISDEEMEDPOSITIVE is present it decides the side. A purchase has the
party on the credit side and expense and tax ledgers on the debit side, so "sum of debit-side lines" is the
purchase's taxable value and tax. A debit note (purchase return) is the mirror image and so comes out negative.

Tally's XML is known to contain control characters (as &#4;) that no XML parser accepts; they are stripped first.
"""
import re
from datetime import date, datetime
from decimal import Decimal, InvalidOperation
from typing import Any, Dict, List, Optional

from .tally_inbound import SafeTallyXMLParser

MAX_VOUCHERS = 200_000

_BAD_CHAR_REFS = re.compile(r"&#(?:[0-8]|1[1-2]|1[4-9]|2\d|3[01]);")
_BAD_RAW_CHARS = re.compile(r"[\x00-\x08\x0b\x0c\x0e-\x1f]")

_HSN_TAGS = {"HSNCODE", "GSTHSNNAME", "HSNSAC", "GSTHSNCODE"}
_EXCLUDED_LEDGER_WORDS = ("ROUND", "TDS", "TCS")


def _text(el, tag: str) -> str:
    child = el.find(tag)
    return (child.text or "").strip() if child is not None and child.text else ""


def _yes(value: str) -> bool:
    return value.strip().lower() in ("yes", "true", "1")


def _amount(value: str) -> Optional[Decimal]:
    s = re.sub(r"[^\d.\-]", "", (value or "").replace(",", ""))
    if s in ("", "-", ".", "-."):
        return None
    try:
        return Decimal(s)
    except InvalidOperation:
        return None


def _iso_date(value: str) -> Optional[str]:
    v = (value or "").strip()
    if re.fullmatch(r"\d{8}", v):
        try:
            return date(int(v[:4]), int(v[4:6]), int(v[6:])).isoformat()
        except ValueError:
            return None
    for fmt in ("%d-%b-%Y", "%d-%m-%Y", "%d/%m/%Y", "%Y-%m-%d"):
        try:
            return datetime.strptime(v, fmt).date().isoformat()
        except ValueError:
            continue
    return None


def _tax_head(ledger_name: str) -> Optional[str]:
    n = ledger_name.upper()
    if "IGST" in n:
        return "igst"
    if "CGST" in n:
        return "cgst"
    if "SGST" in n or "UTGST" in n:
        return "sgst"
    if "CESS" in n:
        return "cess"
    return None


def _debit_amount(entry) -> Optional[Decimal]:
    """The entry's amount, positive when it is on the debit side."""
    amt = _amount(_text(entry, "AMOUNT"))
    if amt is None:
        return None
    deemed = _text(entry, "ISDEEMEDPOSITIVE")
    if deemed:
        return abs(amt) if _yes(deemed) else -abs(amt)
    return -amt  # no flag: Tally's convention is debit = negative


def _money(d: Decimal) -> Decimal:
    return d.quantize(Decimal("0.01"))


def parse_purchase_vouchers(xml_text: str) -> Dict[str, Any]:
    """Returns {"vouchers": [...], "warnings": [...], "stats": {...}}. Raises ValueError on unusable XML."""
    cleaned = _BAD_RAW_CHARS.sub("", _BAD_CHAR_REFS.sub("", xml_text or ""))
    root = SafeTallyXMLParser.parse_xml_string(cleaned)

    for err in root.iter("LINEERROR"):  # Tally reports request faults as a normal 200 response
        raise ValueError(f"Tally returned an error: {(err.text or '').strip()[:200]}")

    vouchers: List[Dict[str, Any]] = []
    warnings: List[str] = []
    stats = {"seen": 0, "skipped_cancelled": 0, "skipped_optional": 0, "skipped_other_type": 0,
             "skipped_no_guid": 0, "duplicates_in_payload": 0, "debit_notes": 0}
    seen_guids = set()

    for v in root.iter("VOUCHER"):
        stats["seen"] += 1
        if stats["seen"] > MAX_VOUCHERS:
            raise ValueError(f"More than {MAX_VOUCHERS} vouchers in one upload; send a shorter period.")

        vtype = _text(v, "VOUCHERTYPENAME") or v.attrib.get("VCHTYPE", "")
        low = vtype.lower()
        is_debit_note = low.startswith("debit note")
        if not (low.startswith("purchase") or is_debit_note):
            stats["skipped_other_type"] += 1
            continue
        if _yes(_text(v, "ISCANCELLED")):
            stats["skipped_cancelled"] += 1
            continue
        if _yes(_text(v, "ISOPTIONAL")):
            stats["skipped_optional"] += 1
            continue

        guid = _text(v, "GUID") or v.attrib.get("REMOTEID", "")
        number = _text(v, "VOUCHERNUMBER")
        if not guid:
            stats["skipped_no_guid"] += 1
            warnings.append(f"Voucher {number or '(no number)'} has no GUID and was skipped.")
            continue
        if guid in seen_guids:
            stats["duplicates_in_payload"] += 1
            continue
        seen_guids.add(guid)

        party = _text(v, "PARTYLEDGERNAME") or _text(v, "PARTYNAME")
        gstin = (_text(v, "PARTYGSTIN") or _text(v, "GSTIN")).upper()

        heads = {"cgst": Decimal(0), "sgst": Decimal(0), "igst": Decimal(0), "cess": Decimal(0)}
        taxable = Decimal(0)
        for entry in v:
            if not entry.tag.upper().endswith("LEDGERENTRIES.LIST"):
                continue
            name = _text(entry, "LEDGERNAME")
            if not name or name == party:
                continue
            amt = _debit_amount(entry)
            if amt is None:
                continue
            head = _tax_head(name)
            if head:
                heads[head] += amt
            elif not any(w in name.upper() for w in _EXCLUDED_LEDGER_WORDS):
                taxable += amt

        hsn = ""
        description = ""
        for el in v.iter():
            if not hsn and el.tag.upper() in _HSN_TAGS and el.text and el.text.strip():
                hsn = el.text.strip()
            if not description and el.tag.upper() == "STOCKITEMNAME" and el.text and el.text.strip():
                description = el.text.strip()

        invoice_number = _text(v, "REFERENCE") or number
        voucher_date = _iso_date(_text(v, "DATE"))
        invoice_date = _iso_date(_text(v, "REFERENCEDATE")) or voucher_date
        if invoice_date is None:
            warnings.append(f"Voucher {number or guid} has no usable date and was skipped.")
            continue
        if not gstin:
            warnings.append(f"Voucher {number or guid} ({party or 'no party'}) has no supplier GSTIN; it cannot match GSTR-2B.")

        taxable, cgst, sgst, igst, cess = (_money(x) for x in (taxable, heads["cgst"], heads["sgst"], heads["igst"], heads["cess"]))
        if is_debit_note:
            stats["debit_notes"] += 1
        vouchers.append({
            "external_ref": guid,
            "voucher_number": number,
            "voucher_type": vtype,
            "is_debit_note": is_debit_note,
            "voucher_date": voucher_date,
            "invoice_number": invoice_number,
            "invoice_date": invoice_date,
            "supplier_name": party,
            "supplier_gstin": gstin,
            "taxable_value": taxable,
            "cgst": cgst,
            "sgst": sgst,
            "igst": igst,
            "cess": cess,
            "total_value": _money(taxable + cgst + sgst + igst + cess),
            "hsn_code": hsn,
            "description": description,
        })

    return {"vouchers": vouchers, "warnings": warnings, "stats": stats}
