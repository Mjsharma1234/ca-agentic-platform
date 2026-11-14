"""
Static checks for the Firm OS web ops tracker (firm_os_web/).

The tracker is plain browser JavaScript with no build step, so a syntax error in one
file silently disables it (this happened to api-bridge.js and went unnoticed).
These tests make sure every script parses, every script referenced by index.html
exists, and every backend path the API bridge calls is a real FastAPI route.
"""

import re
import shutil
import subprocess
from pathlib import Path

import pytest

WEB_DIR = Path(__file__).resolve().parents[2] / "firm_os_web"
JS_FILES = sorted((WEB_DIR / "js").glob("*.js"))
NODE = shutil.which("node")


def test_web_dir_exists():
    assert (WEB_DIR / "index.html").is_file()
    assert JS_FILES, "no JS files found in firm_os_web/js"


@pytest.mark.skipif(NODE is None, reason="node is not installed")
@pytest.mark.parametrize("js_file", JS_FILES, ids=lambda p: p.name)
def test_js_file_parses(js_file):
    result = subprocess.run([NODE, "--check", str(js_file)], capture_output=True, text=True)
    assert result.returncode == 0, f"{js_file.name} has a syntax error:\n{result.stderr}"


def test_index_html_scripts_exist():
    html = (WEB_DIR / "index.html").read_text(encoding="utf-8")
    srcs = re.findall(r'<script[^>]+src="(js/[^"]+)"', html)
    assert srcs, "index.html loads no local scripts"
    missing = [s for s in srcs if not (WEB_DIR / s).is_file()]
    assert not missing, f"index.html references missing scripts: {missing}"
    assert srcs[-1] == "js/api-bridge.js", "api-bridge.js must load last so it can wrap save()/renderShell()"


def _bridge_paths():
    src = (WEB_DIR / "js" / "api-bridge.js").read_text(encoding="utf-8")
    paths = set(re.findall(r"`\$\{API_BASE\}(/[^`?]*)`", src))
    paths |= set(re.findall(r"_post\('(/[^']+)'", src))
    # Normalise template params (e.g. /firm-os/gates/${gateCode}/decide) to a wildcard.
    return {re.sub(r"\$\{[^}]+\}", "{param}", p) for p in paths}


def _route_matches(path, route_paths):
    pattern = re.escape(path).replace(re.escape("{param}"), r"\{[^}]+\}")
    return any(re.fullmatch(pattern, rp) for rp in route_paths)


def test_bridge_calls_only_existing_backend_routes():
    from app.main import app

    route_paths = {getattr(r, "path", "") for r in app.routes}
    route_paths = {p.removeprefix("/api/v1") for p in route_paths}
    paths = _bridge_paths()
    assert paths, "could not find any backend paths in api-bridge.js"
    missing = sorted(p for p in paths if not _route_matches(p, route_paths))
    assert not missing, f"api-bridge.js calls backend paths that do not exist: {missing}"
