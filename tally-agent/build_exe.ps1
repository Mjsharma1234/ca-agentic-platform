# Builds dist\FirmOSTallyAgent.exe, a single file that needs no Python on the target PC.
# Run from the tally-agent folder:   powershell -File build_exe.ps1
# It uses a throwaway virtual environment in %TEMP%, so nothing is installed into your main Python.
$ErrorActionPreference = "Stop"
$venv = Join-Path $env:TEMP "firmos-agent-build"
if (-not (Test-Path "$venv\Scripts\python.exe")) {
    python -m venv $venv
    & "$venv\Scripts\python.exe" -m pip install --quiet pyinstaller "httpx>=0.27"
}
& "$venv\Scripts\python.exe" -m PyInstaller --noconfirm --clean --onefile --name FirmOSTallyAgent `
    --collect-submodules tally_agent --specpath "$venv\spec" --workpath "$venv\work" --distpath dist run_agent.py
if ($LASTEXITCODE -ne 0) { throw "PyInstaller failed" }
$exe = Resolve-Path "dist\FirmOSTallyAgent.exe"
Write-Host "Built $exe"
Write-Host ("SHA-256: " + (Get-FileHash $exe -Algorithm SHA256).Hash)
Write-Host "Sign it before giving it to clients; unsigned files are often flagged by antivirus and SmartScreen."
