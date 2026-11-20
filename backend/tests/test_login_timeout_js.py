"""The phone sign-in must never hang silently: if Firebase's reCAPTCHA never finishes, the page says what to do."""
import shutil
import subprocess
from pathlib import Path

import pytest

NODE = shutil.which("node")


@pytest.mark.skipif(NODE is None, reason="node is not installed")
def test_sendcode_times_out_with_a_clear_message_and_passes_real_errors_through():
    script = Path(__file__).parent / "js" / "otp_timeout_check.js"
    result = subprocess.run([NODE, str(script)], capture_output=True, text=True, timeout=60)
    assert result.returncode == 0, result.stdout + result.stderr
    assert result.stdout.count("PASS") == 6 and "FAIL" not in result.stdout
