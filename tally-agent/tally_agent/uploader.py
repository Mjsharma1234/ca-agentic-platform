"""Sends heartbeats and register snapshots to Firm OS over HTTPS. Outbound only; the key goes in X-Agent-Key."""
import gzip
import json
import time
from datetime import date
from typing import Any, Dict, List, Optional

import httpx

from . import __version__

API = "/api/v1/tally-agent"


class ServerRejected(Exception):
    """Firm OS answered with a 4xx: retrying will not help."""

    def __init__(self, status: int, code: str, message: str):
        super().__init__(message)
        self.status, self.code, self.message = status, code, message


class ServerUnavailable(Exception):
    pass


def _explain(r: httpx.Response) -> ServerRejected:
    code, message = "", ""
    try:
        detail = r.json().get("detail")
        if isinstance(detail, dict):
            code, message = detail.get("code", ""), detail.get("message", "")
        else:
            message = str(detail)
    except ValueError:
        message = r.text[:200]
    if r.status_code == 401:
        code = code or "KEY_REJECTED"
        message = "Firm OS does not accept this agent key. It may have been revoked; ask your firm administrator for a new one."
    return ServerRejected(r.status_code, code, message or f"Firm OS answered with HTTP {r.status_code}.")


class Uploader:
    def __init__(self, server_url: str, agent_key: str, client: Optional[Any] = None,
                 retries: int = 3, backoff: float = 2.0, sleep=time.sleep):
        self.base = server_url.rstrip("/") + API
        self.key = agent_key
        self._http = client or httpx.Client(timeout=120.0)
        self.retries, self.backoff, self._sleep = retries, backoff, sleep

    def _send(self, path: str, **kwargs) -> Dict[str, Any]:
        headers = {"X-Agent-Key": self.key, **kwargs.pop("headers", {})}
        last: Exception | None = None
        for attempt in range(self.retries):
            try:
                r = self._http.post(self.base + path, headers=headers, **kwargs)
            except httpx.TransportError as e:
                last = ServerUnavailable(f"Could not reach Firm OS: {e.__class__.__name__}")
            else:
                if r.status_code == 200:
                    return r.json()
                if r.status_code < 500 and r.status_code != 429:
                    raise _explain(r)
                last = ServerUnavailable(f"Firm OS is busy or down (HTTP {r.status_code}).")
            if attempt < self.retries - 1:
                self._sleep(self.backoff * (2 ** attempt))
        raise last or ServerUnavailable("Firm OS did not answer.")

    def heartbeat(self, companies: List[str]) -> Dict[str, Any]:
        return self._send("/heartbeat", json={"agent_version": __version__, "companies": companies})

    def ingest(self, company: str, start: date, end: date, xml: str, allow_empty: bool = False) -> Dict[str, Any]:
        body = gzip.compress(json.dumps({
            "company_name": company, "period_from": start.isoformat(), "period_to": end.isoformat(),
            "xml": xml, "allow_empty": allow_empty,
        }).encode("utf-8"))
        return self._send("/ingest", content=body,
                          headers={"Content-Encoding": "gzip", "Content-Type": "application/json"})
