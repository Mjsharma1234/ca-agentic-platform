"""What the agent says when it is simply started: a code only when the PC is not connected, and a plain reason when there is none."""
import pytest

from tally_agent import cli
from tally_agent.config import Config, ConfigError
from tally_agent.uploader import ServerRejected, ServerUnavailable

CFG = Config(server_url="https://firm.example", agent_key="fosk_abc")


class FakeUploader:
    outcome = None

    def __init__(self, *a, **k):
        pass

    def heartbeat(self, companies):
        if FakeUploader.outcome:
            raise FakeUploader.outcome
        return {"ok": True}


@pytest.fixture
def wired(monkeypatch):
    calls = {"connect": 0, "run": 0}
    monkeypatch.setattr(cli, "Uploader", FakeUploader)
    monkeypatch.setattr(cli, "cmd_run", lambda _a: (calls.__setitem__("run", calls["run"] + 1), 0)[1])
    monkeypatch.setattr(cli, "_connect", lambda *a, **k: (calls.__setitem__("connect", calls["connect"] + 1), 0)[1])
    FakeUploader.outcome = None
    return calls


def test_an_already_connected_pc_says_so_and_does_not_ask_for_a_code(wired, monkeypatch, capsys):
    monkeypatch.setattr(cli, "load", lambda: CFG)
    assert cli.cmd_auto(None) == 0
    out = capsys.readouterr().out
    assert "already connected" in out and "no code to enter" in out and "Disconnect" in out and "https://firm.example" in out
    assert wired == {"connect": 0, "run": 1}          # it did not start a pairing; it went straight to syncing


def test_when_firm_os_is_asleep_it_still_says_there_is_no_code(wired, monkeypatch, capsys):
    monkeypatch.setattr(cli, "load", lambda: CFG)
    FakeUploader.outcome = ServerUnavailable("503")
    assert cli.cmd_auto(None) == 0
    out = capsys.readouterr().out
    assert "already connected" in out and "keeps trying" in out and wired["connect"] == 0 and wired["run"] == 1


def test_a_removed_pc_pairs_again(wired, monkeypatch, capsys):
    monkeypatch.setattr(cli, "load", lambda: CFG)
    FakeUploader.outcome = ServerRejected(401, "KEY_REJECTED", "removed")
    assert cli.cmd_auto(None) == 0
    assert "connection was removed" in capsys.readouterr().out and wired["connect"] == 1 and wired["run"] == 1


def test_a_new_pc_goes_to_pairing(wired, monkeypatch):
    def not_set_up():
        raise ConfigError("not set up")
    monkeypatch.setattr(cli, "load", not_set_up)
    assert cli.cmd_auto(None) == 0
    assert wired["connect"] == 1                      # this is the path that shows the code and opens the browser
