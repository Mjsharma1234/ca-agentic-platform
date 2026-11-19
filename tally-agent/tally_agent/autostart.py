"""Starts the agent when this Windows user logs in, so syncing carries on without anyone running commands.

Uses the per-user Run registry key (HKEY_CURRENT_USER): no administrator rights, no system-wide change, and
`autostart off` removes it. The command runs the sync loop in a minimised window.
"""
import sys
from pathlib import Path
from typing import Any, Optional

RUN_KEY = r"Software\Microsoft\Windows\CurrentVersion\Run"
VALUE_NAME = "FirmOSTallyAgent"


def launch_command() -> str:
    """The command Windows runs at login: this program (the packaged .exe, or python -m tally_agent) with `run`."""
    if getattr(sys, "frozen", False):
        target = f'"{sys.executable}" run'
    else:
        exe = Path(sys.executable)
        pyw = exe.with_name("pythonw.exe")
        target = f'"{pyw if pyw.exists() else exe}" -m tally_agent run'
    return f'cmd.exe /c start "" /min {target}'


def _winreg(winreg: Optional[Any]):
    if winreg is not None:
        return winreg
    if sys.platform != "win32":
        raise RuntimeError("Starting at login is only supported on Windows.")
    import winreg as real
    return real


def enable(winreg: Optional[Any] = None) -> str:
    w = _winreg(winreg)
    cmd = launch_command()
    with w.CreateKey(w.HKEY_CURRENT_USER, RUN_KEY) as key:
        w.SetValueEx(key, VALUE_NAME, 0, w.REG_SZ, cmd)
    return cmd


def disable(winreg: Optional[Any] = None) -> bool:
    w = _winreg(winreg)
    try:
        with w.OpenKey(w.HKEY_CURRENT_USER, RUN_KEY, 0, w.KEY_SET_VALUE) as key:
            w.DeleteValue(key, VALUE_NAME)
        return True
    except FileNotFoundError:
        return False


def status(winreg: Optional[Any] = None) -> Optional[str]:
    """The registered command, or None when the agent does not start at login."""
    w = _winreg(winreg)
    try:
        with w.OpenKey(w.HKEY_CURRENT_USER, RUN_KEY) as key:
            return w.QueryValueEx(key, VALUE_NAME)[0]
    except FileNotFoundError:
        return None
