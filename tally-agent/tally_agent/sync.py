"""One sync pass: list the open Tally companies, tell Firm OS, and send each linked company's purchase register."""
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
        report.ok, report.fatal = False, e.message
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
                report.ok, report.fatal = False, e.message
                return report
            report.ok = False
            report.companies.append(CompanyResult(name, "error", e.message))
        except (TallyError, ServerUnavailable) as e:
            report.ok = False
            report.companies.append(CompanyResult(name, "error", str(e)))
    return report
