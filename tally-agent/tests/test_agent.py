"""Agent unit tests. Tally and Firm OS are both faked with httpx.MockTransport; nothing touches the network."""
import gzip
import json
import sys
from datetime import date

import httpx
import pytest

from tally_agent import config as cfgmod
from tally_agent.config import Config, ConfigError
from tally_agent.sync import financial_year, run_sync
from tally_agent.tally_client import (TallyClient, TallyError, TallyNotReachable, decode_response,
                                      purchase_vouchers_request)
from tally_agent.uploader import ServerRejected, ServerUnavailable, Uploader

COMPANIES_XML = ('<ENVELOPE><BODY><DATA><COLLECTION>'
                 '<COMPANY NAME="Acme Pvt Ltd"><NAME TYPE="String">Acme Pvt Ltd</NAME></COMPANY>'
                 '<COMPANY NAME="B &amp; C Traders"><NAME>B &amp; C Traders</NAME></COMPANY>'
                 '</COLLECTION></DATA></BODY></ENVELOPE>')


def fake_tally(per_company=None, companies_xml=COMPANIES_XML, utf16=False, seen=None):
    per_company = per_company or {}

    def handler(req: httpx.Request) -> httpx.Response:
        body = req.content.decode("utf-8")
        if seen is not None:
            seen.append(body)
        if "List of Companies" in body:
            raw = companies_xml.encode("utf-16") if utf16 else companies_xml.encode("utf-8")
            return httpx.Response(200, content=raw)
        for name, xml in per_company.items():
            if f"<SVCURRENTCOMPANY>{name.replace('&', '&amp;')}</SVCURRENTCOMPANY>" in body:
                if isinstance(xml, Exception):
                    raise xml
                return httpx.Response(200, content=xml.encode("utf-8"))
        return httpx.Response(200, content=b"<ENVELOPE></ENVELOPE>")

    return TallyClient(client=httpx.Client(transport=httpx.MockTransport(handler)))


class FakeServer:
    """Records calls; `linked` says which companies Firm OS reports as linked."""

    def __init__(self, linked=(), ingest_status=200, ingest_body=None):
        self.linked, self.calls = set(linked), []
        self.ingest_status, self.ingest_body = ingest_status, ingest_body

    def uploader(self, **kw):
        def handler(req: httpx.Request) -> httpx.Response:
            assert req.headers["X-Agent-Key"] == "fosk_test"
            if req.url.path.endswith("/heartbeat"):
                names = json.loads(req.content)["companies"]
                self.calls.append(("heartbeat", names))
                return httpx.Response(200, json={"ok": True, "companies": [{"company_name": n, "linked": n in self.linked} for n in names]})
            payload = json.loads(gzip.decompress(req.content))
            assert req.headers["Content-Encoding"] == "gzip"
            self.calls.append(("ingest", payload["company_name"], payload["period_from"], payload["period_to"]))
            if self.ingest_status != 200:
                return httpx.Response(self.ingest_status, json=self.ingest_body or {"detail": "no"})
            return httpx.Response(200, json={"vouchers": 3, "created": 3, "updated": 0, "removed": 0})
        return Uploader("https://firm.example", "fosk_test", client=httpx.Client(transport=httpx.MockTransport(handler)),
                        sleep=lambda s: None, **kw)


# ---------------------------------------------------------------- tally client
def test_company_list_utf8_and_utf16_with_ampersand():
    assert fake_tally().list_companies() == ["Acme Pvt Ltd", "B & C Traders"]
    assert fake_tally(utf16=True).list_companies() == ["Acme Pvt Ltd", "B & C Traders"]


def test_decode_utf16_without_bom():
    assert decode_response("<ENVELOPE/>".encode("utf-16-le")) == "<ENVELOPE/>"


def test_request_escapes_company_name_and_formats_dates():
    body = purchase_vouchers_request("B & C <Traders>", date(2025, 4, 1), date(2026, 3, 31))
    assert "<SVCURRENTCOMPANY>B &amp; C &lt;Traders&gt;</SVCURRENTCOMPANY>" in body
    assert "<SVFROMDATE>20250401</SVFROMDATE><SVTODATE>20260331</SVTODATE>" in body


def test_agent_only_ever_sends_export_requests():
    seen = []
    t = fake_tally({"Acme Pvt Ltd": "<ENVELOPE/>"}, seen=seen)
    t.list_companies()
    t.fetch_purchase_vouchers("Acme Pvt Ltd", date(2025, 4, 1), date(2026, 3, 31))
    t.fetch_purchase_vouchers("Acme Pvt Ltd", date(2025, 4, 1), date(2026, 3, 31), all_types=True)
    assert seen and all("<TALLYREQUEST>Export</TALLYREQUEST>" in b and "Import" not in b for b in seen)


def test_tally_not_running_gives_actionable_message():
    def boom(req):
        raise httpx.ConnectError("refused")
    t = TallyClient(client=httpx.Client(transport=httpx.MockTransport(boom)))
    with pytest.raises(TallyNotReachable, match="Connectivity"):
        t.list_companies()


def test_non_xml_or_empty_answers_are_errors():
    for content in (b"", b"<html>hello</html>"):
        t = TallyClient(client=httpx.Client(transport=httpx.MockTransport(lambda r, c=content: httpx.Response(200, content=c))))
        with pytest.raises(TallyError):
            t.list_companies()


def test_doctype_in_company_list_is_refused():
    evil = '<!DOCTYPE x [<!ENTITY a "b">]><ENVELOPE><COMPANY NAME="&a;"/></ENVELOPE>'
    with pytest.raises(TallyError, match="DOCTYPE"):
        fake_tally(companies_xml=evil).list_companies()


# ---------------------------------------------------------------- uploader
def test_ingest_retries_server_errors_then_succeeds():
    attempts = []

    def handler(req):
        attempts.append(1)
        return httpx.Response(503) if len(attempts) < 3 else httpx.Response(200, json={"ok": True})
    up = Uploader("https://f.example", "fosk_x", client=httpx.Client(transport=httpx.MockTransport(handler)), sleep=lambda s: None)
    assert up.ingest("A", date(2025, 4, 1), date(2026, 3, 31), "<x/>") == {"ok": True}
    assert len(attempts) == 3


def test_ingest_gives_up_after_retries_and_does_not_retry_client_errors():
    n = []
    up = Uploader("https://f.example", "fosk_x", client=httpx.Client(transport=httpx.MockTransport(lambda r: (n.append(1), httpx.Response(500))[1])), sleep=lambda s: None)
    with pytest.raises(ServerUnavailable):
        up.heartbeat([])
    assert len(n) == 3
    n.clear()
    up = Uploader("https://f.example", "fosk_x", client=httpx.Client(transport=httpx.MockTransport(lambda r: (n.append(1), httpx.Response(401, json={"detail": "x"}))[1])), sleep=lambda s: None)
    with pytest.raises(ServerRejected) as e:
        up.heartbeat([])
    assert len(n) == 1 and e.value.status == 401 and "revoked" in e.value.message


# ---------------------------------------------------------------- sync
def test_financial_year_boundaries():
    assert financial_year(date(2026, 1, 15)) == (date(2025, 4, 1), date(2026, 3, 31))
    assert financial_year(date(2026, 3, 31)) == (date(2025, 4, 1), date(2026, 3, 31))
    assert financial_year(date(2026, 4, 1)) == (date(2026, 4, 1), date(2027, 3, 31))
    assert financial_year(date(2026, 4, 1), back=1) == (date(2025, 4, 1), date(2026, 3, 31))


def test_sync_sends_linked_companies_and_reports_unlinked():
    server = FakeServer(linked={"Acme Pvt Ltd"})
    tally = fake_tally({"Acme Pvt Ltd": "<ENVELOPE/>", "B & C Traders": "<ENVELOPE/>"})
    report = run_sync(tally, server.uploader(), today=date(2026, 1, 15))
    by = {c.company: c.status for c in report.companies}
    assert by == {"Acme Pvt Ltd": "synced", "B & C Traders": "waiting_for_link"}
    assert [c for c in server.calls if c[0] == "ingest"] == [("ingest", "Acme Pvt Ltd", "2025-04-01", "2026-03-31")]


def test_sync_two_financial_years():
    server = FakeServer(linked={"Acme Pvt Ltd"})
    run_sync(fake_tally({"Acme Pvt Ltd": "<ENVELOPE/>"}), server.uploader(), financial_years=2, today=date(2026, 5, 1))
    assert [c[2] for c in server.calls if c[0] == "ingest"] == ["2026-04-01", "2025-04-01"]


def test_one_failing_company_does_not_stop_the_others():
    server = FakeServer(linked={"Acme Pvt Ltd", "B & C Traders"})
    tally = fake_tally({"Acme Pvt Ltd": httpx.ReadTimeout("slow"), "B & C Traders": "<ENVELOPE/>"})
    report = run_sync(tally, server.uploader(), today=date(2026, 1, 15))
    by = {c.company: c.status for c in report.companies}
    assert by == {"Acme Pvt Ltd": "error", "B & C Traders": "synced"} and not report.ok


def test_tally_down_still_sends_heartbeat_and_says_so():
    def boom(req):
        raise httpx.ConnectError("refused")
    tally = TallyClient(client=httpx.Client(transport=httpx.MockTransport(boom)))
    server = FakeServer()
    report = run_sync(tally, server.uploader())
    assert not report.ok and "Tally" in report.fatal and server.calls == [("heartbeat", [])]


def test_revoked_key_stops_the_pass_with_a_clear_message():
    def handler(req):
        return httpx.Response(401, json={"detail": "bad"})
    up = Uploader("https://f.example", "fosk_x", client=httpx.Client(transport=httpx.MockTransport(handler)), sleep=lambda s: None)
    report = run_sync(fake_tally(), up)
    assert not report.ok and "revoked" in report.fatal


def test_server_conflict_is_reported_per_company():
    server = FakeServer(linked={"Acme Pvt Ltd"}, ingest_status=409,
                        ingest_body={"detail": {"code": "EMPTY_SNAPSHOT_WOULD_DELETE", "message": "Nothing was removed."}})
    report = run_sync(fake_tally({"Acme Pvt Ltd": "<ENVELOPE/>"}), server.uploader(), today=date(2026, 1, 15))
    c = next(c for c in report.companies if c.company == "Acme Pvt Ltd")
    assert c.status == "error" and "Nothing was removed" in c.detail


# ---------------------------------------------------------------- config
def test_server_url_must_be_https_unless_local():
    assert cfgmod.validate_server_url("https://firm.example/") == "https://firm.example"
    assert cfgmod.validate_server_url("http://localhost:8000") == "http://localhost:8000"
    for bad in ("http://firm.example", "ftp://x", "not a url", ""):
        with pytest.raises(ConfigError):
            cfgmod.validate_server_url(bad)


def test_config_validation_rules():
    ok = Config(server_url="https://f.example", agent_key="fosk_abc")
    assert ok.validate()
    for bad in (Config(server_url="https://f.example", agent_key="wrong"),
                Config(server_url="https://f.example", agent_key="fosk_a", interval_minutes=1),
                Config(server_url="https://f.example", agent_key="fosk_a", tally_url="http://192.168.1.5:9000"),
                Config(server_url="https://f.example", agent_key="fosk_a", financial_years=0)):
        with pytest.raises(ConfigError):
            bad.validate()


def test_saved_key_is_not_plain_text_and_round_trips(tmp_path, monkeypatch):
    monkeypatch.setenv("FIRMOS_AGENT_HOME", str(tmp_path))
    path = cfgmod.save(Config(server_url="https://f.example", agent_key="fosk_supersecret"))
    assert "supersecret" not in path.read_text(encoding="utf-8")
    assert cfgmod.load().agent_key == "fosk_supersecret"


def test_missing_or_damaged_config_gives_clear_errors(tmp_path, monkeypatch):
    monkeypatch.setenv("FIRMOS_AGENT_HOME", str(tmp_path))
    with pytest.raises(ConfigError, match="not set up"):
        cfgmod.load()
    (tmp_path / "config.json").write_text("{not json", encoding="utf-8")
    with pytest.raises(ConfigError, match="damaged"):
        cfgmod.load()


@pytest.mark.skipif(sys.platform != "win32", reason="DPAPI is Windows-only")
def test_dpapi_seal_is_used_on_windows():
    sealed = cfgmod.seal("fosk_x")
    assert sealed.startswith("dpapi:") and cfgmod.unseal(sealed) == "fosk_x"
