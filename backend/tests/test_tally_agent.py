"""Tally agent: voucher parsing, agent keys, company linking, snapshot ingest, tenant isolation.

The XML here is synthetic, modelled on Tally's collection export. It proves our parsing rules, not that every
real Tally version emits exactly this; see docs/superpowers/specs/2026-11-18-tally-agent-design.md.
"""
import gzip
import json
import uuid
from datetime import timedelta
from decimal import Decimal

import pytest
from fastapi.testclient import TestClient

from app.core.database import SessionLocal, create_tables
from app.core.security import create_access_token
from app.deterministic_core.tally_vouchers import parse_purchase_vouchers
from app.main import app
from app.models.clients import Client, ClientType, ERPType
from app.models.invoices import Invoice
from app.models.tenant import Firm, User

http = TestClient(app)


def _voucher(guid, number, ref, party, gstin, taxable, cgst=0, sgst=0, igst=0, vtype="Purchase",
             date="20250415", extra="", cancelled="No"):
    """A Tally voucher. Debit lines are ISDEEMEDPOSITIVE=Yes with negative amounts; the party is the credit."""
    debit = vtype.lower().startswith("purchase")
    total = taxable + cgst + sgst + igst

    def line(name, amt, party_side=False):
        deemed_yes = (not party_side) if debit else party_side
        signed = -amt if deemed_yes else amt
        return (f"<LEDGERENTRIES.LIST><LEDGERNAME>{name}</LEDGERNAME><ISDEEMEDPOSITIVE>{'Yes' if deemed_yes else 'No'}"
                f"</ISDEEMEDPOSITIVE><AMOUNT>{signed:.2f}</AMOUNT></LEDGERENTRIES.LIST>")

    lines = line(party, total, party_side=True) + line("Purchase Account", taxable)
    if cgst:
        lines += line("Input CGST 9%", cgst)
    if sgst:
        lines += line("Input SGST 9%", sgst)
    if igst:
        lines += line("Input IGST 18%", igst)
    return (f'<VOUCHER VCHTYPE="{vtype}" ACTION="Create"><DATE>{date}</DATE><GUID>{guid}</GUID>'
            f"<VOUCHERTYPENAME>{vtype}</VOUCHERTYPENAME><VOUCHERNUMBER>{number}</VOUCHERNUMBER>"
            f"<REFERENCE>{ref}</REFERENCE><PARTYLEDGERNAME>{party}</PARTYLEDGERNAME><PARTYGSTIN>{gstin}</PARTYGSTIN>"
            f"<ISCANCELLED>{cancelled}</ISCANCELLED><ISOPTIONAL>No</ISOPTIONAL>{extra}{lines}</VOUCHER>")


def _xml(*vouchers):
    return "<ENVELOPE><BODY><DATA><COLLECTION>" + "".join(vouchers) + "</COLLECTION></DATA></BODY></ENVELOPE>"


# ---------------------------------------------------------------- parser
def test_parser_extracts_intra_state_purchase():
    out = parse_purchase_vouchers(_xml(_voucher("g1", "P/1", "INV-889", "ABC Traders", "27AAAAA0000A1Z5", 1000, cgst=90, sgst=90)))
    (v,) = out["vouchers"]
    assert v["external_ref"] == "g1"
    assert v["invoice_number"] == "INV-889"          # supplier reference wins over our voucher number
    assert v["invoice_date"] == "2025-04-15"
    assert v["supplier_gstin"] == "27AAAAA0000A1Z5"
    assert (v["taxable_value"], v["cgst"], v["sgst"], v["igst"]) == (Decimal("1000.00"), Decimal("90.00"), Decimal("90.00"), Decimal("0.00"))
    assert v["total_value"] == Decimal("1180.00")


def test_parser_inter_state_and_hsn_description():
    inv = "<ALLINVENTORYENTRIES.LIST><STOCKITEMNAME>Steel rod</STOCKITEMNAME><GSTHSNNAME>7214</GSTHSNNAME></ALLINVENTORYENTRIES.LIST>"
    (v,) = parse_purchase_vouchers(_xml(_voucher("g1", "P/2", "A1", "XYZ", "29BBBBB1111B1Z5", 5000, igst=900, extra=inv)))["vouchers"]
    assert v["igst"] == Decimal("900.00") and v["cgst"] == Decimal("0.00")
    assert v["hsn_code"] == "7214" and v["description"] == "Steel rod"


def test_parser_debit_note_is_negative():
    out = parse_purchase_vouchers(_xml(_voucher("g9", "DN/1", "DN-1", "ABC Traders", "27AAAAA0000A1Z5", 200, cgst=18, sgst=18, vtype="Debit Note")))
    (v,) = out["vouchers"]
    assert v["is_debit_note"] and v["taxable_value"] == Decimal("-200.00") and v["cgst"] == Decimal("-18.00")
    assert out["stats"]["debit_notes"] == 1


def test_parser_skips_cancelled_other_types_and_duplicates_and_warns_on_missing_gstin():
    out = parse_purchase_vouchers(_xml(
        _voucher("a", "1", "R1", "P", "27AAAAA0000A1Z5", 100, cgst=9, sgst=9),
        _voucher("a", "1", "R1", "P", "27AAAAA0000A1Z5", 100, cgst=9, sgst=9),            # same GUID twice
        _voucher("b", "2", "R2", "P", "27AAAAA0000A1Z5", 100, cancelled="Yes"),
        _voucher("c", "3", "R3", "P", "27AAAAA0000A1Z5", 100, vtype="Sales"),
        _voucher("d", "4", "R4", "NoGstin Co", "", 100, cgst=9, sgst=9),
    ))
    assert [v["external_ref"] for v in out["vouchers"]] == ["a", "d"]
    s = out["stats"]
    assert (s["skipped_cancelled"], s["skipped_other_type"], s["duplicates_in_payload"]) == (1, 1, 1)
    assert any("no supplier GSTIN" in w for w in out["warnings"])


def test_parser_survives_tally_control_characters_and_rejects_tally_errors():
    dirty = _xml(_voucher("g1", "P/1", "R", "A&#4;BC", "27AAAAA0000A1Z5", 100))
    assert len(parse_purchase_vouchers(dirty)["vouchers"]) == 1
    with pytest.raises(ValueError, match="Tally returned an error"):
        parse_purchase_vouchers("<ENVELOPE><LINEERROR>Could not find Report 'x'</LINEERROR></ENVELOPE>")
    with pytest.raises(ValueError):
        parse_purchase_vouchers("")


def test_parser_ignores_xxe_payload():
    evil = '<!DOCTYPE x [<!ENTITY xxe SYSTEM "file:///etc/passwd">]>' + _xml(_voucher("g1", "1", "R", "A &xxe; B", "27AAAAA0000A1Z5", 1))
    out = parse_purchase_vouchers(evil)
    assert "root:" not in json.dumps(out, default=str)


# ---------------------------------------------------------------- API
@pytest.fixture(scope="module", autouse=True)
def _schema():
    create_tables()


def _login(tenant, role="MANAGER"):
    uid = uuid.uuid4()
    with SessionLocal() as db:
        if db.get(Firm, tenant) is None:
            db.add(Firm(id=tenant, firm_code=f"fx-{tenant.hex[:10]}", firm_name="Test Firm"))
        db.add(User(id=uid, firm_id=tenant, email=f"{uid.hex[:8]}@firm.test", full_name="T", role=role,
                    hashed_password="x", is_active=True))
        db.commit()
    token = create_access_token({"sub": str(uid), "tenant_id": str(tenant), "role": role}, expires_delta=timedelta(minutes=30))
    return {"Authorization": f"Bearer {token}"}


def _make_client(tenant, gstin="27AABCU9603R1ZX"):
    with SessionLocal() as db:
        c = Client(tenant_id=tenant, client_name=f"Client {uuid.uuid4().hex[:5]}", pan="AABCU9603R", gstin=gstin,
                   client_type=ClientType.COMPANY, erp_type=ERPType.TALLY_PRIME,
                   financial_year_start="2025-04-01", financial_year_end="2026-03-31")
        db.add(c)
        db.commit()
        return str(c.id)


def _ingest(key, xml, company="Acme Pvt Ltd", start="2025-04-01", end="2026-03-31", **extra):
    body = gzip.compress(json.dumps({"company_name": company, "period_from": start, "period_to": end, "xml": xml, **extra}).encode())
    return http.post("/api/v1/tally-agent/ingest", content=body,
                     headers={"X-Agent-Key": key, "Content-Encoding": "gzip", "Content-Type": "application/json"})


@pytest.fixture
def setup():
    tenant = uuid.uuid4()
    admin = _login(tenant)
    issued = http.post("/api/v1/tally-agent/agents", json={"name": "Reception PC"}, headers=admin)
    assert issued.status_code == 200, issued.text
    return tenant, admin, issued.json()


def _link(admin, key, tenant, company="Acme Pvt Ltd"):
    hb = http.post("/api/v1/tally-agent/heartbeat", json={"agent_version": "0.1.0", "companies": [company]},
                   headers={"X-Agent-Key": key})
    assert hb.status_code == 200 and hb.json()["companies"] == [{"company_name": company, "linked": False}]
    comp = next(c for c in http.get("/api/v1/tally-agent/companies", headers=admin).json() if c["company_name"] == company)
    client_id = _make_client(tenant)
    r = http.put(f"/api/v1/tally-agent/companies/{comp['id']}/link", json={"client_id": client_id}, headers=admin)
    assert r.status_code == 200, r.text
    return client_id


def test_key_is_shown_once_and_stored_hashed(setup):
    _, admin, issued = setup
    assert issued["key"].startswith("fosk_")
    listed = http.get("/api/v1/tally-agent/agents", headers=admin).json()
    assert all("key" not in a and "key_hash" not in a for a in listed)
    with SessionLocal() as db:
        from app.models.tally_agent import TallyAgent
        row = db.get(TallyAgent, uuid.UUID(issued["id"]))
        assert issued["key"] not in (row.key_hash, row.key_prefix) and len(row.key_hash) == 64


def test_agent_endpoints_reject_missing_wrong_and_revoked_keys(setup):
    _, admin, issued = setup
    hb = {"agent_version": "0.1.0", "companies": []}
    assert http.post("/api/v1/tally-agent/heartbeat", json=hb).status_code == 401
    assert http.post("/api/v1/tally-agent/heartbeat", json=hb, headers={"X-Agent-Key": "fosk_nope"}).status_code == 401
    assert http.post("/api/v1/tally-agent/heartbeat", json=hb, headers={"X-Agent-Key": issued["key"]}).status_code == 200
    assert http.delete(f"/api/v1/tally-agent/agents/{issued['id']}", headers=admin).json()["revoked"] is True
    assert http.post("/api/v1/tally-agent/heartbeat", json=hb, headers={"X-Agent-Key": issued["key"]}).status_code == 401


def test_staff_endpoints_need_manager_and_login(setup):
    tenant, _, _ = setup
    assert http.get("/api/v1/tally-agent/agents").status_code == 401
    trainee = _login(tenant, "ARTICLE_TRAINEE")
    assert http.get("/api/v1/tally-agent/agents", headers=trainee).status_code == 403
    assert http.post("/api/v1/tally-agent/agents", json={"name": "x"}, headers=trainee).status_code == 403


def test_ingest_refused_until_company_is_linked(setup):
    _, _, issued = setup
    r = _ingest(issued["key"], _xml(_voucher("g1", "1", "R1", "P", "27AAAAA0000A1Z5", 100)))
    assert r.status_code == 409 and r.json()["detail"]["code"] == "COMPANY_NOT_LINKED"


def test_ingest_creates_updates_and_removes_by_snapshot(setup):
    tenant, admin, issued = setup
    key = issued["key"]
    client_id = _link(admin, key, tenant)

    v1 = _voucher("g1", "P/1", "INV-1", "ABC", "27AAAAA0000A1Z5", 1000, cgst=90, sgst=90)
    v2 = _voucher("g2", "P/2", "INV-2", "XYZ", "29BBBBB1111B1Z5", 500, igst=90)
    r = _ingest(key, _xml(v1, v2))
    assert r.status_code == 200, r.text
    assert (r.json()["created"], r.json()["updated"], r.json()["removed"]) == (2, 0, 0)

    # Re-sending the same snapshot changes nothing (idempotent).
    again = _ingest(key, _xml(v1, v2)).json()
    assert (again["created"], again["updated"], again["removed"]) == (0, 2, 0)

    # Edit g1 in Tally, delete g2 in Tally.
    v1b = _voucher("g1", "P/1", "INV-1", "ABC", "27AAAAA0000A1Z5", 1200, cgst=108, sgst=108)
    r = _ingest(key, _xml(v1b)).json()
    assert (r["created"], r["updated"], r["removed"]) == (0, 1, 1)
    with SessionLocal() as db:
        rows = {i.external_ref: i for i in db.query(Invoice).filter(Invoice.client_id == uuid.UUID(client_id)).all()}
        assert rows["g1"].taxable_value == Decimal("1200.00") and not rows["g1"].is_deleted
        assert rows["g2"].is_deleted

    # g2 comes back in Tally: restored, not duplicated.
    r = _ingest(key, _xml(v1b, v2)).json()
    assert (r["created"], r["restored"]) == (0, 1)


def test_empty_snapshot_does_not_wipe_stored_vouchers(setup):
    tenant, admin, issued = setup
    key = issued["key"]
    _link(admin, key, tenant)
    assert _ingest(key, _xml(_voucher("g1", "1", "R", "P", "27AAAAA0000A1Z5", 100))).status_code == 200
    r = _ingest(key, _xml())
    assert r.status_code == 409 and r.json()["detail"]["code"] == "EMPTY_SNAPSHOT_WOULD_DELETE"
    ok = _ingest(key, _xml(), allow_empty=True)
    assert ok.status_code == 200 and ok.json()["removed"] == 1


def test_vouchers_outside_period_are_ignored(setup):
    tenant, admin, issued = setup
    key = issued["key"]
    _link(admin, key, tenant)
    r = _ingest(key, _xml(_voucher("old", "1", "R", "P", "27AAAAA0000A1Z5", 100, date="20240115")))
    assert r.status_code == 200 and r.json()["vouchers"] == 0 and r.json()["outside_period"] == 1


def test_bad_uploads(setup):
    tenant, admin, issued = setup
    key = issued["key"]
    _link(admin, key, tenant)
    assert _ingest(key, "<not xml").status_code == 422
    assert _ingest(key, _xml(), start="2026-04-01", end="2025-04-01").status_code == 422
    junk = http.post("/api/v1/tally-agent/ingest", content=b"not gzip",
                     headers={"X-Agent-Key": key, "Content-Encoding": "gzip"})
    assert junk.status_code == 400
    # A decompression bomb is refused rather than inflated.
    bomb = gzip.compress(b"x" * (51 * 1024 * 1024))
    assert http.post("/api/v1/tally-agent/ingest", content=bomb,
                     headers={"X-Agent-Key": key, "Content-Encoding": "gzip"}).status_code == 413


def test_one_client_cannot_be_linked_to_two_companies(setup):
    tenant, admin, issued = setup
    key = issued["key"]
    client_id = _link(admin, key, tenant, "Company A")
    http.post("/api/v1/tally-agent/heartbeat", json={"companies": ["Company B"]}, headers={"X-Agent-Key": key})
    b = next(c for c in http.get("/api/v1/tally-agent/companies", headers=admin).json() if c["company_name"] == "Company B")
    r = http.put(f"/api/v1/tally-agent/companies/{b['id']}/link", json={"client_id": client_id}, headers=admin)
    assert r.status_code == 409


def test_firms_are_isolated(setup):
    tenant, admin, issued = setup
    key_a = issued["key"]
    _link(admin, key_a, tenant)
    other_tenant = uuid.uuid4()
    other_admin = _login(other_tenant)
    assert http.get("/api/v1/tally-agent/companies", headers=other_admin).json() == []
    assert http.get("/api/v1/tally-agent/agents", headers=other_admin).json() == []
    foreign_client = _make_client(other_tenant, gstin="29AAAAA1111A1Z5")
    comp = http.get("/api/v1/tally-agent/companies", headers=admin).json()[0]
    # Firm A cannot link its company to firm B's client, nor revoke firm B's agent.
    assert http.put(f"/api/v1/tally-agent/companies/{comp['id']}/link", json={"client_id": foreign_client},
                    headers=admin).status_code == 404
    other_key = http.post("/api/v1/tally-agent/agents", json={"name": "B"}, headers=other_admin).json()
    assert http.delete(f"/api/v1/tally-agent/agents/{other_key['id']}", headers=admin).status_code == 404


def test_synced_register_feeds_the_existing_gstr2b_reconciliation(setup):
    tenant, admin, issued = setup
    key = issued["key"]
    client_id = _link(admin, key, tenant)
    assert _ingest(key, _xml(_voucher("g1", "P/1", "INV-1", "ABC", "27AAAAA0000A1Z5", 1000, cgst=90, sgst=90))).status_code == 200
    r = http.get(f"/api/v1/returns/reconciliation?client_id={client_id}", headers=admin)
    assert r.status_code == 200, r.text
    s = r.json()["summary"]
    assert s["total_books_records"] == 1 and s["books_total_tax"] == 180.0


def test_ingest_writes_audit_block(setup):
    tenant, admin, issued = setup
    key = issued["key"]
    _link(admin, key, tenant)
    assert _ingest(key, _xml(_voucher("g1", "1", "R", "P", "27AAAAA0000A1Z5", 100))).status_code == 200
    with SessionLocal() as db:
        from app.models.tenant import AuditBlock
        actions = [b.action for b in db.query(AuditBlock).filter(AuditBlock.firm_id == tenant).all()]
    assert "TALLY_PURCHASE_REGISTER_SYNCED" in actions and "TALLY_AGENT_KEY_ISSUED" in actions


# ---------------------------------------------------------------- web page
def test_tally_page_calls_only_existing_backend_routes():
    """firm_os_web/js/pages-tally.js hard-codes API paths; each must be a real route (and the page must be registered)."""
    import re
    from pathlib import Path

    web = Path(__file__).resolve().parents[2] / "firm_os_web"
    src = (web / "js" / "pages-tally.js").read_text(encoding="utf-8")
    paths = {re.sub(r"\$\{[^}]+\}", "{param}", p) for p in re.findall(r"['`](/(?:tally-agent|clients)[^'`?]*)['`]", src)}
    assert len(paths) >= 11, paths     # includes register, reconcile and sync-now: a path the regex skipped would shrink this
    routes = {getattr(r, "path", "").removeprefix("/api/v1") for r in app.routes}
    for p in paths:
        pattern = re.escape(p).replace(re.escape("{param}"), r"\{[^}]+\}")
        assert any(re.fullmatch(pattern, r) for r in routes), f"pages-tally.js calls a missing route: {p}"
    index = (web / "index.html").read_text(encoding="utf-8")
    assert 'src="js/pages-tally.js"' in index and 'src="js/pages-tally-books.js"' in index
    assert index.index("pages-tally.js") < index.index("pages-tally-books.js")     # the books view uses helpers defined in the first file
    assert "VIEWS.tallybooks" in (web / "js" / "pages-tally-books.js").read_text(encoding="utf-8")
    assert "k: 'tally'" in (web / "js" / "core.js").read_text(encoding="utf-8")
