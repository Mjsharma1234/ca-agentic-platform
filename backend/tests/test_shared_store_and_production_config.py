"""Shared store (rate limits / replay protection) and production configuration guards."""
import fakeredis
import pytest

from app.core import shared_store
from app.core.config import Settings


def prod(**over):
    base = dict(
        DEBUG=False, SECRET_KEY="k" * 40, OTP_SANDBOX_MODE=False, FIREBASE_PROJECT_ID="ca-test-project",
        SHARED_STORE_URL="redis://localhost:6379/9", CORS_ORIGINS=["https://app.example.com"],
    )
    base.update(over)
    return Settings(_env_file=None, **base)


@pytest.fixture(autouse=True)
def fresh_state():
    shared_store.set_store(None)
    yield
    shared_store.set_store(None)


def test_shared_store_rate_limit_and_replay_work_across_instances():
    server = fakeredis.FakeServer()
    a = shared_store.SharedStore(fakeredis.FakeRedis(server=server))
    b = shared_store.SharedStore(fakeredis.FakeRedis(server=server))  # a "second worker"
    assert all(a.allow("k", 3, 60) for _ in range(2)) and b.allow("k", 3, 60)
    assert not a.allow("k", 3, 60) and not b.allow("k", 3, 60)
    assert a.once("jti", 60) and not b.once("jti", 60)
    a.reset()
    assert b.once("jti", 60)


def test_shared_store_degrades_to_memory_when_redis_fails():
    class Broken:
        def pipeline(self):
            raise ConnectionError("down")

        def set(self, *a, **k):
            raise ConnectionError("down")

    s = shared_store.SharedStore(Broken())
    assert s.allow("k", 1, 60) and not s.allow("k", 1, 60)
    assert s.once("x", 60) and not s.once("x", 60)


def test_production_boots_with_a_complete_configuration():
    assert prod().DEBUG is False


@pytest.mark.parametrize("over,needle", [
    ({"SHARED_STORE_URL": None}, "SHARED_STORE_URL"),
    ({"CORS_ORIGINS": ["*"]}, "CORS_ORIGINS"),
    ({"OTP_SANDBOX_MODE": True}, "OTP_SANDBOX_MODE"),
    ({"SECRET_KEY": "short"}, "SECRET_KEY"),
])
def test_production_refuses_to_boot_on_unsafe_config(over, needle):
    with pytest.raises(ValueError, match=needle):
        prod(**over)
