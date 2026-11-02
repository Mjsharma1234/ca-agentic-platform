"""Returns API: tenant-scoped data, no server-side signing, and filing gated on a verified signature."""
from app.models.returns import ReturnStatus
from app.models import GSTReturn

from .test_api_security_gates import env, token, register, open_request, reviewed, sign  # noqa: F401


def sign_it(env, partner, key, pem):
    p = env["http"].get("/api/v1/signing/requests/pending", headers=token(partner)).json()[0]
    return env["http"].post(
        f"/api/v1/signing/requests/{p['id']}/complete",
        json={"signature_b64": sign(key, p["message_b64"]), "certificate_pem": pem}, headers=token(partner),
    )


def test_returns_are_scoped_to_the_tenant(env):
    mine = env["http"].get("/api/v1/returns/", headers=token(env["users"]["preparer"])).json()
    assert [r["id"] for r in mine] == [str(env["ret"].id)] and mine[0]["client"] == "Rajesh Fabrics"
    other = token(env["users"]["other_partner"])
    assert env["http"].get("/api/v1/returns/", headers=other).json() == []
    assert env["http"].get(f"/api/v1/returns/{env['ret'].id}", headers=other).status_code == 404


def test_server_side_signing_and_fabricating_assembly_are_disabled(env):
    hdr = token(env["users"]["partner"])
    assert env["http"].post(f"/api/v1/returns/{env['ret'].id}/sign", headers=hdr).status_code == 410
    assert env["http"].post("/api/v1/returns/assemble", json={}, headers=hdr).status_code == 501


def test_filing_requires_a_verified_signature_and_partner_role(env):
    reviewed(env)
    partner = env["users"]["partner"]
    url = f"/api/v1/returns/{env['ret'].id}/file"
    assert env["http"].post(url, headers=token(env["users"]["manager"])).status_code == 403
    assert env["http"].post(url, headers=token(partner)).status_code == 409  # not signed yet

    key, pem, _ = register(env, partner)
    open_request(env, token(env["users"]["manager"]), partner)
    assert sign_it(env, partner, key, pem).status_code == 200

    # a client-supplied signature/payload is irrelevant: the endpoint takes none
    res = env["http"].post(url, json={"dsc_signature": "forged", "payload_json": {"x": 1}}, headers=token(partner))
    assert res.status_code == 200, res.text
    assert res.json()["status"] == "FILED" and res.json()["arn"]
    env["db"].expire_all()
    assert env["db"].get(GSTReturn, env["ret"].id).status == ReturnStatus.FILED
    assert env["http"].post(url, headers=token(partner)).status_code == 409  # cannot file twice


def test_gsp_pulls_are_limited_to_the_firms_own_gstins(env):
    hdr = token(env["users"]["preparer"])
    assert env["http"].get("/api/v1/returns/gstr2b/29ZZZZZ9999Z1Z9/2026-10", headers=hdr).status_code == 404
    assert env["http"].get("/api/v1/returns/gstr2b/27AABCR1234F1Z8/2026-10", headers=hdr).status_code == 200


def test_reconciliation_and_export_use_tenant_invoices_only(env):
    hdr = token(env["users"]["preparer"])
    empty = env["http"].get("/api/v1/returns/reconciliation", headers=hdr)
    assert empty.status_code == 200 and empty.json()["summary"]["total_books_records"] == 0
    assert env["http"].get("/api/v1/returns/export-tally-xml", headers=hdr).status_code == 404
