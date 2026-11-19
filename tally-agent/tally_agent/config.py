"""Agent settings, stored per Windows user in %APPDATA%\\FirmOSTallyAgent\\config.json.

The agent key lets whoever holds it push a purchase register into the firm's books, so on Windows it is
encrypted with DPAPI (readable only by the same Windows user on the same PC) rather than saved as plain text.
"""
import base64
import ctypes
import json
import os
import sys
from ctypes import wintypes
from dataclasses import asdict, dataclass
from pathlib import Path
from typing import Optional
from urllib.parse import urlparse

LOCAL_HOSTS = {"localhost", "127.0.0.1", "::1"}
# Where the agent connects unless told otherwise (override with the FIRMOS_SERVER environment variable).
DEFAULT_SERVER = "https://ca-agentic-platform.onrender.com"


def default_server() -> str:
    return os.environ.get("FIRMOS_SERVER", "").strip() or DEFAULT_SERVER


class ConfigError(Exception):
    pass


def config_dir() -> Path:
    base = os.environ.get("APPDATA") or str(Path.home())
    return Path(os.environ.get("FIRMOS_AGENT_HOME") or Path(base) / "FirmOSTallyAgent")


def validate_server_url(url: str) -> str:
    u = urlparse(url.strip())
    if u.scheme not in ("https", "http") or not u.hostname:
        raise ConfigError("Server address must look like https://your-firm-os.example.com")
    if u.scheme == "http" and u.hostname not in LOCAL_HOSTS:
        raise ConfigError("The server address must start with https:// (plain http would expose the agent key).")
    return url.strip().rstrip("/")


# ---- DPAPI (Windows). Elsewhere (tests, other OSes) the key is stored with a marker and a warning in the docs.
class _Blob(ctypes.Structure):
    _fields_ = [("cbData", wintypes.DWORD), ("pbData", ctypes.POINTER(ctypes.c_char))]


def _dpapi(data: bytes, protect: bool) -> bytes:
    buf = ctypes.create_string_buffer(data, len(data))
    src = _Blob(len(data), ctypes.cast(buf, ctypes.POINTER(ctypes.c_char)))
    out = _Blob()
    fn = ctypes.windll.crypt32.CryptProtectData if protect else ctypes.windll.crypt32.CryptUnprotectData
    ok = fn(ctypes.byref(src), None, None, None, None, 0, ctypes.byref(out))
    if not ok:
        raise ConfigError("Windows could not " + ("encrypt" if protect else "decrypt") + " the saved agent key. Run setup again.")
    try:
        return ctypes.string_at(out.pbData, out.cbData)
    finally:
        ctypes.windll.kernel32.LocalFree(out.pbData)


def seal(secret: str) -> str:
    raw = secret.encode("utf-8")
    if sys.platform == "win32":
        return "dpapi:" + base64.b64encode(_dpapi(raw, True)).decode()
    return "plain:" + base64.b64encode(raw).decode()


def unseal(stored: str) -> str:
    kind, _, payload = stored.partition(":")
    raw = base64.b64decode(payload)
    if kind == "dpapi":
        if sys.platform != "win32":
            raise ConfigError("The saved agent key was encrypted on Windows. Run setup again.")
        return _dpapi(raw, False).decode("utf-8")
    if kind == "plain":
        return raw.decode("utf-8")
    raise ConfigError("Saved agent key is unreadable. Run setup again.")


@dataclass
class Config:
    server_url: str = ""    # empty means the built-in default server
    agent_key: str = ""
    tally_url: str = "http://localhost:9000"
    interval_minutes: int = 60
    financial_years: int = 1          # how many financial years back to send; 2 also covers late entries for last year
    fetch_all_voucher_types: bool = False  # fallback if Tally ignores our purchase filter (the server filters again)

    def validate(self) -> "Config":
        self.server_url = validate_server_url(self.server_url or default_server())
        if not self.agent_key.startswith("fosk_"):
            raise ConfigError("That does not look like a Firm OS agent key (it should start with fosk_).")
        if self.interval_minutes < 5:
            raise ConfigError("Sync interval must be at least 5 minutes.")
        if not 1 <= self.financial_years <= 5:
            raise ConfigError("financial_years must be between 1 and 5.")
        t = urlparse(self.tally_url)
        if t.hostname not in LOCAL_HOSTS:
            raise ConfigError("Tally must be on this same PC (localhost). The agent never talks to Tally over a network.")
        return self


def config_path() -> Path:
    return config_dir() / "config.json"


def save(cfg: Config) -> Path:
    cfg.validate()
    path = config_path()
    path.parent.mkdir(parents=True, exist_ok=True)
    data = asdict(cfg)
    data["agent_key"] = seal(cfg.agent_key)
    path.write_text(json.dumps(data, indent=2), encoding="utf-8")
    return path


def load(path: Optional[Path] = None) -> Config:
    path = path or config_path()
    if not path.exists():
        raise ConfigError("The agent is not set up yet. Run: firmos-tally-agent setup")
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
        data["agent_key"] = unseal(data.get("agent_key", ""))
        known = {k: v for k, v in data.items() if k in Config.__dataclass_fields__}
        return Config(**known).validate()
    except (ValueError, TypeError, KeyError) as e:
        raise ConfigError(f"Settings file is damaged ({e}). Run setup again.")
