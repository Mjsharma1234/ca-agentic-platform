# Builds dist\FirmOSTallyAgent.exe, a single file that needs no Python on the target PC, and publishes it for the web app.
# Run from the tally-agent folder:   powershell -File build_exe.ps1
# It uses a throwaway virtual environment in %TEMP%, so nothing is installed into your main Python.
#
# Publishing: the exe and a small version.json are copied to ..\firm_os_web\downloads, which Firm OS serves, so the
# "Download for Windows" button on the Tally sync page always offers the latest build. Commit both files together.
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
$hash = (Get-FileHash $exe -Algorithm SHA256).Hash.ToLower()
$version = (& $exe --version).Trim()
Write-Host "Built $exe (version $version)"
Write-Host "SHA-256: $hash"

$downloads = Join-Path (Split-Path -Parent $PSScriptRoot) "firm_os_web\downloads"
if (-not (Test-Path $downloads)) { New-Item -ItemType Directory -Path $downloads | Out-Null }
Copy-Item $exe (Join-Path $downloads "FirmOSTallyAgent.exe") -Force
$info = [ordered]@{
    name = "FirmOSTallyAgent.exe"; version = $version; size_bytes = (Get-Item $exe).Length; sha256 = $hash
    built = (Get-Date -Format "yyyy-MM-dd"); signed = $false
}
$info | ConvertTo-Json | Set-Content -Encoding UTF8 (Join-Path $downloads "version.json")
Write-Host "Published to $downloads"
Write-Host "Sign it before giving it to clients; unsigned files are often flagged by antivirus and SmartScreen."
