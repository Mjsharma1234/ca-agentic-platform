import xml.etree.ElementTree as ET
from datetime import datetime
from typing import List, Dict, Any

def format_tally_date(date_str: str) -> str:
    """Converts YYYY-MM-DD or DD/MM/YYYY into Tally's YYYYMMDD format."""
    if not date_str:
        return datetime.today().strftime("%Y%m%d")
    clean = date_str.strip()
    try:
        if "-" in clean:
            parts = clean.split("-")
            if len(parts[0]) == 4:  # YYYY-MM-DD
                return f"{parts[0]}{parts[1].zfill(2)}{parts[2].zfill(2)}"
            else:  # DD-MM-YYYY
                return f"{parts[2]}{parts[1].zfill(2)}{parts[0].zfill(2)}"
        elif "/" in clean:
            parts = clean.split("/")
            if len(parts[2]) == 4:  # DD/MM/YYYY
                return f"{parts[2]}{parts[1].zfill(2)}{parts[0].zfill(2)}"
    except Exception:
        pass
    return datetime.today().strftime("%Y%m%d")

def generate_tally_purchase_xml(invoices: List[Dict[str, Any]], company_name: str = "Client Company") -> str:
    """
    Generates fully compliant TallyPrime XML import payload for Purchase Vouchers.
    Includes Supplier Ledger (Credit), Purchase Ledger (Debit), and Input GST Ledgers (Debit).
    """
    envelope = ET.Element("ENVELOPE")
    
    header = ET.SubElement(envelope, "HEADER")
    tally_req = ET.SubElement(header, "TALLYREQUEST")
    tally_req.text = "Import Data"
    
    body = ET.SubElement(envelope, "BODY")
    import_data = ET.SubElement(body, "IMPORTDATA")
    
    req_desc = ET.SubElement(import_data, "REQUESTDESC")
    rep_name = ET.SubElement(req_desc, "REPORTNAME")
    rep_name.text = "Vouchers"
    static_vars = ET.SubElement(req_desc, "STATICVARIABLES")
    comp = ET.SubElement(static_vars, "SVCURRENTCOMPANY")
    comp.text = company_name
    
    req_data = ET.SubElement(import_data, "REQUESTDATA")
    
    for inv in invoices:
        tally_msg = ET.SubElement(req_data, "TALLYMESSAGE", {"xmlns:UDF": "TallyUDF"})
        vch = ET.SubElement(tally_msg, "VOUCHER", {
            "VCHTYPE": "Purchase",
            "ACTION": "Create",
            "OBJVIEW": "Accounting Voucher View"
        })
        
        inv_no = str(inv.get("invoice_number", "INV"))
        inv_date = format_tally_date(str(inv.get("invoice_date", "")))
        party_name = str(inv.get("supplier_name", "Sundry Creditor"))
        supplier_gstin = str(inv.get("supplier_gstin", ""))
        
        taxable = float(inv.get("taxable_value", 0.0))
        cgst = float(inv.get("cgst", 0.0))
        sgst = float(inv.get("sgst", 0.0))
        igst = float(inv.get("igst", 0.0))
        total_val = float(inv.get("total_value", taxable + cgst + sgst + igst))
        
        # Header Fields
        date_el = ET.SubElement(vch, "DATE")
        date_el.text = inv_date
        
        vch_type = ET.SubElement(vch, "VOUCHERTYPENAME")
        vch_type.text = "Purchase"
        
        vch_no = ET.SubElement(vch, "VOUCHERNUMBER")
        vch_no.text = inv_no
        
        ref = ET.SubElement(vch, "REFERENCE")
        ref.text = inv_no
        
        party = ET.SubElement(vch, "PARTYLEDGERNAME")
        party.text = party_name
        
        party_gst = ET.SubElement(vch, "PARTYGSTIN")
        party_gst.text = supplier_gstin
        
        narr = ET.SubElement(vch, "NARRATION")
        narr.text = f"Purchase Bill No: {inv_no} dtd {inv.get('invoice_date', '')} | GSTIN: {supplier_gstin} (Imported via KARYA CA Platform)"
        
        # 1. Credit Entry: Sundry Creditor / Supplier (Total Value, Negative in Tally)
        cred_entry = ET.SubElement(vch, "ALLLEDGERENTRIES.LIST")
        cred_name = ET.SubElement(cred_entry, "LEDGERNAME")
        cred_name.text = party_name
        cred_positive = ET.SubElement(cred_entry, "ISDEEMEDPOSITIVE")
        cred_positive.text = "No"
        cred_amt = ET.SubElement(cred_entry, "AMOUNT")
        cred_amt.text = f"{total_val:.2f}"
        
        # 2. Debit Entry: Purchase Account (Taxable Value, Positive in Tally)
        deb_entry = ET.SubElement(vch, "ALLLEDGERENTRIES.LIST")
        deb_name = ET.SubElement(deb_entry, "LEDGERNAME")
        deb_name.text = "Purchase Account"
        deb_positive = ET.SubElement(deb_entry, "ISDEEMEDPOSITIVE")
        deb_positive.text = "Yes"
        deb_amt = ET.SubElement(deb_entry, "AMOUNT")
        deb_amt.text = f"-{taxable:.2f}"
        
        # 3. Debit Entry: Input CGST (if applicable)
        if cgst > 0:
            cgst_entry = ET.SubElement(vch, "ALLLEDGERENTRIES.LIST")
            cgst_name = ET.SubElement(cgst_entry, "LEDGERNAME")
            cgst_name.text = "Input CGST"
            cgst_positive = ET.SubElement(cgst_entry, "ISDEEMEDPOSITIVE")
            cgst_positive.text = "Yes"
            cgst_amt = ET.SubElement(cgst_entry, "AMOUNT")
            cgst_amt.text = f"-{cgst:.2f}"
            
        # 4. Debit Entry: Input SGST (if applicable)
        if sgst > 0:
            sgst_entry = ET.SubElement(vch, "ALLLEDGERENTRIES.LIST")
            sgst_name = ET.SubElement(sgst_entry, "LEDGERNAME")
            sgst_name.text = "Input SGST"
            sgst_positive = ET.SubElement(sgst_entry, "ISDEEMEDPOSITIVE")
            sgst_positive.text = "Yes"
            sgst_amt = ET.SubElement(sgst_entry, "AMOUNT")
            sgst_amt.text = f"-{sgst:.2f}"
            
        # 5. Debit Entry: Input IGST (if applicable)
        if igst > 0:
            igst_entry = ET.SubElement(vch, "ALLLEDGERENTRIES.LIST")
            igst_name = ET.SubElement(igst_entry, "LEDGERNAME")
            igst_name.text = "Input IGST"
            igst_positive = ET.SubElement(igst_entry, "ISDEEMEDPOSITIVE")
            igst_positive.text = "Yes"
            igst_amt = ET.SubElement(igst_entry, "AMOUNT")
            igst_amt.text = f"-{igst:.2f}"

    return ET.tostring(envelope, encoding="utf-8", xml_declaration=True).decode("utf-8")
