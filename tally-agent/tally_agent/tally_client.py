"""Read-only client for Tally's local HTTP/XML interface (default http://localhost:9000).

Only export requests are built here. There is deliberately no code that sends Tally an Import request.
Responses are returned as text for the server to interpret; the agent only extracts company names itself.
"""
import re
import xml.etree.ElementTree as ET
from datetime import date
from typing import List
from xml.sax.saxutils import escape

import httpx


class TallyError(Exception):
    pass


class TallyNotReachable(TallyError):
    pass


NOT_RUNNING_HELP = (
    "Could not reach Tally. Check that Tally is open with a company loaded, and that its HTTP server is on: "
    "in Tally press F1 (Help) > Settings > Connectivity > Client/Server configuration, set TallyPrime to act as "
    "'Both' (or 'Server') on port 9000."
)

_BAD_REFS = re.compile(r"&#(?:[0-8]|1[1-2]|1[4-9]|2\d|3[01]);")
_BAD_CHARS = re.compile(r"[\x00-\x08\x0b\x0c\x0e-\x1f]")


def decode_response(raw: bytes) -> str:
    """Tally answers in UTF-16 (with a byte-order mark) on some versions and UTF-8 on others."""
    if raw.startswith((b"\xff\xfe", b"\xfe\xff")):
        return raw.decode("utf-16", errors="replace")
    if raw[:2] and raw[1:2] == b"\x00":  # UTF-16 LE without a BOM
        return raw.decode("utf-16-le", errors="replace")
    return raw.decode("utf-8-sig", errors="replace")


def _envelope(report_type: str, report_id: str, static_vars: str = "", tdl: str = "") -> str:
    return (
        "<ENVELOPE><HEADER><VERSION>1</VERSION><TALLYREQUEST>Export</TALLYREQUEST>"
        f"<TYPE>{report_type}</TYPE><ID>{report_id}</ID></HEADER><BODY><DESC>"
        f"<STATICVARIABLES><SVEXPORTFORMAT>$$SysName:XML</SVEXPORTFORMAT>{static_vars}</STATICVARIABLES>"
        f"{tdl}</DESC></BODY></ENVELOPE>"
    )


def companies_request() -> str:
    return _envelope("Collection", "List of Companies")


def purchase_vouchers_request(company: str, start: date, end: date, all_types: bool = False) -> str:
    """Purchase and debit-note vouchers for one company and period, with their ledger and inventory lines."""
    flt = "" if all_types else "<FILTERS>AgentPurchaseOrDebitNote</FILTERS>"
    formula = (
        '<SYSTEM TYPE="Formulae" NAME="AgentPurchaseOrDebitNote">'
        "$$IsPurchase:$VoucherTypeName OR $$IsDebitNote:$VoucherTypeName</SYSTEM>"
    ) if not all_types else ""
    tdl = (
        "<TDL><TDLMESSAGE>"
        '<COLLECTION NAME="AgentPurchaseVouchers" ISMODIFY="No"><TYPE>Voucher</TYPE>'
        "<NATIVEMETHOD>Date, GUID, AlterID, VoucherTypeName, VoucherNumber, Reference, ReferenceDate, "
        "PartyLedgerName, PartyGSTIN, IsCancelled, IsOptional</NATIVEMETHOD>"
        f"<FETCH>AllLedgerEntries.*, AllInventoryEntries.*</FETCH>{flt}</COLLECTION>{formula}"
        "</TDLMESSAGE></TDL>"
    )
    static = (
        f"<SVCURRENTCOMPANY>{escape(company)}</SVCURRENTCOMPANY>"
        f"<SVFROMDATE>{start:%Y%m%d}</SVFROMDATE><SVTODATE>{end:%Y%m%d}</SVTODATE>"
    )
    return _envelope("Collection", "AgentPurchaseVouchers", static, tdl)


class TallyClient:
    def __init__(self, base_url: str = "http://localhost:9000", client: httpx.Client | None = None, timeout: float = 300.0):
        self.base_url = base_url.rstrip("/")
        self._http = client or httpx.Client(timeout=timeout)

    def _post(self, body: str) -> str:
        try:
            r = self._http.post(self.base_url, content=body.encode("utf-8"),
                                headers={"Content-Type": "text/xml; charset=utf-8"})
        except httpx.TransportError as e:
            raise TallyNotReachable(NOT_RUNNING_HELP) from e
        if r.status_code != 200:
            raise TallyError(f"Tally answered with HTTP {r.status_code}.")
        text = decode_response(r.content).strip()
        if not text:
            raise TallyError("Tally sent an empty answer. Is a company open?")
        if "<ENVELOPE" not in text.upper() and "<ENVELOPE" not in text:
            raise TallyError("Tally sent something that is not XML. Is another program using port 9000?")
        return text

    def list_companies(self) -> List[str]:
        text = _BAD_CHARS.sub("", _BAD_REFS.sub("", self._post(companies_request())))
        if "<!DOCTYPE" in text or "<!ENTITY" in text:
            raise TallyError("Tally's answer contained a DOCTYPE, which the agent refuses to read.")
        try:
            root = ET.fromstring(text)
        except ET.ParseError as e:
            raise TallyError(f"Could not read Tally's company list: {e}")
        names: List[str] = []
        for node in root.iter("COMPANY"):
            child = node.find("NAME")
            name = (child.text or "").strip() if child is not None and child.text else node.attrib.get("NAME", "").strip()
            if name and name not in names:
                names.append(name)
        return names

    def fetch_purchase_vouchers(self, company: str, start: date, end: date, all_types: bool = False) -> str:
        return self._post(purchase_vouchers_request(company, start, end, all_types))
