"""Pairs this PC with a firm in Firm OS with no keys to copy.

The agent registers itself, opens Firm OS in the browser with a one-time code, and waits while a signed-in manager
approves it. The agent key is then handed over once and saved. Nothing is typed on the PC.
"""
import socket
import time
import webbrowser
from typing import Any, Callable, List, Optional

import httpx

from . import __version__

START = "/api/v1/tally-agent/enroll/start"
POLL = "/api/v1/tally-agent/enroll/poll"


class PairingError(Exception):
    pass


class PairingDenied(PairingError):
    pass


class PairingExpired(PairingError):
    pass


def _post(http: Any, url: str, json_body: dict, retries: int = 3, backoff: float = 2.0, sleep=time.sleep) -> dict:
    """Retries network faults and 5xx (Render's free plan can take a minute to wake); a 4xx is final."""
    last: Optional[Exception] = None
    for attempt in range(retries):
        try:
            r = http.post(url, json=json_body)
        except httpx.TransportError as e:
            last = PairingError(f"Could not reach Firm OS ({e.__class__.__name__}). Check the internet connection.")
        else:
            if r.status_code == 200:
                return r.json()
            if r.status_code == 429:
                raise PairingError("Firm OS says there have been too many pairing attempts. Try again in a few minutes.")
            if r.status_code < 500:
                raise PairingError(f"Firm OS refused the pairing request (HTTP {r.status_code}).")
            last = PairingError(f"Firm OS is busy or starting up (HTTP {r.status_code}).")
        if attempt < retries - 1:
            sleep(backoff * (2 ** attempt))
    raise last or PairingError("Firm OS did not answer.")


def pair(server_url: str, companies: Optional[List[str]] = None, *, open_browser: bool = True,
         http: Optional[Any] = None, sleep: Callable[[float], None] = time.sleep, clock: Callable[[], float] = time.monotonic,
         opener: Callable[[str], Any] = webbrowser.open, out: Callable[[str], None] = print, pc_name: Optional[str] = None,
         max_wait: float = 15 * 60) -> str:
    """Runs the whole pairing and returns the agent key. Raises PairingDenied / PairingExpired / PairingError."""
    base = server_url.rstrip("/")
    client = http or httpx.Client(timeout=60.0)
    started = _post(client, base + START, {
        "pc_name": (pc_name or socket.gethostname())[:80], "agent_version": __version__, "companies": companies or [],
    }, sleep=sleep)
    link = base + started["verification_path"]
    interval = max(1, int(started.get("interval", 3)))
    out("")
    out("To connect this PC to your firm in Firm OS:")
    out(f"  1. Open {link}")
    out("  2. Sign in if asked, and check this code matches the one on the page:")
    out(f"        {started['user_code']}")
    out("  3. Click Approve. Only approve if you started this on this PC just now.")
    out("")
    if open_browser:
        try:
            opener(link)
        except Exception:  # no browser available: the link above still works
            pass
    deadline = clock() + min(max_wait, float(started.get("expires_in", max_wait)))
    out("Waiting for approval...")
    while clock() < deadline:
        sleep(interval)
        answer = _post(client, base + POLL, {"device_code": started["device_code"]}, sleep=sleep)
        status = answer.get("status")
        if status == "approved":
            return answer["key"]
        if status == "denied":
            raise PairingDenied("The request was declined in Firm OS.")
        if status in ("expired", "delivered"):
            raise PairingExpired("The pairing request expired. Run the agent again to get a new code.")
    raise PairingExpired("Nobody approved the request in time. Run the agent again to get a new code.")
