"""Returns API: tenant-scoped reads, disabled assembly, reconciliation and Tally export."""
from .test_api_security_gates import env, token  # noqa: F401


def test_returns_are_scoped_to_the_tenant(env):
    mine = env["http"].get("/api/v1/returns/", headers=token(env["users"]["preparer"])).json()
    assert [r["id"] for r in mine] == [str(env["ret"].id)] and mine[0]["client"] == "Rajesh Fabrics"
    other = token(env["users"]["other_partner"])
    assert env["http"].get("/api/v1/returns/", headers=other).json() == []
    assert env["http"].get(f"/api/v1/returns/{env['ret'].id}", headers=other).status_code == 404


def test_fabricating_assembly_is_disabled(env):
    hdr = token(env["users"]["partner"])
    assert env["http"].post("/api/v1/returns/assemble", json={}, headers=hdr).status_code == 501


def test_reconciliation_and_export_use_tenant_invoices_only(env):
    hdr = token(env["users"]["preparer"])
    empty = env["http"].get("/api/v1/returns/reconciliation", headers=hdr)
    assert empty.status_code == 200 and empty.json()["summary"]["total_books_records"] == 0
    assert env["http"].get("/api/v1/returns/export-tally-xml", headers=hdr).status_code == 404
