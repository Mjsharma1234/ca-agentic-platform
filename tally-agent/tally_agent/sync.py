"""One sync pass: list the open Tally companies, tell Firm OS, and send each linked company's purchase register."""
import time
from dataclasses import dataclass, field
from datetime import date
from typing import Callable, List, Optional

from .tally_client import TallyClient, TallyError
from .uploader import ServerRejected, ServerUnavailable, Uploader


@dataclass
class CompanyResult:
    company: str
    status: str          # synced | waiting_for_link | error
    detail: str = ""


@dataclass
class SyncReport:
    ok: bool = True
    fatal: str = ""
    key_rejected: bool = False   # Firm OS answered 401: the key was removed or never existed
    companies: List[CompanyResult] = field(default_factory=list)

    def summary(self) -> str:
        if self.fatal:
            return self.fatal
        if not self.companies:
            return "No companies are open in Tally."
        return "; ".join(f"{c.company}: {c.status}{' - ' + c.detail if c.detail else ''}" for c in self.companies)


def financial_year(today: date, back: int = 0) -> tuple[date, date]:
    """Indian financial year (1 April to 31 March) containing `today`, `back` years earlier."""
    start_year = (today.year if today.month >= 4 else today.year - 1) - back
    return date(start_year, 4, 1), date(start_year + 1, 3, 31)


def run_sync(tally: TallyClient, uploader: Uploader, financial_years: int = 1, all_types: bool = False,
             today: Optional[date] = None, log: Callable[[str], None] = lambda m: None) -> SyncReport:
    report = SyncReport()
    today = today or date.today()

    try:
        companies = tally.list_companies()
    except TallyError as e:
        report.ok, report.fatal = False, str(e)
        log(f"Tally problem: {e}")
        try:  # still tell Firm OS the PC and agent are alive
            uploader.heartbeat([])
        except (ServerRejected, ServerUnavailable) as he:
            report.fatal += f" (Also: {he})"
        return report

    try:
        linked = {c["company_name"]: c["linked"] for c in uploader.heartbeat(companies)["companies"]}
    except ServerRejected as e:
        report.ok, report.fatal, report.key_rejected = False, e.message, e.status == 401
        return report
    except ServerUnavailable as e:
        report.ok, report.fatal = False, str(e)
        return report

    for name in companies:
        if not linked.get(name):
            report.companies.append(CompanyResult(name, "waiting_for_link", "A manager must link this company to a client in Firm OS."))
            continue
        try:
            for back in range(financial_years):
                start, end = financial_year(today, back)
                xml = tally.fetch_purchase_vouchers(name, start, end, all_types)
                res = uploader.ingest(name, start, end, xml)
                log(f"{name} {start}..{end}: {res['vouchers']} vouchers "
                    f"(+{res['created']} ~{res['updated']} -{res['removed']})")
            report.companies.append(CompanyResult(name, "synced", f"{res['vouchers']} vouchers in the latest period"))
        except ServerRejected as e:
            if e.status == 401:
                report.ok, report.fatal, report.key_rejected = False, e.message, True
                return report
            report.ok = False
            report.companies.append(CompanyResult(name, "error", e.message))
        except (TallyError, ServerUnavailable) as e:
            report.ok = False
            report.companies.append(CompanyResult(name, "error", str(e)))
    return report


POLL_SECONDS = 60          # how often the agent checks in; a manager's "Sync now" is picked up within this
KEY_REMOVED_EXIT_CODE = 3


def run_loop(tally: TallyClient, uploader: Uploader, interval_minutes: int, financial_years: int = 1, all_types: bool = False,
             log: Callable[[str], None] = lambda m: None, sleep: Callable[[float], None] = time.sleep,
             clock: Callable[[], float] = time.monotonic, max_passes: Optional[int] = None) -> int:
    """Syncs every `interval_minutes`, and straight away whenever a manager asks for it in Firm OS.

    Between syncs it checks in every minute (a tiny request) so the request is noticed quickly. If Firm OS says the key
    is no longer valid it stops with exit code 3 instead of retrying forever: someone removed this PC deliberately, and
    starting the agent again pairs it afresh. A network or server problem never stops the loop.
    """
    next_sync = 0.0
    passes = 0
    while max_passes is None or passes < max_passes:
        passes += 1
        asked = False
        try:
            asked = bool(uploader.heartbeat([]).get("sync_requested"))
        except ServerRejected as e:
            if e.status == 401:
                log(f"Stopping: {e.message}")
                return KEY_REMOVED_EXIT_CODE
            log(f"Firm OS refused the check-in: {e.message}")
        except ServerUnavailable as e:
            log(f"Could not check in ({e}); will retry.")
        now = clock()
        if asked or now >= next_sync:
            if asked:
                log("A manager asked for a sync in Firm OS.")
            try:
                report = run_sync(tally, uploader, financial_years, all_types, log=log)
                log("Sync finished: " + report.summary())
                if report.key_rejected:
                    log("Stopping: Firm OS no longer accepts this PC's key. Start the agent again to pair it afresh.")
                    return KEY_REMOVED_EXIT_CODE
            except Exception as e:  # never let one bad pass stop the service
                log(f"Sync failed unexpectedly: {e!r}")
            next_sync = clock() + interval_minutes * 60
        if max_passes is None or passes < max_passes:
            sleep(POLL_SECONDS)
    return 0
