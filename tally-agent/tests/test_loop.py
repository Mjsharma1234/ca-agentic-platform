"""The agent's run loop: hourly sync, 'sync now' from Firm OS, and stopping when its key is removed. Fake clock, no network."""
from tally_agent.sync import KEY_REMOVED_EXIT_CODE, POLL_SECONDS, run_loop
from tally_agent.uploader import ServerRejected, ServerUnavailable


class FakeTally:
    def __init__(self, fail=None):
        self.fail = fail

    def list_companies(self):
        if self.fail:
            raise self.fail
        return ["Acme"]

    def fetch_purchase_vouchers(self, *a, **k):
        return "<ENVELOPE/>"


class FakeUploader:
    """`beats` is the list of answers to successive check-ins; an exception is raised, anything else is returned."""

    def __init__(self, beats=(), ingest_error=None):
        self.beats, self.calls, self.ingest_error = list(beats), [], ingest_error

    def heartbeat(self, companies):
        self.calls.append("hb")
        beat = self.beats.pop(0) if self.beats else {}
        if isinstance(beat, Exception):
            raise beat
        return {"ok": True, "sync_requested": beat.get("sync_requested", False),
                "companies": [{"company_name": c, "linked": True} for c in companies]}

    def ingest(self, company, start, end, xml, allow_empty=False):
        self.calls.append("ingest")
        if self.ingest_error:
            raise self.ingest_error
        return {"vouchers": 1, "created": 1, "updated": 0, "removed": 0}


class Clock:
    def __init__(self):
        self.t = 0.0

    def sleep(self, s):
        self.t += s

    def __call__(self):
        return self.t


def drive(uploader, passes, interval=5, tally=None):
    clock, log = Clock(), []
    code = run_loop(tally or FakeTally(), uploader, interval, log=log.append, sleep=clock.sleep, clock=clock, max_passes=passes)
    return code, log, clock


def syncs(up):
    return up.calls.count("ingest")


def test_syncs_at_once_then_only_when_the_interval_has_passed():
    up = FakeUploader()
    code, _, clock = drive(up, passes=7, interval=5)           # passes are a minute apart: t = 0, 60, ... 360
    assert code == 0 and POLL_SECONDS == 60
    assert syncs(up) == 2                                       # at t=0 and t=300 only
    assert clock.t == 6 * POLL_SECONDS


def test_checks_in_every_minute_even_when_not_syncing():
    up = FakeUploader()
    drive(up, passes=4, interval=60)
    assert up.calls.count("hb") >= 4 and syncs(up) == 1


def test_a_managers_sync_now_triggers_an_extra_sync_straight_away():
    up = FakeUploader(beats=[{}, {}, {"sync_requested": True}, {}])
    _, log, _ = drive(up, passes=4, interval=60)
    assert syncs(up) == 2                                       # the first pass, plus the requested one at pass 3 (an hour not up)
    assert any("manager asked" in line for line in log)


def test_stops_with_exit_code_3_when_the_key_is_removed_at_check_in():
    up = FakeUploader(beats=[ServerRejected(401, "KEY_REJECTED", "Firm OS does not accept this agent key.")])
    code, log, _ = drive(up, passes=10)
    assert code == KEY_REMOVED_EXIT_CODE == 3 and syncs(up) == 0
    assert any("Stopping" in line for line in log)


def test_stops_when_the_key_is_removed_during_a_sync():
    class Revoked(FakeUploader):
        def heartbeat(self, companies):
            self.calls.append("hb")
            if companies:                                        # the check-in is fine, the sync's own heartbeat is refused
                raise ServerRejected(401, "KEY_REJECTED", "removed")
            return {"ok": True}
    code, log, _ = drive(Revoked(), passes=5)
    assert code == 3 and any("pair it afresh" in line for line in log)


def test_a_server_outage_never_stops_the_loop():
    down = ServerUnavailable("Firm OS is busy or down (HTTP 503).")
    up = FakeUploader(beats=[down, down, down, {}])
    code, log, _ = drive(up, passes=4, interval=1)
    assert code == 0 and any("retry" in line for line in log) and syncs(up) >= 1


def test_a_non_401_refusal_is_logged_and_the_loop_carries_on():
    up = FakeUploader(beats=[ServerRejected(429, "", "slow down"), {}])
    code, log, _ = drive(up, passes=2, interval=1)
    assert code == 0 and any("refused" in line for line in log)


def test_tally_being_closed_is_reported_and_the_loop_continues():
    from tally_agent.tally_client import TallyNotReachable
    up = FakeUploader()
    code, log, _ = drive(up, passes=3, interval=1, tally=FakeTally(fail=TallyNotReachable("Tally is closed")))
    assert code == 0 and any("Tally is closed" in line for line in log) and syncs(up) == 0


def test_an_unexpected_error_in_one_sync_does_not_stop_the_service():
    class Boom(FakeTally):
        def list_companies(self):
            raise RuntimeError("something unforeseen")
    code, log, _ = drive(FakeUploader(), passes=2, interval=1, tally=Boom())
    assert code == 0 and any("unexpectedly" in line for line in log)
