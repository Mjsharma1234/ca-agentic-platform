import io
import pytest
from fastapi.testclient import TestClient
from app.main import app
from app.core.security import create_access_token

client = TestClient(app)

def test_unauthenticated_gates_endpoint_returns_401():
    """Unauthenticated requests to gate listing must be rejected with 401."""
    # When no auth headers are passed, should return 401
    resp = client.get("/api/v1/gates")
    # In test environment with PYTEST_CURRENT_TEST, deps.py checks if test headers are present.
    # Without test headers or bearer token, it must reject.
    assert resp.status_code == 401
    assert "Authentication required" in resp.json()["detail"]

def test_article_trainee_cannot_approve_g7_dsc_gate():
    """Article trainee role attempting G7 DSC signing must return 403 Forbidden."""
    trainee_token = create_access_token(
        data={
            "sub": "00000000-0000-0000-0000-000000000099",
            "role": "ARTICLE_TRAINEE",
            "tenant_id": "00000000-0000-0000-0000-000000000001",
            "email": "trainee@cafirm.in"
        }
    )
    headers = {"Authorization": f"Bearer {trainee_token}"}
    resp = client.post(
        "/api/v1/gates/g07/approve",
        json={"notes": "Trainee trying to sign with DSC"},
        headers=headers
    )
    assert resp.status_code == 403
    assert "Gate G7 requires Partner privilege" in resp.json()["detail"]

def test_partner_can_approve_g7_gate():
    """Chartered Accountant Partner can approve Gate G7."""
    partner_token = create_access_token(
        data={
            "sub": "00000000-0000-0000-0000-000000000002",
            "role": "PARTNER",
            "tenant_id": "00000000-0000-0000-0000-000000000001",
            "email": "partner@cafirm.in"
        }
    )
    headers = {"Authorization": f"Bearer {partner_token}"}
    resp = client.post(
        "/api/v1/gates/g07/approve",
        json={"notes": "Partner signing verified return with Class 3 DSC"},
        headers=headers
    )
    assert resp.status_code == 200
    data = resp.json()
    assert data["status"] == "APPROVED"
    assert data["gate_id"] == "g07"

def test_client_import_file_extension_validation():
    """Client bulk onboarding rejects non-spreadsheet extensions (.sh, .exe, .py)."""
    fake_file = io.BytesIO(b"malicious script")
    resp = client.post(
        "/api/v1/clients/import-excel",
        files={"file": ("exploit.sh", fake_file, "application/x-sh")}
    )
    assert resp.status_code == 400
    assert "Invalid file type" in resp.json()["detail"]

def test_client_import_file_size_limit():
    """Client onboarding rejects files exceeding 10MB to protect against DoS."""
    # 11 MB payload
    large_payload = io.BytesIO(b"0" * (11 * 1024 * 1024))
    resp = client.post(
        "/api/v1/clients/import-excel",
        files={"file": ("big_clients.xlsx", large_payload, "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")}
    )
    assert resp.status_code == 413
    assert "File exceeds maximum upload size limit" in resp.json()["detail"]

def test_document_upload_file_extension_validation():
    """Document upload rejects unauthorized extensions."""
    fake_file = io.BytesIO(b"dummy")
    resp = client.post(
        "/api/v1/documents/upload",
        files={"file": ("script.exe", fake_file, "application/octet-stream")}
    )
    assert resp.status_code == 400
    assert "Invalid file type" in resp.json()["detail"]

def test_dsc_sign_requires_partner_role():
    """Firm OS DSC signing endpoint rejects non-partner role when token is supplied."""
    trainee_token = create_access_token(
        data={
            "sub": "00000000-0000-0000-0000-000000000099",
            "role": "ARTICLE_TRAINEE",
            "tenant_id": "00000000-0000-0000-0000-000000000001",
            "email": "trainee@cafirm.in"
        }
    )
    headers = {"Authorization": f"Bearer {trainee_token}"}
    resp = client.post(
        "/api/v1/firm-os/dsc/sign",
        json={"item_id": "q01", "partner_id": "trainee", "pin": "123456"},
        headers=headers
    )
    assert resp.status_code == 403
    assert "DSC signing ceremony strictly restricted to Chartered Accountant Partners" in resp.json()["detail"]

def test_security_headers_present_on_responses():
    """Ensures HTTP security headers (nosniff, SAMEORIGIN, etc.) are present."""
    resp = client.get("/health")
    assert resp.headers.get("X-Content-Type-Options") == "nosniff"
    assert resp.headers.get("X-Frame-Options") == "SAMEORIGIN"
    assert "strict-origin" in resp.headers.get("Referrer-Policy")
