from dataclasses import dataclass
from datetime import date, timedelta
from typing import List

@dataclass
class StatutoryDeadline:
    deadline_date: date
    return_type: str
    description: str
    penalty_per_day: float
    is_critical: bool
    days_remaining: int

def get_statutory_deadlines(financial_year: str, gstin: str, client_type: str) -> List[StatutoryDeadline]:
    today = date.today()
    deadlines = []
    # Mocked statutory deadlines based on Indian tax calendar
    deadlines.append(StatutoryDeadline(
        deadline_date=date(today.year, today.month, 11),
        return_type="GSTR-1",
        description="GSTR-1 Monthly",
        penalty_per_day=50.0,
        is_critical=True,
        days_remaining=(date(today.year, today.month, 11) - today).days
    ))
    return deadlines

def get_upcoming_deadlines(days_ahead: int = 30) -> List[StatutoryDeadline]:
    # Returns sorted upcoming deadlines
    today = date.today()
    deadlines = [
        StatutoryDeadline(
            deadline_date=today + timedelta(days=5),
            return_type="GSTR-3B",
            description="GSTR-3B Monthly",
            penalty_per_day=50.0,
            is_critical=True,
            days_remaining=5
        )
    ]
    return sorted(deadlines, key=lambda x: x.deadline_date)

def is_peak_day(d: date) -> bool:
    return d.day in (11, 15, 20)
