"""Firm billing API: tenant isolation, role checks and mass-assignment protection."""
import uuid
from datetime import timedelta

import pytest
from fastapi.testclient import TestClient

from app.core.database import create_tables, SessionLocal
from app.core.security import create_access_token
from app.models.tenant import Firm, User
from app.main import app

client = TestClient(app)


def _token(tenant, role="PARTNER", email=None):
    # Sessions are revalidated against the users table on every request, so the
    # user (and its firm) must really exist for the token to be honoured.
    uid = uuid.uuid4()
    email = email or f"{uid.hex[:8]}@firm.test"
    with SessionLocal() as db:
        if db.get(Firm, tenant) is None:
            db.add(Firm(id=tenant, firm_code=f"fx-{uuid.UUID(str(tenant)).hex[:10]}", firm_name="Test Firm"))
        db.add(User(id=uid, firm_id=tenant, email=email, full_name="Test Person",
                    role=role, hashed_password="x", is_active=True))
        db.commit()
    return create_access_token(
        {"sub": str(uid), "tenant_id": str(tenant), "role": role, "email": email,
         "full_name": "Test Person"},
        expires_delta=timedelta(minutes=30),
    )


def _h(tenant, role="PARTNER", email=None):
    return {"Authorization": f"Bearer {_token(tenant, role, email)}"}


INVOICE = {
    "client_id": "c1",
    "client_name": "Rajesh Textiles Pvt Ltd",
    "client_gstin": "27AAACR1234F1Z5",
    "client_pan": "AAACR1234F",
    "services": [
        {"description": "GST Monthly Compliance", "sac_code": "998215", "quantity": 1, "rate": 8000, "amount": 8000},
    ],
    "period_of_service": "October 2026",
    "issue_date": "2026-10-01",
    "due_date": "2026-10-15",
    "notes": "Test invoice",
}


@pytest.fixture(scope="module", autouse=True)
def _schema():
    create_tables()


@pytest.fixture
def firm_a_invoice():
    tenant_a = uuid.uuid4()
    r = client.post("/api/v1/billing/invoices", json=INVOICE, headers=_h(tenant_a, "MANAGER"))
    assert r.status_code == 200, r.text
    return tenant_a, r.json()


def test_billing_requires_login():
    assert client.get("/api/v1/billing/invoices").status_code == 401
    assert client.get("/api/v1/billing/summary").status_code == 401


def test_invoice_totals_are_server_computed(firm_a_invoice):
    _, inv = firm_a_invoice
    assert inv["subtotal"] == 8000
    assert inv["gst_amount"] == 1440.0
    assert inv["total_amount"] == 9440.0
    assert inv["tds_194j_amount"] == 800.0
    assert inv["net_receivable"] == 8640.0
    assert inv["status"] == "DRAFT"


def test_other_firm_cannot_read_update_or_pay_an_invoice(firm_a_invoice):
    tenant_a, inv = firm_a_invoice
    tenant_b = uuid.uuid4()
    h_b = _h(tenant_b, "PARTNER")

    # firm B does not see firm A's invoices at all
    assert client.get("/api/v1/billing/invoices", headers=h_b).json() == []

    # read / update / send / payment / pdf-data of firm A's invoice are all 404 for firm B
    iid = inv["id"]
    assert client.get(f"/api/v1/billing/invoices/{iid}", headers=h_b).status_code == 404
    assert client.put(f"/api/v1/billing/invoices/{iid}", json={"notes": "hacked"}, headers=h_b).status_code == 404
    assert client.post(f"/api/v1/billing/invoices/{iid}/send", headers=h_b).status_code == 404
    assert client.post(
        f"/api/v1/billing/invoices/{iid}/record-payment",
        json={"amount": 1, "payment_date": "2026-10-10"}, headers=h_b,
    ).status_code == 404
    assert client.get(f"/api/v1/billing/invoices/{iid}/pdf-data", headers=h_b).status_code == 404

    # firm A still sees its invoice, untouched
    r = client.get(f"/api/v1/billing/invoices/{iid}", headers=_h(tenant_a, "MANAGER"))
    assert r.status_code == 200
    assert r.json()["notes"] == "Test invoice"
    assert r.json()["status"] == "DRAFT"

    # and firm B's summary counts nothing of firm A's
    assert client.get("/api/v1/billing/summary", headers=h_b).json()["pending_invoices_count"] == 0


def test_client_portal_users_cannot_see_firm_billing(firm_a_invoice):
    tenant_a, inv = firm_a_invoice
    for role in ("CLIENT_USER", "CLIENT"):
        h = _h(tenant_a, role)
        assert client.get("/api/v1/billing/invoices", headers=h).status_code == 403
        assert client.get(f"/api/v1/billing/invoices/{inv['id']}", headers=h).status_code == 403
        assert client.get("/api/v1/billing/summary", headers=h).status_code == 403


def test_staff_read_but_only_managers_write(firm_a_invoice):
    tenant_a, inv = firm_a_invoice
    trainee = _h(tenant_a, "ARTICLE_TRAINEE")
    # trainees (firm staff) can read…
    assert client.get("/api/v1/billing/invoices", headers=trainee).status_code == 200
    assert client.get(f"/api/v1/billing/invoices/{inv['id']}", headers=trainee).status_code == 200
    # …but cannot create, update, send, or record payments
    assert client.post("/api/v1/billing/invoices", json=INVOICE, headers=trainee).status_code == 403
    assert client.put(f"/api/v1/billing/invoices/{inv['id']}", json={"notes": "x"}, headers=trainee).status_code == 403
    assert client.post(f"/api/v1/billing/invoices/{inv['id']}/send", headers=trainee).status_code == 403
    assert client.post(
        f"/api/v1/billing/invoices/{inv['id']}/record-payment",
        json={"amount": 1, "payment_date": "2026-10-10"}, headers=trainee,
    ).status_code == 403


def test_update_cannot_mass_assign_server_computed_fields(firm_a_invoice):
    tenant_a, inv = firm_a_invoice
    h = _h(tenant_a, "MANAGER")
    r = client.put(
        f"/api/v1/billing/invoices/{inv['id']}",
        json={
            "notes": "legitimate edit",
            "status": "PAID",                 # ignored: status moves only via /send and /record-payment
            "total_amount": 0.01,             # ignored: server-computed
            "net_receivable": 0.01,           # ignored: server-computed
            "payment_received": 999999,       # ignored: payments only via /record-payment
            "invoice_number": "NC/00-00/HAX", # ignored: server-assigned
            "tenant_id": str(uuid.uuid4()),   # ignored: never client-supplied
        },
        headers=h,
    )
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["notes"] == "legitimate edit"
    assert body["status"] == "DRAFT"
    assert body["total_amount"] == inv["total_amount"]
    assert body["net_receivable"] == inv["net_receivable"]
    assert body["payment_received"] == 0.0
    assert body["invoice_number"] == inv["invoice_number"]

    # editing the line items recomputes every total on the server
    r = client.put(
        f"/api/v1/billing/invoices/{inv['id']}",
        json={"services": [{"description": "Tax Audit", "rate": 75000, "amount": 75000}]},
        headers=h,
    )
    assert r.status_code == 200
    body = r.json()
    assert body["subtotal"] == 75000.0
    assert body["total_amount"] == 88500.0
    assert body["net_receivable"] == 81000.0


def test_invoice_numbers_are_per_firm(firm_a_invoice):
    tenant_a, inv_a = firm_a_invoice
    tenant_b = uuid.uuid4()
    r = client.post("/api/v1/billing/invoices", json=INVOICE, headers=_h(tenant_b, "MANAGER"))
    assert r.status_code == 200, r.text
    # firm B's first invoice starts its own sequence, regardless of firm A's numbering
    assert r.json()["invoice_number"] == "NC/26-27/00001"


def test_send_and_payment_drive_status(firm_a_invoice):
    tenant_a, inv = firm_a_invoice
    h = _h(tenant_a, "MANAGER")
    sent = client.post(f"/api/v1/billing/invoices/{inv['id']}/send", headers=h).json()
    assert sent["status"] == "SENT" and sent["sent_at"]

    part = client.post(
        f"/api/v1/billing/invoices/{inv['id']}/record-payment",
        json={"amount": 1000, "payment_date": "2026-10-10", "reference": "NEFT/1"}, headers=h,
    ).json()
    assert part["status"] == "PARTIALLY_PAID" and part["payment_received"] == 1000.0

    paid = client.post(
        f"/api/v1/billing/invoices/{inv['id']}/record-payment",
        json={"amount": 7640, "payment_date": "2026-10-11", "reference": "NEFT/2"}, headers=h,
    ).json()
    assert paid["status"] == "PAID"
