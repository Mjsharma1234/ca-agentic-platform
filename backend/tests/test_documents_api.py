"""Document intake persists OCR output as tenant-scoped invoices (OCR itself is stubbed for determinism)."""
import pytest

from app.api.v1 import documents as documents_module
from .test_api_security_gates import env, token  # noqa: F401  (shared fixtures)

PNG = b"\x89PNG\r\n\x1a\n" + b"0" * 64


@pytest.fixture(autouse=True)
def stub_ocr(monkeypatch):
    def fake(contents, filename):
        return {
            "doc_type": "TAX_INVOICE", "invoice_number": "INV-77", "invoice_date": "2026-10-05",
            "primary_gstin": "27AAACR5055K1Z8", "primary_pan": "AAACR5055K", "taxable_value": 1000.0, "igst": 180.0,
            "total_value": 1180.0, "confidence": 0.88, "engine": "stub", "raw_text_snippet": "x",
        }
    monkeypatch.setattr(documents_module, "extract_text_and_fields", fake)


def upload(env, hdr, name="bill.png", data=PNG, client_id=None):
    return env["http"].post(
        "/api/v1/documents/upload",
        data={"client_id": str(client_id or env["client"].id)},
        files={"file": (name, data, "image/png")},
        headers=hdr,
    )


def test_upload_requires_authentication(env):
    assert upload(env, {}).status_code == 401


def test_upload_persists_low_confidence_document_for_review(env):
    hdr = token(env["users"]["preparer"])
    res = upload(env, hdr)
    assert res.status_code == 201, res.text
    doc = res.json()
    assert doc["status"] == "NEEDS_REVIEW" and doc["client"] == "Rajesh Fabrics" and doc["total_value"] == 1180.0
    listed = env["http"].get("/api/v1/documents/", headers=hdr).json()
    assert [d["id"] for d in listed] == [doc["id"]]


def test_duplicate_bytes_are_rejected(env):
    hdr = token(env["users"]["preparer"])
    assert upload(env, hdr).status_code == 201
    assert upload(env, hdr).status_code == 409


def test_rejects_bad_extension_empty_file_and_foreign_client(env):
    hdr = token(env["users"]["preparer"])
    assert upload(env, hdr, name="evil.exe").status_code == 400
    assert upload(env, hdr, data=b"").status_code == 400
    assert upload(env, hdr, client_id="00000000-0000-0000-0000-00000000dead").status_code == 404


def test_other_tenants_cannot_see_or_verify_documents(env):
    doc = upload(env, token(env["users"]["preparer"])).json()
    other = token(env["users"]["other_partner"])
    assert env["http"].get("/api/v1/documents/", headers=other).json() == []
    assert env["http"].get(f"/api/v1/documents/{doc['id']}", headers=other).status_code == 404
    assert env["http"].post(f"/api/v1/documents/{doc['id']}/verify", headers=other).status_code == 404


def test_verify_is_a_human_decision_and_not_repeatable(env):
    hdr = token(env["users"]["preparer"])
    doc = upload(env, hdr).json()
    ok = env["http"].post(f"/api/v1/documents/{doc['id']}/verify", headers=hdr)
    assert ok.status_code == 200 and ok.json()["document"]["status"] == "VERIFIED"
    assert env["http"].post(f"/api/v1/documents/{doc['id']}/verify", headers=hdr).status_code == 409
    assert env["http"].post(f"/api/v1/documents/{doc['id']}/verify", headers=token(env["users"]["client"])).status_code == 403
