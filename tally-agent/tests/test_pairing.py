"""Pairing flow and start-at-login, with Firm OS faked (httpx.MockTransport) and no real registry or browser."""
import json
import sys

import httpx
import pytest

from tally_agent import autostart
from tally_agent.config import DEFAULT_SERVER, Config, default_server
from tally_agent.pairing import PairingDenied, PairingError, PairingExpired, pair

SERVER = "https://firm.example"
START = {"device_code": "fosd_secret", "user_code": "ABCD-2345", "verification_path": "/#/tally/ABCD-2345",
         "expires_in": 900, "interval": 3}


def fake_server(poll_answers, start_status=200, seen=None):
    answers = list(poll_answers)

    def handler(req: httpx.Request) -> httpx.Response:
        body = json.loads(req.content)
        if seen is not None:
            seen.append((req.url.path, body))
        if req.url.path.endswith("/enroll/start"):
            return httpx.Response(start_status, json=START if start_status == 200 else {"detail": "x"})
        assert body == {"device_code": "fosd_secret"}
        return httpx.Response(200, json=answers.pop(0) if len(answers) > 1 else answers[0])
    return httpx.Client(transport=httpx.MockTransport(handler))


class Clock:
    """A clock that only moves when the agent sleeps, so waits are instant."""
    def __init__(self):
        self.t = 0.0

    def sleep(self, s):
        self.t += s

    def __call__(self):
        return self.t


def run_pair(poll_answers, **kw):
    c, out, opened, seen = Clock(), [], [], []
    http = kw.pop("http", None) or fake_server(poll_answers, seen=seen)
    key = pair(SERVER, ["Acme"], http=http, sleep=c.sleep, clock=c, opener=opened.append, out=out.append, pc_name="FRONT-DESK", **kw)
    return key, out, opened, seen


def test_pair_returns_the_key_after_approval_and_opens_the_link():
    key, out, opened, seen = run_pair([{"status": "pending"}, {"status": "pending"}, {"status": "approved", "key": "fosk_abc", "agent_id": "1"}])
    assert key == "fosk_abc"
    assert opened == [f"{SERVER}/#/tally/ABCD-2345"]
    assert any("ABCD-2345" in line for line in out)                       # the code is shown on the PC for the approver to match
    assert seen[0] == ("/api/v1/tally-agent/enroll/start", {"pc_name": "FRONT-DESK", "agent_version": "0.3.1", "companies": ["Acme"]})
    assert [p for p, _ in seen].count("/api/v1/tally-agent/enroll/poll") == 3


def test_no_browser_still_prints_the_link():
    _, out, opened, _ = run_pair([{"status": "approved", "key": "fosk_x"}], open_browser=False)
    assert opened == [] and any(f"{SERVER}/#/tally/ABCD-2345" in line for line in out)


def test_a_missing_browser_does_not_break_pairing():
    def boom(url):
        raise OSError("no browser")
    c, out = Clock(), []
    key = pair(SERVER, [], http=fake_server([{"status": "approved", "key": "fosk_y"}]), sleep=c.sleep, clock=c, opener=boom, out=out.append)
    assert key == "fosk_y"


def test_denied_expired_and_timeout():
    with pytest.raises(PairingDenied):
        run_pair([{"status": "denied"}])
    with pytest.raises(PairingExpired):
        run_pair([{"status": "expired"}])
    with pytest.raises(PairingExpired):
        run_pair([{"status": "delivered"}])                               # key already collected elsewhere: start again
    with pytest.raises(PairingExpired, match="in time"):
        run_pair([{"status": "pending"}])                                 # clock runs out


def test_server_problems_give_clear_errors():
    with pytest.raises(PairingError, match="too many"):
        run_pair([], http=fake_server([], start_status=429))
    with pytest.raises(PairingError, match="busy"):
        run_pair([], http=fake_server([], start_status=503))

    def down(req):
        raise httpx.ConnectError("no network")
    with pytest.raises(PairingError, match="internet"):
        run_pair([], http=httpx.Client(transport=httpx.MockTransport(down)))


def test_start_retries_while_the_server_wakes_up():
    calls = []

    def handler(req):
        calls.append(req.url.path)
        if req.url.path.endswith("/start"):
            return httpx.Response(503) if len(calls) < 3 else httpx.Response(200, json=START)
        return httpx.Response(200, json={"status": "approved", "key": "fosk_z"})
    key, *_ = run_pair([], http=httpx.Client(transport=httpx.MockTransport(handler)))
    assert key == "fosk_z" and calls[:3] == ["/api/v1/tally-agent/enroll/start"] * 3


# ---------------------------------------------------------------- start at login
class FakeWinreg:
    HKEY_CURRENT_USER, REG_SZ, KEY_SET_VALUE = "HKCU", 1, 2

    def __init__(self):
        self.values = {}

    class _Key:
        def __init__(self, store):
            self.store = store

        def __enter__(self):
            return self

        def __exit__(self, *a):
            return False

    def CreateKey(self, hive, path):
        return self._Key(self.values)

    def OpenKey(self, hive, path, reserved=0, access=0):
        return self._Key(self.values)

    def SetValueEx(self, key, name, _r, _t, value):
        key.store[name] = value

    def QueryValueEx(self, key, name):
        if name not in key.store:
            raise FileNotFoundError(name)
        return key.store[name], 1

    def DeleteValue(self, key, name):
        if name not in key.store:
            raise FileNotFoundError(name)
        del key.store[name]


def test_autostart_on_status_off():
    w = FakeWinreg()
    assert autostart.status(w) is None
    cmd = autostart.enable(w)
    assert autostart.status(w) == cmd and cmd.endswith(" run") and "tally_agent" in cmd and cmd.startswith("cmd.exe /c start")
    assert autostart.disable(w) is True and autostart.status(w) is None
    assert autostart.disable(w) is False                                   # already off


def test_autostart_command_for_the_packaged_exe(monkeypatch):
    monkeypatch.setattr(sys, "frozen", True, raising=False)
    monkeypatch.setattr(sys, "executable", r"C:\Apps\FirmOSTallyAgent.exe")
    assert autostart.launch_command() == r'cmd.exe /c start "" /min "C:\Apps\FirmOSTallyAgent.exe" run'


# ---------------------------------------------------------------- defaults
def test_default_server_is_built_in_and_overridable(monkeypatch):
    monkeypatch.delenv("FIRMOS_SERVER", raising=False)
    assert default_server() == DEFAULT_SERVER == "https://ca-agentic-platform.onrender.com"
    monkeypatch.setenv("FIRMOS_SERVER", "https://other.example")
    assert default_server() == "https://other.example"
    monkeypatch.delenv("FIRMOS_SERVER")
    assert Config(server_url="", agent_key="fosk_a").validate().server_url == DEFAULT_SERVER
