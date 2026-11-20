"""Purchase register view, GSTR-2B parsing and reconciliation, and 'sync now'."""
import uuid

import pytest
from fastapi.testclient import TestClient

from app.core.database import SessionLocal, create_tables
from app.deterministic_core.gstr2b import parse_gstr2b
from app.main import app
from app.models.clients import Client
from tests.test_tally_agent import _ingest, _link, _login, _voucher, _xml

http = TestClient(app)
B = "/api/v1/tally-agent"
S1, S2, S3, S9 = "27AAAAA0000A1Z5", "29BBBBB1111B1Z5", "27CCCCC2222C1Z5", "24DDDDD3333D1Z5"


@pytest.fixture(scope="module", autouse=True)
def _schema():
    create_tables()


# ---------------------------------------------------------------- GSTR-2B parser
def _doc(b2b=None, cdnr=None, **extra):
    data = {"gstin": "27AABCU9603R1ZX", "rtnprd": "042025", "docdata": {"b2b": b2b or [], "cdnr": cdnr or [], **extra}}
    return {"data": data}


def _inv(inum, taxable, igst=0, cgst=0, sgst=0, dt="15-04-2025", **kw):
    return {"inum": inum, "dt": dt, "val": taxable + igst + cgst + sgst, "itcavl": "Y",
            "items": [{"num": 1, "rt": 18, "txval": taxable, "igst": igst, "cgst": cgst, "sgst": sgst, "cess": 0}], **kw}


def test_parser_reads_invoices_with_item_level_and_invoice_level_amounts():
    out = parse_gstr2b(_doc(b2b=[
        {"ctin": S1, "trdnm": "ABC Traders", "inv": [_inv("INV-1", 1000, cgst=90, sgst=90),
                                                    {"inum": "INV-2", "dt": "16-04-2025", "txval": 500, "igst": 90, "itcavl": "Y"}]}]))
    assert out["period"] == "2025-04" and out["gstin"] == "27AABCU9603R1ZX"
    a, b = out["invoices"]
    assert (a["invoice_number"], a["supplier_gstin"], a["supplier_name"], a["invoice_date"]) == ("INV-1", S1, "ABC Traders", "2025-04-15")
    assert (a["taxable_value"], a["cgst"], a["sgst"], a["igst"]) == (1000, 90, 90, 0)
    assert (b["taxable_value"], b["igst"], b["invoice_date"]) == (500, 90, "2025-04-16")      # amounts on the document itself


def test_parser_sums_multiple_items_and_makes_credit_notes_negative():
    inv = {"inum": "I", "dt": "01-04-2025", "items": [{"txval": 100, "cgst": 9, "sgst": 9}, {"txval": 200, "cgst": 18, "sgst": 18}]}
    out = parse_gstr2b(_doc(
        b2b=[{"ctin": S1, "inv": [inv]}],
        cdnr=[{"ctin": S1, "nt": [{"ntnum": "CN-1", "typ": "C", "dt": "02-04-2025", "items": [{"txval": 50, "cgst": 4.5, "sgst": 4.5}]},
                                  {"ntnum": "DN-1", "typ": "D", "dt": "03-04-2025", "items": [{"txval": 10, "igst": 1.8}]}]}]))
    invoice, credit, debit = out["invoices"]
    assert (invoice["taxable_value"], invoice["cgst"]) == (300, 27)
    assert (credit["taxable_value"], credit["cgst"], credit["document_type"]) == (-50, -4.5, "credit_note")
    assert (debit["taxable_value"], debit["igst"], debit["document_type"]) == (10, 1.8, "debit_note")


def test_parser_warns_about_what_it_does_not_read():
    out = parse_gstr2b(_doc(b2b=[{"ctin": S1, "inv": [_inv("I", 100, cgst=9, sgst=9, itcavl="N")]}], b2ba=[{"ctin": S1}], impg=[{}, {}]))
    text = " ".join(out["warnings"])
    assert "amended invoices" in text and "imports of goods" in text and "credit not available" in text
    assert out["invoices"][0]["itc_available"] is False


@pytest.mark.parametrize("bad", [None, [], "text", {}, {"data": {}}, {"data": {"docdata": "x"}}])
def test_parser_rejects_files_that_are_not_gstr2b(bad):
    with pytest.raises(ValueError):
        parse_gstr2b(bad)


def test_parser_handles_missing_or_odd_fields_without_crashing():
    out = parse_gstr2b({"data": {"rtnprd": "13X", "docdata": {"b2b": [{"ctin": S1, "inv": [{"inum": 7, "dt": "not a date", "items": [{"txval": "abc"}]}]}]}}})
    row = out["invoices"][0]
    assert out["period"] is None and row["invoice_number"] == "7" and row["invoice_date"] == "" and row["taxable_value"] == 0


# ---------------------------------------------------------------- API
@pytest.fixture
def linked():
    tenant = uuid.uuid4()
    admin = _login(tenant)
    key = http.post(f"{B}/agents", json={"name": "PC"}, headers=admin).json()["key"]
    client_id = _link(admin, key, tenant)
    company = http.get(f"{B}/companies", headers=admin).json()[0]
    return tenant, admin, key, client_id, company["id"]


def _sync(key, *vouchers):
    r = _ingest(key, _xml(*vouchers))
    assert r.status_code == 200, r.text


BOOKS = lambda: (
    _voucher("g1", "P1", "INV-1", "ABC Traders", S1, 1000, cgst=90, sgst=90),
    _voucher("g2", "P2", "INV-2", "XYZ Metals", S2, 500, igst=90),
    _voucher("g3", "P3", "INV-3", "June Supplier", S3, 2000, cgst=180, sgst=180, date="20250620"),
    _voucher("g4", "D1", "DN-1", "ABC Traders", S1, 200, cgst=18, sgst=18, vtype="Debit Note"),
)


def test_register_lists_the_synced_vouchers_with_totals(linked):
    _, admin, key, client_id, company_id = linked
    _sync(key, *BOOKS())
    r = http.get(f"{B}/companies/{company_id}/register", headers=admin)
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["client"]["id"] == client_id and body["company"]["name"] == "Acme Pvt Ltd" and body["count"] == 4
    assert body["debit_notes"] == 1 and not body["truncated"]
    # 1000+500+2000 purchases less the 200 debit note; the debit note shows negative
    assert body["totals"]["taxable_value"] == 3300 and body["totals"]["total_tax"] == round(180 + 90 + 360 - 36, 2)
    dn = next(x for x in body["rows"] if x["is_debit_note"])
    assert dn["taxable_value"] == -200 and dn["invoice_number"] == "DN-1" and dn["voucher_type"] == "Debit Note"
    assert [x["invoice_date"] for x in body["rows"]] == sorted((x["invoice_date"] for x in body["rows"]), reverse=True)


def test_register_period_filter_limit_and_validation(linked):
    _, admin, key, _, company_id = linked
    _sync(key, *BOOKS())
    june = http.get(f"{B}/companies/{company_id}/register?period=2025-06", headers=admin).json()
    assert june["count"] == 1 and june["rows"][0]["invoice_number"] == "INV-3"
    cut = http.get(f"{B}/companies/{company_id}/register?limit=2", headers=admin).json()
    assert len(cut["rows"]) == 2 and cut["truncated"] and cut["count"] == 4 and cut["totals"]["taxable_value"] == 3300   # totals cover every row
    assert http.get(f"{B}/companies/{company_id}/register?period=June", headers=admin).status_code == 422
    assert http.get(f"{B}/companies/{company_id}/register?limit=0", headers=admin).status_code == 422


def test_register_needs_a_link_login_and_the_right_firm(linked):
    tenant, admin, key, _, company_id = linked
    assert http.get(f"{B}/companies/{company_id}/register").status_code == 401
    assert http.get(f"{B}/companies/{company_id}/register", headers=_login(uuid.uuid4())).status_code == 404       # another firm
    assert http.get(f"{B}/companies/not-a-uuid/register", headers=admin).status_code == 422
    http.put(f"{B}/companies/{company_id}/link", json={"client_id": None}, headers=admin)
    assert http.get(f"{B}/companies/{company_id}/register", headers=admin).status_code == 409                        # unlinked
    trainee = _login(tenant, "ARTICLE_TRAINEE")
    http.put(f"{B}/companies/{company_id}/link", json={"client_id": None}, headers=admin)
    assert http.get(f"{B}/companies/{company_id}/register", headers=trainee).status_code == 409                       # role ok, still unlinked


def test_reconcile_matches_the_register_against_gstr2b(linked):
    tenant, admin, key, client_id, company_id = linked
    _sync(key, *BOOKS())
    gstr = _doc(
        b2b=[{"ctin": S1, "trdnm": "ABC Traders", "inv": [_inv("INV-1", 1000, cgst=90, sgst=90)]},                 # exact
             {"ctin": S2, "trdnm": "XYZ Metals", "inv": [_inv("INV-2", 400, igst=72)]},                               # value mismatch
             {"ctin": S9, "trdnm": "Only In 2B", "inv": [_inv("INV-9", 300, igst=54)]}],                              # not in books
        cdnr=[{"ctin": S1, "nt": [{"ntnum": "DN-1", "typ": "C", "dt": "15-04-2025", "items": [{"txval": 200, "cgst": 18, "sgst": 18}]}]}])  # = the Tally debit note
    r = http.post(f"{B}/companies/{company_id}/reconcile", json={"gstr2b": gstr}, headers=admin)
    assert r.status_code == 200, r.text
    out = r.json()
    assert out["meta"]["books_period_filter"] == "2025-04" and out["meta"]["books_considered"] == 3      # June invoice is out of this return month
    assert sorted(m["invoice_number"] for m in out["exact_matches"]) == ["DN-1", "INV-1"]
    assert [m["invoice_number"] for m in out["value_mismatches"]] == ["INV-2"]
    assert [m["invoice_number"] for m in out["unclaimed_in_books"]] == ["INV-9"]                         # in 2B, missing from Tally
    assert out["missing_in_2b"] == []
    assert out["summary"]["total_gstr2b_records"] == 4 and out["warnings"] == [] or "GSTIN" in out["warnings"][0]


def test_reconcile_all_periods_includes_every_invoice(linked):
    _, admin, key, _, company_id = linked
    _sync(key, *BOOKS())
    gstr = _doc(b2b=[{"ctin": S1, "inv": [_inv("INV-1", 1000, cgst=90, sgst=90)]}])
    out = http.post(f"{B}/companies/{company_id}/reconcile", json={"gstr2b": gstr, "all_periods": True}, headers=admin).json()
    assert out["meta"]["books_period_filter"] is None and out["meta"]["books_considered"] == 4
    assert sorted(m["invoice_number"] for m in out["missing_in_2b"]) == ["DN-1", "INV-2", "INV-3"]


def test_reconcile_warns_when_the_file_is_for_another_gstin(linked):
    _, admin, key, _, company_id = linked
    _sync(key, *BOOKS())
    gstr = _doc(b2b=[], b2ba=[{"ctin": S1}])
    gstr["data"]["gstin"] = "29ZZZZZ9999Z1Z9"
    out = http.post(f"{B}/companies/{company_id}/reconcile", json={"gstr2b": gstr}, headers=admin).json()
    text = " ".join(out["warnings"])
    assert "29ZZZZZ9999Z1Z9" in text and "amended invoices" in text and "no invoices" in text


def test_reconcile_rejects_bad_files_and_wrong_callers(linked):
    tenant, admin, key, _, company_id = linked
    url = f"{B}/companies/{company_id}/reconcile"
    bad = http.post(url, json={"gstr2b": {"hello": "world"}}, headers=admin)
    assert bad.status_code == 422 and "GSTR-2B" in bad.json()["detail"]
    assert http.post(url, json={"gstr2b": _doc()}).status_code == 401
    assert http.post(url, json={"gstr2b": _doc()}, headers=_login(uuid.uuid4())).status_code == 404
    assert http.post(url, json={"nope": 1}, headers=admin).status_code == 422
    trainee = _login(tenant, "ARTICLE_TRAINEE")
    assert http.post(url, json={"gstr2b": _doc()}, headers=trainee).status_code == 200          # a trainee may run reconciliations
    huge = http.post(url, content=b"{}", headers={**admin, "content-length": str(30 * 1024 * 1024), "content-type": "application/json"})
    assert huge.status_code in (413, 422)


def test_reconcile_is_audited_without_keeping_the_file(linked):
    tenant, admin, key, _, company_id = linked
    _sync(key, *BOOKS())
    http.post(f"{B}/companies/{company_id}/reconcile", json={"gstr2b": _doc(b2b=[{"ctin": S9, "inv": [_inv("SECRET-INV-777", 1, igst=1)]}])}, headers=admin)
    with SessionLocal() as db:
        from app.models.tenant import AuditBlock
        blocks = db.query(AuditBlock).filter(AuditBlock.firm_id == tenant, AuditBlock.action == "TALLY_GSTR2B_RECONCILED").all()
    assert len(blocks) == 1 and "SECRET-INV-777" not in str(blocks[0].payload_json) and blocks[0].payload_json["in_2b_only"] == 1


# ---------------------------------------------------------------- sync now
def test_sync_now_is_delivered_to_the_agent_exactly_once(linked):
    tenant, admin, key, _, company_id = linked
    beat = lambda: http.post(f"{B}/heartbeat", json={"companies": []}, headers={"X-Agent-Key": key}).json()
    assert beat()["sync_requested"] is False
    r = http.post(f"{B}/companies/{company_id}/sync-now", headers=admin)
    assert r.status_code == 200 and r.json()["requested"] is True
    assert next(c for c in http.get(f"{B}/companies", headers=admin).json() if c["id"] == company_id)["sync_pending"] is True
    assert beat()["sync_requested"] is True            # the PC picks it up...
    assert beat()["sync_requested"] is False           # ...once
    assert next(c for c in http.get(f"{B}/companies", headers=admin).json() if c["id"] == company_id)["sync_pending"] is False


def test_sync_now_rules(linked):
    tenant, admin, key, _, company_id = linked
    url = f"{B}/companies/{company_id}/sync-now"
    assert http.post(url).status_code == 401
    assert http.post(url, headers=_login(tenant, "ARTICLE_TRAINEE")).status_code == 403
    assert http.post(url, headers=_login(uuid.uuid4())).status_code == 404
    agent_id = http.get(f"{B}/agents", headers=admin).json()[0]["id"]
    http.delete(f"{B}/agents/{agent_id}", headers=admin)
    r = http.post(url, headers=admin)
    assert r.status_code == 409 and "disconnected" in r.json()["detail"]


def test_month_filter_uses_the_date_the_purchase_was_booked(linked):
    """An invoice dated 30 March but entered in Tally on 2 April belongs to April's books and April's GSTR-2B."""
    _, admin, key, _, company_id = linked
    _sync(key, _voucher("late", "P9", "INV-MAR", "Late Entry Co", S1, 1000, cgst=90, sgst=90, date="20250402",
                        extra="<REFERENCEDATE>20250330</REFERENCEDATE>"))
    april = http.get(f"{B}/companies/{company_id}/register?period=2025-04", headers=admin).json()
    march = http.get(f"{B}/companies/{company_id}/register?period=2025-03", headers=admin).json()
    assert [r["invoice_number"] for r in april["rows"]] == ["INV-MAR"] and march["rows"] == []
    assert april["rows"][0]["invoice_date"] == "2025-03-30"                 # the supplier's date is still what is shown and matched
    out = http.post(f"{B}/companies/{company_id}/reconcile", json={"gstr2b": _doc(b2b=[{"ctin": S1, "inv": [_inv("INV-MAR", 1000, cgst=90, sgst=90, dt="30-03-2025")]}])}, headers=admin).json()
    assert out["meta"]["books_considered"] == 1 and [m["invoice_number"] for m in out["exact_matches"]] == ["INV-MAR"]


def test_a_purchase_booked_the_next_month_still_matches_the_return_month_but_unmatched_ones_stay_in_their_month(linked):
    """The June GSTR-2B lists an invoice dated 30 June that was booked on 2 July: it must match, not show as 'in 2B, not in Tally'.
    Purchases booked in other months that are not in the June file are July's or August's business, not June's exceptions."""
    _, admin, key, _, company_id = linked
    _sync(key,
          _voucher("g1", "P1", "INV-JUNE30", "Late Booked Co", S1, 1000, cgst=90, sgst=90, date="20250702", extra="<REFERENCEDATE>20250630</REFERENCEDATE>"),
          _voucher("g2", "P2", "INV-JUNE-OPEN", "Missing In 2B Co", S2, 500, igst=90, date="20250615"),       # booked in June, not in the file
          _voucher("g3", "P3", "INV-AUG", "August Co", S3, 700, cgst=63, sgst=63, date="20250820"))            # booked in August, not in the file
    june = {"data": {"gstin": "27AABCU9603R1ZX", "rtnprd": "062025", "docdata": {
        "b2b": [{"ctin": S1, "trdnm": "Late Booked Co", "inv": [_inv("INV-JUNE30", 1000, cgst=90, sgst=90, dt="30-06-2025")]}]}}}
    out = http.post(f"{B}/companies/{company_id}/reconcile", json={"gstr2b": june}, headers=admin).json()
    assert [m["invoice_number"] for m in out["exact_matches"]] == ["INV-JUNE30"]          # matched although booked in July
    assert out["unclaimed_in_books"] == []                                                 # no false "in 2B, not in Tally"
    assert [m["invoice_number"] for m in out["missing_in_2b"]] == ["INV-JUNE-OPEN"]       # June's own unmatched purchase is flagged...
    assert "INV-AUG" not in str(out)                                                       # ...August's is not June's business
    assert out["meta"]["books_considered"] == 1 and out["meta"]["books_total"] == 3
    s = out["summary"]
    assert s["missing_in_2b"] == 90 and s["books_total_tax"] == 180 + 90 and s["total_books_records"] == 2    # totals follow the same rule
    # "every month" mode reports all unmatched purchases
    every = http.post(f"{B}/companies/{company_id}/reconcile", json={"gstr2b": june, "all_periods": True}, headers=admin).json()
    assert sorted(m["invoice_number"] for m in every["missing_in_2b"]) == ["INV-AUG", "INV-JUNE-OPEN"]
