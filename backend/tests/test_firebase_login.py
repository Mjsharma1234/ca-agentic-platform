"""Firebase phone-OTP login: ID-token verification, account resolution and the closed built-in OTP path."""
import time
import uuid

import jwt
import pytest
from cryptography.hazmat.primitives.asymmetric import ec, rsa
from fastapi.testclient import TestClient
from sqlalchemy import create_engine, select
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.core import firebase_auth, shared_store
from app.core.config import Settings, settings
from app.core.database import Base, get_db
from app.main import app
from app.models import AuditBlock, Firm, User

from .test_api_security_gates import env  # noqa: F401
from .test_dpop_ocsp_hardening import prod

PROJECT = "ca-test-project"
KID = "test-kid-1"
KEY = rsa.generate_private_key(public_exponent=65537, key_size=2048)
OTHER_KEY = rsa.generate_private_key(public_exponent=65537, key_size=2048)
PHONE = "+919000000001"
URL = "/api/v1/auth/firebase/verify"


def make_token(*, key=KEY, kid=KID, alg="RS256", phone=PHONE, **over):
    now = int(time.time())
    claims = {
        "iss": f"https://securetoken.google.com/{PROJECT}", "aud": PROJECT, "sub": "uid-" + uuid.uuid4().hex[:8],
        "iat": now, "exp": now + 3600, "auth_time": now - 5,
        "firebase": {"sign_in_provider": "phone", "identities": {"phone": [phone]}}, "phone_number": phone,
    }
    claims.update(over)
    for k in [k for k, v in claims.items() if v is None]:
        del claims[k]
    return jwt.encode(claims, key, algorithm=alg, headers={"kid": kid} if kid else {})


@pytest.fixture(autouse=True)
def firebase_mode(monkeypatch):
    shared_store.set_store(None)
    firebase_auth.clear_cache()
    calls = {"n": 0}

    def fake_fetch():
        calls["n"] += 1
        return {KID: KEY.public_key()}, 3600

    monkeypatch.setattr(firebase_auth, "_fetch_certs", fake_fetch)
    monkeypatch.setattr(settings, "FIREBASE_PROJECT_ID", PROJECT)
    monkeypatch.setattr(settings, "LOGIN_PROVIDER", "firebase")
    monkeypatch.setattr(settings, "BOOTSTRAP_ADMIN_PHONE", None)
    monkeypatch.setattr(settings, "DEBUG", True)
    yield calls
    shared_store.set_store(None)
    firebase_auth.clear_cache()


@pytest.fixture()
def partner(env):  # noqa: F811
    user = env["users"]["partner"]
    user.phone = PHONE
    env["db"].commit()
    return user


def login(env, token):
    return env["http"].post(URL, json={"id_token": token})


# ------------------------------------------------------------------ the happy path
def test_valid_phone_token_logs_a_registered_user_in(env, partner):
    resp = login(env, make_token())
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert body["user"]["id"] == str(partner.id) and body["user"]["role"] == "PARTNER"
    me = env["http"].get("/api/v1/auth/me", headers={"Authorization": f"Bearer {body['access_token']}"})
    assert me.status_code == 200
    blocks = env["db"].execute(select(AuditBlock).where(AuditBlock.action == "FIREBASE_AUTH_VERIFIED")).scalars().all()
    assert len(blocks) == 1 and blocks[0].payload_json["identifier"] == PHONE


# ------------------------------------------------------------------ every way a token can be wrong
@pytest.mark.parametrize("name,kwargs", [
    ("forged_signature", dict(key=OTHER_KEY)),
    ("wrong_audience", dict(aud="someone-elses-project")),
    ("wrong_issuer", dict(iss="https://securetoken.google.com/someone-elses-project")),
    ("expired", dict(exp=int(time.time()) - 600, iat=int(time.time()) - 4000)),
    ("no_phone_number", dict(phone_number=None)),
    ("malformed_phone", dict(phone_number="9000000001")),
    ("google_sign_in", dict(firebase={"sign_in_provider": "google.com"})),
    ("anonymous_sign_in", dict(firebase={"sign_in_provider": "anonymous"})),
    ("stale_auth_time", dict(auth_time=int(time.time()) - 3600)),
    ("future_auth_time", dict(auth_time=int(time.time()) + 3600)),
    ("no_auth_time", dict(auth_time=None)),
    ("empty_subject", dict(sub="")),
    ("no_subject", dict(sub=None)),
    ("unknown_kid", dict(kid="rotated-away")),
    ("no_kid", dict(kid=None)),
])
def test_bad_tokens_are_refused(env, partner, name, kwargs):
    resp = login(env, make_token(**kwargs))
    assert resp.status_code == 401, (name, resp.text)
    assert "access_token" not in resp.text


def test_unsigned_and_algorithm_confusion_tokens_are_refused(env, partner):
    now = int(time.time())
    claims = {"iss": f"https://securetoken.google.com/{PROJECT}", "aud": PROJECT, "sub": "u", "iat": now, "exp": now + 99,
              "auth_time": now, "phone_number": PHONE, "firebase": {"sign_in_provider": "phone"}}
    unsigned = jwt.encode(claims, key=None, algorithm="none", headers={"kid": KID})
    assert login(env, unsigned).status_code == 401
    hs = jwt.encode(claims, "x" * 32, algorithm="HS256", headers={"kid": KID})  # algorithm-confusion attempt
    assert login(env, hs).status_code == 401
    ec_token = jwt.encode(claims, ec.generate_private_key(ec.SECP256R1()), algorithm="ES256", headers={"kid": KID})
    assert login(env, ec_token).status_code == 401
    assert login(env, "not-a-jwt").status_code == 401


def test_a_token_can_only_be_exchanged_once(env, partner):
    token = make_token()
    assert login(env, token).status_code == 200
    again = login(env, token)
    assert again.status_code == 401


def test_unknown_key_ids_refetch_certificates_at_most_once_a_minute(env, partner, firebase_mode):
    for _ in range(5):
        assert login(env, make_token(kid="rotated-away")).status_code == 401
    assert firebase_mode["n"] == 1


# ------------------------------------------------------------------ account resolution
def test_unregistered_number_is_refused_and_no_account_is_created(env):
    before = env["db"].execute(select(User)).scalars().all()
    resp = login(env, make_token(phone="+919111111111"))
    assert resp.status_code == 403 and "not registered" in resp.json()["detail"]
    env["db"].expire_all()
    assert len(env["db"].execute(select(User)).scalars().all()) == len(before)


def test_deactivated_user_cannot_log_in(env, partner):
    partner.is_active = False
    env["db"].commit()
    assert login(env, make_token()).status_code == 403


def test_a_number_registered_twice_is_refused(env, partner):
    env["users"]["manager"].phone = PHONE
    env["db"].commit()
    assert login(env, make_token()).status_code == 409


def test_login_is_rate_limited(env, partner):
    codes = [login(env, make_token(phone="+919222222222")).status_code for _ in range(22)]
    assert codes.count(429) >= 1


# ------------------------------------------------------------------ provider switch
def test_builtin_otp_is_closed_when_firebase_is_the_provider(env):
    http = env["http"]
    assert http.post("/api/v1/auth/otp/send", json={"identifier": "+919000000001"}).status_code == 404
    assert http.post("/api/v1/auth/otp/verify", json={"identifier": "+919000000001", "otp": "123456"}).status_code == 404
    cfg = http.get("/api/v1/auth/config").json()
    assert cfg["login_provider"] == "firebase" and cfg["firebase_enabled"] is True
    # public web-app identifiers for the static web app; not ready until the web app id/key are configured
    assert cfg["firebase"]["projectId"] == "ca-test-project"
    assert cfg["firebase"]["authDomain"] == "ca-test-project.firebaseapp.com"
    assert cfg["firebase_web_ready"] is False


def test_auth_config_serves_web_app_identifiers(env, monkeypatch):
    monkeypatch.setattr(settings, "FIREBASE_WEB_API_KEY", "AIza-test")
    monkeypatch.setattr(settings, "FIREBASE_APP_ID", "1:123:web:abc")
    cfg = env["http"].get("/api/v1/auth/config").json()
    assert cfg["firebase"] == {"apiKey": "AIza-test", "authDomain": "ca-test-project.firebaseapp.com",
                               "projectId": "ca-test-project", "appId": "1:123:web:abc"}
    assert cfg["firebase_web_ready"] is True


def test_builtin_otp_still_works_in_otp_mode_and_firebase_is_off(env, monkeypatch):
    monkeypatch.setattr(settings, "LOGIN_PROVIDER", "otp")
    http = env["http"]
    assert http.post("/api/v1/auth/otp/send", json={"identifier": "+919000000001"}).status_code == 200
    assert http.post(URL, json={"id_token": make_token()}).status_code == 503
    assert http.get("/api/v1/auth/config").json() == {"login_provider": "otp", "firebase_enabled": False}


def test_demo_personas_are_hidden_outside_development(env, monkeypatch):
    assert len(env["http"].get("/api/v1/auth/demo-personas").json()) == 4
    monkeypatch.setattr(settings, "DEBUG", False)
    assert env["http"].get("/api/v1/auth/demo-personas").json() == []


def test_production_requires_firebase_login():
    with pytest.raises(ValueError, match="Firebase"):
        prod(FIREBASE_PROJECT_ID=None, LOGIN_PROVIDER=None)
    with pytest.raises(ValueError, match="Firebase"):
        prod(LOGIN_PROVIDER="otp")
    with pytest.raises(ValueError, match="FIREBASE_PROJECT_ID"):
        prod(FIREBASE_PROJECT_ID=None, LOGIN_PROVIDER="firebase")
    assert prod().effective_login_provider == "firebase"
    assert Settings(_env_file=None).effective_login_provider == "otp"


# ------------------------------------------------------------------ first-login bootstrap
@pytest.fixture()
def empty_db():
    engine = create_engine("sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool)
    Base.metadata.create_all(engine)
    Session = sessionmaker(bind=engine, autoflush=False)

    def override():
        s = Session()
        try:
            yield s
        finally:
            s.close()

    app.dependency_overrides[get_db] = override
    yield Session, TestClient(app)
    app.dependency_overrides.pop(get_db, None)
    engine.dispose()


def test_bootstrap_phone_creates_the_first_partner_once(empty_db, monkeypatch):
    Session, http = empty_db
    monkeypatch.setattr(settings, "DEBUG", False)
    # In production the store must be Redis (from_settings refuses otherwise); the
    # bootstrap logic under test doesn't care which backend, so seed one directly.
    shared_store.set_store(shared_store.SharedStore())
    monkeypatch.setattr(settings, "BOOTSTRAP_ADMIN_PHONE", PHONE)
    stranger = http.post(URL, json={"id_token": make_token(phone="+919333333333")})
    assert stranger.status_code == 403
    resp = http.post(URL, json={"id_token": make_token()})
    assert resp.status_code == 200 and resp.json()["user"]["role"] == "PARTNER"
    with Session() as db:
        assert len(db.execute(select(Firm)).scalars().all()) == 1
        assert len(db.execute(select(User)).scalars().all()) == 1
    # the account now exists, so the same number logs in as itself; nobody else can use the bootstrap path
    assert http.post(URL, json={"id_token": make_token()}).status_code == 200
    assert http.post(URL, json={"id_token": make_token(phone="+919333333333")}).status_code == 403


def test_demo_persona_numbers_are_provisioned_only_in_development(empty_db, monkeypatch):
    _, http = empty_db
    persona_phone = "+919876543211"
    monkeypatch.setattr(settings, "DEBUG", False)
    shared_store.set_store(shared_store.SharedStore())
    assert http.post(URL, json={"id_token": make_token(phone=persona_phone)}).status_code == 403
    monkeypatch.setattr(settings, "DEBUG", True)
    resp = http.post(URL, json={"id_token": make_token(phone=persona_phone)})
    assert resp.status_code == 200 and resp.json()["user"]["role"] == "SENIOR_MANAGER"


def test_simultaneous_first_logins_do_not_crash(monkeypatch):
    """Two requests for the same first login: the loser of the race reuses the winner's account (was a 500)."""
    from unittest.mock import MagicMock
    from sqlalchemy.exc import IntegrityError
    from app.api.v1 import auth as auth_api

    monkeypatch.setattr(settings, "BOOTSTRAP_ADMIN_PHONE", "+919313127246")
    winner = MagicMock(name="winner_user")
    db = MagicMock()
    db.execute.side_effect = [
        MagicMock(first=MagicMock(return_value=None)),                                   # no users yet (both requests see this)
        MagicMock(scalars=MagicMock(return_value=MagicMock(first=MagicMock(return_value=MagicMock())))),  # a firm exists
        MagicMock(scalars=MagicMock(return_value=MagicMock(first=MagicMock(return_value=winner)))),       # re-read after the clash
    ]
    db.commit.side_effect = IntegrityError("INSERT", {}, Exception("UNIQUE constraint failed: users.email"))
    assert auth_api._bootstrap_user(db, "+919313127246") is winner
    db.rollback.assert_called_once()
