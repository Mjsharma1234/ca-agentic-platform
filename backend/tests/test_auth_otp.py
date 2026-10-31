import pytest
import uuid
from datetime import datetime, timedelta, timezone
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker, Session
from fastapi import HTTPException

from app.core.database import Base
from app.models.tenant import Firm, User, UserRole, AuditBlock
from app.models.otp import OTPRecord
from app.deterministic_core.otp_service import OTPService
from app.api.v1.auth import send_otp, verify_otp, get_my_profile, SendOTPRequest, VerifyOTPRequest
from app.api.deps import User as DepUser, require_role

# In-memory SQLite fixture for testing
TEST_DB_URL = "sqlite:///:memory:"

@pytest.fixture
def db_session():
    engine = create_engine(TEST_DB_URL, connect_args={"check_same_thread": False})
    Base.metadata.create_all(bind=engine)
    TestingSessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
    session = TestingSessionLocal()
    try:
        yield session
    finally:
        session.close()
        Base.metadata.drop_all(bind=engine)

# -------------------------------------------------------------
# Unit Tests for OTPService
# -------------------------------------------------------------
def test_normalize_identifier_phone_variations():
    # 10 digits
    norm, ch = OTPService.normalize_identifier("9876543210")
    assert norm == "+919876543210"
    assert ch == "SMS"

    # With dashes and spaces
    norm2, ch2 = OTPService.normalize_identifier(" 98765-43210 ")
    assert norm2 == "+919876543210"
    assert ch2 == "SMS"

    # With +91
    norm3, ch3 = OTPService.normalize_identifier("+91 98765 43210")
    assert norm3 == "+919876543210"
    assert ch3 == "SMS"

def test_normalize_identifier_email():
    norm, ch = OTPService.normalize_identifier(" Partner.Audit@CaFirm.IN ")
    assert norm == "partner.audit@cafirm.in"
    assert ch == "EMAIL"

def test_normalize_identifier_invalid():
    with pytest.raises(ValueError):
        OTPService.normalize_identifier("12345") # too short

    with pytest.raises(ValueError):
        OTPService.normalize_identifier("invalid-email-no-domain@")

def test_generate_and_verify_otp_lifecycle(db_session: Session):
    phone = "+919876543210"
    
    # 1. Generate OTP
    res = OTPService.generate_and_send_otp(db_session, phone, "SMS")
    assert res["status"] == "sent"
    assert "dev_otp" in res
    otp = res["dev_otp"]
    assert len(otp) == 6

    # 2. Try wrong OTP
    is_valid, msg = OTPService.verify_otp(db_session, phone, "000000")
    assert is_valid is False
    assert "2 attempt(s) remaining" in msg

    # 3. Try correct OTP
    is_valid_success, msg_success = OTPService.verify_otp(db_session, phone, otp)
    assert is_valid_success is True
    assert "successfully" in msg_success

    # 4. Try re-using already consumed OTP
    is_valid_reuse, msg_reuse = OTPService.verify_otp(db_session, phone, otp)
    assert is_valid_reuse is False

def test_otp_max_attempts_exceeded(db_session: Session):
    email = "tax.audit@example.com"
    res = OTPService.generate_and_send_otp(db_session, email, "EMAIL")
    
    # Attempt 1
    v1, _ = OTPService.verify_otp(db_session, email, "111111")
    assert v1 is False
    # Attempt 2
    v2, _ = OTPService.verify_otp(db_session, email, "222222")
    assert v2 is False
    # Attempt 3 (Max limit reached)
    v3, msg3 = OTPService.verify_otp(db_session, email, "333333")
    assert v3 is False
    assert "Maximum verification attempts exceeded" in msg3

# -------------------------------------------------------------
# Integration Tests for Auth Endpoints
# -------------------------------------------------------------
class MockRequest:
    def __init__(self):
        self.client = type("Client", (), {"host": "127.0.0.1"})()
        self.headers = {"user-agent": "FastAPI-Test-Client"}

def test_api_auth_flow_partner_login(db_session: Session):
    # 1. Request OTP for Partner
    send_req = SendOTPRequest(identifier="+919876543210")
    send_res = send_otp(send_req, db=db_session)
    assert send_res["status"] == "sent"
    otp = send_res["dev_otp"]

    # 2. Verify OTP and receive JWT
    verify_req = VerifyOTPRequest(identifier="+919876543210", otp=otp)
    mock_req = MockRequest()
    auth_res = verify_otp(verify_req, request=mock_req, db=db_session)
    
    assert auth_res.access_token is not None
    assert auth_res.user.role == UserRole.PARTNER.value
    assert auth_res.user.full_name == "CA Amit Sharma, FCA"
    assert auth_res.user.membership_no == "ICAI-FCA-504912"

    # 3. Check that cryptographic SQC 1 AuditBlock was recorded
    audit_blocks = db_session.execute(
        AuditBlock.__table__.select().where(AuditBlock.action == "LOGIN_OTP_VERIFIED")
    ).fetchall()
    assert len(audit_blocks) >= 1
    assert audit_blocks[0].actor_role == UserRole.PARTNER.value

    # 4. Check /me endpoint with DepUser
    dep_user = DepUser(
        id=auth_res.user.id,
        tenant_id=auth_res.user.firm_id,
        role=auth_res.user.role,
        email=auth_res.user.email,
        full_name=auth_res.user.full_name
    )
    me_res = get_my_profile(current_user=dep_user, db=db_session)
    assert me_res.email == auth_res.user.email
    assert me_res.role == UserRole.PARTNER.value

def test_rbac_role_gate_permissions():
    # Partner passes PARTNER requirement
    partner_user = DepUser(id=str(uuid.uuid4()), tenant_id=str(uuid.uuid4()), role="PARTNER")
    checker_partner = require_role("PARTNER")
    assert checker_partner(partner_user).role == "PARTNER"

    # Manager passes MANAGER requirement
    mgr_user = DepUser(id=str(uuid.uuid4()), tenant_id=str(uuid.uuid4()), role="MANAGER")
    checker_mgr = require_role("MANAGER")
    assert checker_mgr(mgr_user).role == "MANAGER"

    # Trainee gets 403 on PARTNER requirement
    trainee_user = DepUser(id=str(uuid.uuid4()), tenant_id=str(uuid.uuid4()), role="ARTICLE_TRAINEE")
    with pytest.raises(HTTPException) as exc_info:
        checker_partner(trainee_user)
    assert exc_info.value.status_code == 403
    assert "Operation requires PARTNER privilege" in exc_info.value.detail
