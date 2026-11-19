"""Real agent code against the real Firm OS backend app (in-process, throw-away SQLite). Only Tally is faked.

Proves the gzip body, the X-Agent-Key header, linking, snapshot semantics and the GSTR-2B reconciliation
endpoint agree between the two halves. Skipped if the backend folder is not next to this one.
"""
import os
import sys
import tempfile
import uuid
from datetime import date, timedelta
from pathlib import Path

import pytest

BACKEND = Path(__file__).resolve().parents[2] / "backend"
pytestmark = pytest.mark.skipif(not (BACKEND / "app").exists(), reason="backend folder not found")

if (BACKEND / "app").exists():
    os.environ["DEBUG"] = "true"
    os.environ["DATABASE_URL"] = f"sqlite:///{tempfile.mkdtemp()}/integration.db"
    sys.path.insert(0, str(BACKEND))

import httpx  # noqa: E402

from tally_agent.sync import run_sync  # noqa: E402
from tally_agent.tally_client import TallyClient  # noqa: E402
from tally_agent.uploader import Uploader  # noqa: E402

COMPANY = "Acme Pvt Ltd"


def _voucher(guid, ref, party, gstin, taxable, cgst, sgst):
    total = taxable + cgst + sgst

    def line(name, amt, debit):
        return (f"<LEDGERENTRIES.LIST><LEDGERNAME>{name}</LEDGERNAME><ISDEEMEDPOSITIVE>{'Yes' if debit else 'No'}</ISDEEMEDPOSITIVE>"
                f"<AMOUNT>{-amt if debit else amt:.2f}</AMOUNT></LEDGERENTRIES.LIST>")
    return (f"<VOUCHER><DATE>20251115</DATE><GUID>{guid}</GUID><VOUCHERTYPENAME>Purchase</VOUCHERTYPENAME>"
            f"<VOUCHERNUMBER>P-{guid}</VOUCHERNUMBER><REFERENCE>{ref}</REFERENCE><PARTYLEDGERNAME>{party}</PARTYLEDGERNAME>"
            f"<PARTYGSTIN>{gstin}</PARTYGSTIN>" + line(party, total, False) + line("Purchases", taxable, True)
            + line("Input CGST", cgst, True) + line("Input SGST", sgst, True) + "</VOUCHER>")


def _tally(vouchers):
    xml = "<ENVELOPE><BODY><DATA><COLLECTION>" + "".join(vouchers) + "</COLLECTION></DATA></BODY></ENVELOPE>"
    companies = f'<ENVELOPE><COLLECTION><COMPANY NAME="{COMPANY}"/></COLLECTION></ENVELOPE>'

    def handler(req):
        return httpx.Response(200, content=(companies if b"List of Companies" in req.content else xml).encode())
    return TallyClient(client=httpx.Client(transport=httpx.MockTransport(handler)))


def test_agent_to_backend_round_trip():
    from fastapi.testclient import TestClient
    from app.core.database import SessionLocal, create_tables
    from app.core.security import create_access_token
    from app.main import app
    from app.models.clients import Client, ClientType, ERPType
    from app.models.tenant import Firm, User

    create_tables()
    web = TestClient(app)
    tenant, uid = uuid.uuid4(), uuid.uuid4()
    with SessionLocal() as db:
        db.add(Firm(id=tenant, firm_code=f"it-{tenant.hex[:8]}", firm_name="Integration Firm"))
        db.add(User(id=uid, firm_id=tenant, email=f"{uid.hex[:6]}@it.test", full_name="M", role="MANAGER",
                    hashed_password="x", is_active=True))
        client = Client(tenant_id=tenant, client_name="Acme", pan="AABCA1234A", gstin="27AABCA1234A1Z5",
                        client_type=ClientType.COMPANY, erp_type=ERPType.TALLY_PRIME,
                        financial_year_start="2025-04-01", financial_year_end="2026-03-31")
        db.add(client)
        db.commit()
        client_id = str(client.id)
    admin = {"Authorization": "Bearer " + create_access_token({"sub": str(uid), "tenant_id": str(tenant), "role": "MANAGER"},
                                                              expires_delta=timedelta(minutes=30))}

    key = web.post("/api/v1/tally-agent/agents", json={"name": "Integration PC"}, headers=admin).json()["key"]
    uploader = Uploader("http://testserver", key, client=web, sleep=lambda s: None)
    today = date(2026, 1, 20)
    v1 = _voucher("g1", "INV-1", "ABC Traders", "27AAAAA0000A1Z5", 1000, 90, 90)
    v2 = _voucher("g2", "INV-2", "XYZ Metals", "27BBBBB1111B1Z5", 2000, 180, 180)

    # 1. First pass: company is unknown to Firm OS, so the agent reports it is waiting for a link.
    first = run_sync(_tally([v1, v2]), uploader, today=today)
    assert [c.status for c in first.companies] == ["waiting_for_link"]

    # 2. A manager links it; the next pass sends both vouchers.
    company_id = web.get("/api/v1/tally-agent/companies", headers=admin).json()[0]["id"]
    assert web.put(f"/api/v1/tally-agent/companies/{company_id}/link", json={"client_id": client_id}, headers=admin).status_code == 200
    second = run_sync(_tally([v1, v2]), uploader, today=today)
    assert second.ok and [c.status for c in second.companies] == ["synced"]

    # 3. The existing GSTR-2B endpoint now sees the books: 2 invoices, 540 of input tax.
    s = web.get(f"/api/v1/returns/reconciliation?client_id={client_id}", headers=admin).json()["summary"]
    assert s["total_books_records"] == 2 and s["books_total_tax"] == 540.0

    # 4. v2 is deleted in Tally; the next pass removes it from Firm OS.
    third = run_sync(_tally([v1]), uploader, today=today)
    assert third.ok
    s = web.get(f"/api/v1/returns/reconciliation?client_id={client_id}", headers=admin).json()["summary"]
    assert s["total_books_records"] == 1 and s["books_total_tax"] == 180.0

    # 5. The firm revokes the key: the agent is told plainly and stops.
    agent_id = web.get("/api/v1/tally-agent/agents", headers=admin).json()[0]["id"]
    web.delete(f"/api/v1/tally-agent/agents/{agent_id}", headers=admin)
    revoked = run_sync(_tally([v1]), uploader, today=today)
    assert not revoked.ok and "revoked" in revoked.fatal


def test_pair_by_approval_auto_link_and_sync_with_no_manual_steps():
    """The whole automatic path: pair (a manager approves once), the company links itself by name, the register syncs."""
    import re
    from fastapi.testclient import TestClient
    from app.core.database import SessionLocal, create_tables
    from app.core.security import create_access_token
    from app.main import app
    from app.models.clients import Client, ClientType, ERPType
    from app.models.tenant import Firm, User
    from tally_agent.pairing import pair

    create_tables()
    web = TestClient(app)
    tenant, uid = uuid.uuid4(), uuid.uuid4()
    with SessionLocal() as db:
        db.add(Firm(id=tenant, firm_code=f"auto-{tenant.hex[:8]}", firm_name="Auto Firm"))
        db.add(User(id=uid, firm_id=tenant, email=f"{uid.hex[:6]}@auto.test", full_name="M", role="PARTNER",
                    hashed_password="x", is_active=True))
        client = Client(tenant_id=tenant, client_name="Acme Pvt Ltd", pan="AABCA1234A", gstin="27AABCA1234A1Z5",
                        client_type=ClientType.COMPANY, erp_type=ERPType.TALLY_PRIME,
                        financial_year_start="2025-04-01", financial_year_end="2026-03-31")
        db.add(client)
        db.commit()
        client_id = str(client.id)
    admin = {"Authorization": "Bearer " + create_access_token({"sub": str(uid), "tenant_id": str(tenant), "role": "PARTNER"},
                                                              expires_delta=timedelta(minutes=30))}

    shown, approved = [], []

    def person_approves_when_the_agent_waits(_seconds):
        """Stands in for the manager clicking Approve in the browser while the agent polls."""
        if shown and not approved:
            code = re.search(r"[A-Z2-9]{4}-[A-Z2-9]{4}", " ".join(shown)).group(0)
            assert web.get(f"/api/v1/tally-agent/enroll/{code}", headers=admin).json()["companies"] == [COMPANY]
            assert web.post(f"/api/v1/tally-agent/enroll/{code}/approve", headers=admin).status_code == 200
            approved.append(code)

    key = pair("http://testserver", [COMPANY], http=web, sleep=person_approves_when_the_agent_waits,
               opener=lambda url: None, out=shown.append, pc_name="FRONT-DESK")
    assert key.startswith("fosk_") and approved

    uploader = Uploader("http://testserver", key, client=web, sleep=lambda s: None)
    report = run_sync(_tally([_voucher("g1", "INV-1", "ABC Traders", "27AAAAA0000A1Z5", 1000, 90, 90)]), uploader, today=date(2026, 1, 20))
    assert report.ok and [c.status for c in report.companies] == ["synced"]          # linked itself: no waiting_for_link

    comp = web.get("/api/v1/tally-agent/companies", headers=admin).json()[0]
    assert comp["link_method"] == "auto" and comp["client_id"] == client_id
    s = web.get(f"/api/v1/returns/reconciliation?client_id={client_id}", headers=admin).json()["summary"]
    assert s["total_books_records"] == 1 and s["books_total_tax"] == 180.0
