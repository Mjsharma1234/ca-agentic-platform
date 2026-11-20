"""Reads a GSTR-2B JSON file as downloaded from the GST portal into rows the reconciler can match.

Handles the two documents that carry input tax credit: invoices (`b2b`) and credit/debit notes (`cdnr`).
Amounts may sit on each item (`items[]`) or directly on the document; both are summed. A credit note issued by a
supplier reduces your credit, so it comes out negative (the mirror of a Tally debit note, which the Tally parser
also returns negative); a debit note from a supplier is positive. Amendments (`b2ba`, `cdnra`), import and
ISD sections are not read and are counted in the warnings so nobody assumes they were matched.
"""
import re
from datetime import datetime
from decimal import Decimal, InvalidOperation
from typing import Any, Dict, List, Optional

MAX_DOCUMENTS = 200_000
_IGNORED_SECTIONS = {"b2ba": "amended invoices", "cdnra": "amended notes", "isd": "ISD credits", "impg": "imports of goods",
                     "impgsez": "imports from SEZ", "isda": "amended ISD credits"}


def _num(value: Any) -> Decimal:
    if value in (None, ""):
        return Decimal(0)
    try:
        return Decimal(str(value))
    except InvalidOperation:
        return Decimal(0)


def _iso(value: Any) -> Optional[str]:
    v = str(value or "").strip()
    for fmt in ("%d-%m-%Y", "%d/%m/%Y", "%Y-%m-%d"):
        try:
            return datetime.strptime(v, fmt).date().isoformat()
        except ValueError:
            continue
    return None


def _amounts(doc: Dict[str, Any]) -> Dict[str, float]:
    parts = doc.get("items") or [doc]
    total = {"txval": Decimal(0), "igst": Decimal(0), "cgst": Decimal(0), "sgst": Decimal(0), "cess": Decimal(0)}
    for part in parts:
        for key in total:
            total[key] += _num(part.get(key))
    return {k: float(v) for k, v in total.items()}


def _period(rtnprd: Any) -> Optional[str]:
    m = re.fullmatch(r"(\d{2})(\d{4})", str(rtnprd or "").strip())
    return f"{m.group(2)}-{m.group(1)}" if m and 1 <= int(m.group(1)) <= 12 else None


def parse_gstr2b(doc: Any) -> Dict[str, Any]:
    """Returns {"period": "YYYY-MM"|None, "gstin": str, "invoices": [...], "warnings": [...]}. Raises ValueError if the file is not a GSTR-2B."""
    if not isinstance(doc, dict):
        raise ValueError("That is not a GSTR-2B JSON file.")
    data = doc.get("data") if isinstance(doc.get("data"), dict) else doc
    docdata = data.get("docdata")
    if not isinstance(docdata, dict):
        raise ValueError("That does not look like a GSTR-2B file downloaded from the GST portal (no document data found).")

    rows: List[Dict[str, Any]] = []
    warnings: List[str] = []
    not_available = 0
    for supplier in docdata.get("b2b") or []:
        for inv in supplier.get("inv") or []:
            a = _amounts(inv)
            rows.append({
                "invoice_number": str(inv.get("inum", "")), "invoice_date": _iso(inv.get("dt") or inv.get("idt")) or "",
                "supplier_gstin": str(supplier.get("ctin", "")).upper(), "supplier_name": supplier.get("trdnm", ""),
                "taxable_value": a["txval"], "cgst": a["cgst"], "sgst": a["sgst"], "igst": a["igst"], "cess": a["cess"],
                "document_type": "invoice", "itc_available": str(inv.get("itcavl", "Y")).upper() != "N",
            })
    for supplier in docdata.get("cdnr") or []:
        for note in supplier.get("nt") or []:
            a = _amounts(note)
            sign = -1.0 if str(note.get("typ", "C")).upper() == "C" else 1.0     # C = credit note (reduces your credit), D = debit note
            rows.append({
                "invoice_number": str(note.get("ntnum", "")), "invoice_date": _iso(note.get("dt") or note.get("ntdt")) or "",
                "supplier_gstin": str(supplier.get("ctin", "")).upper(), "supplier_name": supplier.get("trdnm", ""),
                "taxable_value": sign * a["txval"], "cgst": sign * a["cgst"], "sgst": sign * a["sgst"], "igst": sign * a["igst"],
                "cess": sign * a["cess"], "document_type": "credit_note" if sign < 0 else "debit_note",
                "itc_available": str(note.get("itcavl", "Y")).upper() != "N",
            })
    if len(rows) > MAX_DOCUMENTS:
        raise ValueError(f"More than {MAX_DOCUMENTS} documents in one file.")
    not_available = sum(1 for r in rows if not r["itc_available"])
    for section, label in _IGNORED_SECTIONS.items():
        n = len(docdata.get(section) or [])
        if n:
            warnings.append(f"{n} {label} entries ({section}) were not read; match those by hand.")
    if not_available:
        warnings.append(f"{not_available} documents are marked in 2B as credit not available; they are listed but are not eligible.")
    if not rows:
        warnings.append("The file has no invoices or credit notes.")
    return {"period": _period(data.get("rtnprd")), "gstin": str(data.get("gstin", "")).upper(), "invoices": rows, "warnings": warnings}
