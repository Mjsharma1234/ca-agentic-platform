# Builds a single-file Windows executable of the agent. Run from the tally-agent folder.
# Needs: pip install pyinstaller httpx   (add pystray pillow to include the tray icon)
$ErrorActionPreference = "Stop"
python -m PyInstaller --onefile --name FirmOSTallyAgent --collect-submodules tally_agent tally_agent\__main__.py
Write-Host "Built dist\FirmOSTallyAgent.exe. Sign it before distributing; unsigned files are often flagged by antivirus."
