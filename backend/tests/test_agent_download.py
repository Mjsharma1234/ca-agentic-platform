"""The Tally agent download offered on the Tally sync page: it must be served, be a real Windows program, match the
published version file, and match the agent's own version, so a CA never downloads a stale or broken file."""
import hashlib
import json
import re
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from app.main import app

ROOT = Path(__file__).resolve().parents[2]
DOWNLOADS = ROOT / "firm_os_web" / "downloads"
EXE = DOWNLOADS / "FirmOSTallyAgent.exe"
INFO = DOWNLOADS / "version.json"

http = TestClient(app)


def _agent_version() -> str:
    return re.search(r'__version__ = "([^"]+)"', (ROOT / "tally-agent" / "tally_agent" / "__init__.py").read_text(encoding="utf-8")).group(1)


def test_the_published_files_exist_and_the_exe_is_a_windows_program():
    assert EXE.is_file() and INFO.is_file()
    head = EXE.read_bytes()[:2]
    assert head == b"MZ", "not a Windows executable"
    assert EXE.stat().st_size > 5_000_000


def test_version_file_describes_exactly_this_exe_and_the_current_agent_version():
    info = json.loads(INFO.read_text(encoding="utf-8"))
    data = EXE.read_bytes()
    assert info["sha256"] == hashlib.sha256(data).hexdigest(), "version.json is stale: rebuild with tally-agent/build_exe.ps1"
    assert info["size_bytes"] == len(data)
    assert info["version"] == _agent_version(), "the published exe is not the current agent version: rebuild and publish it"
    assert info["name"] == "FirmOSTallyAgent.exe" and info["signed"] in (True, False)


def test_the_web_app_serves_the_download_and_the_version_file():
    r = http.get("/downloads/version.json")
    assert r.status_code == 200 and r.json()["name"] == "FirmOSTallyAgent.exe"
    head = http.head("/downloads/FirmOSTallyAgent.exe")
    assert head.status_code == 200 and int(head.headers["content-length"]) == EXE.stat().st_size
    first = http.get("/downloads/FirmOSTallyAgent.exe", headers={"Range": "bytes=0-1"})
    assert first.status_code in (200, 206) and first.content[:2] == b"MZ"


def test_the_tally_page_links_to_the_download_and_reads_its_version():
    page = (ROOT / "firm_os_web" / "js" / "pages-tally.js").read_text(encoding="utf-8")
    assert 'href="downloads/FirmOSTallyAgent.exe"' in page and "downloads/version.json" in page
    for must_say in ("Run anyway", "port <b>9000</b>", "Approve this PC", "not code-signed"):
        assert must_say in page, must_say
