# Runs Tarakhis on this computer and publishes it on a free Cloudflare link (no account needed).
# Double-click start-pilot.cmd. Keep this window open while the pilot is running.
param(
  # Use the demo company (server/data) instead of the real pilot data (server/pilot-data).
  [switch]$Demo,
  # Leave Tarakhis running after this script exits (stop it later with stop-pilot.cmd).
  [switch]$Background
)

$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $MyInvocation.MyCommand.Path
$server = Join-Path $root 'server'
$mobile = Join-Path $root 'mobile'
$dataDir = if ($Demo) { 'data' } else { 'pilot-data' }
$dataPath = Join-Path $server $dataDir
# Pilot-only settings live inside the (git-ignored) data folder so dev runs are unaffected.
$envFile = Join-Path $dataPath 'pilot.env'
New-Item -ItemType Directory -Force -Path $dataPath | Out-Null
$tunnelLog = Join-Path $dataPath 'tunnel.log'

function Say($text, $color = 'Gray') { Write-Host $text -ForegroundColor $color }

# --- requirements -----------------------------------------------------------------------------
if (-not (Get-Command node -ErrorAction SilentlyContinue)) { Say 'Node.js is not installed: https://nodejs.org' Red; Read-Host 'Press Enter to close'; exit 1 }
if (-not (Get-Command cloudflared -ErrorAction SilentlyContinue)) {
  Say 'cloudflared is not installed. Install it once with:' Yellow
  Say '  winget install --id Cloudflare.cloudflared -e' White
  Read-Host 'Then run this again. Press Enter to close'; exit 1
}

# --- first run: secrets and invite code (kept on this computer only, never in git) -------------
if (-not (Test-Path $envFile)) {
  $bytes = New-Object byte[] 48
  [System.Security.Cryptography.RandomNumberGenerator]::Create().GetBytes($bytes)
  $secret = -join ($bytes | ForEach-Object { $_.ToString('x2') })
  $code = Read-Host 'Choose an invite code for the pilot company (e.g. NUKHBA-2026)'
  if (-not $code) { $code = 'PILOT-' + (Get-Random -Minimum 1000 -Maximum 9999) }
  @(
    "JWT_SECRET=$secret"
    "REGISTRATION_CODE=$code"
  ) | Set-Content -Path $envFile -Encoding ascii
  Say "Saved settings to $envFile (invite code: $code)" Green
}
# Load the pilot settings into this process; the server inherits them.
Get-Content $envFile | ForEach-Object {
  if ($_ -match '^\s*([A-Z0-9_]+)\s*=\s*(.*)$') { Set-Item -Path "env:$($Matches[1])" -Value $Matches[2] }
}
$env:NODE_ENV = 'production'

# --- dependencies and web build ------------------------------------------------------------------
if (-not (Test-Path (Join-Path $server 'node_modules'))) { Say 'Installing server packages...'; Push-Location $server; npm ci --omit=dev; Pop-Location }
if (-not (Test-Path (Join-Path $mobile 'dist\index.html'))) {
  Say 'Building the web app (first time only, a few minutes)...'
  Push-Location $mobile
  if (-not (Test-Path 'node_modules')) { npm ci }
  npx expo export -p web --output-dir dist
  Pop-Location
}

# --- public HTTPS link -----------------------------------------------------------------------------
Say 'Opening the Cloudflare link...'
if (Test-Path $tunnelLog) { Remove-Item $tunnelLog -Force }
$tunnel = Start-Process -FilePath 'cloudflared' -ArgumentList @('tunnel', '--no-autoupdate', '--url', 'http://127.0.0.1:4000') `
  -RedirectStandardError $tunnelLog -WindowStyle Hidden -PassThru
$url = $null
for ($i = 0; $i -lt 60 -and -not $url; $i++) {
  Start-Sleep -Seconds 1
  if (Test-Path $tunnelLog) {
    $m = Select-String -Path $tunnelLog -Pattern 'https://[a-z0-9-]+\.trycloudflare\.com' | Select-Object -First 1
    if ($m) { $url = $m.Matches[0].Value }
  }
}
if (-not $url) { Say "Could not open the Cloudflare link. See $tunnelLog" Red; Stop-Process -Id $tunnel.Id -ErrorAction SilentlyContinue; Read-Host 'Press Enter to close'; exit 1 }

# --- API server ------------------------------------------------------------------------------------
$env:DATA_DIR = $dataDir
$env:PUBLIC_URL = $url
$serverLog = Join-Path $dataPath 'server.log'
$serverErr = Join-Path $dataPath 'server-errors.log'
$api = Start-Process -FilePath 'node' -ArgumentList 'src/index.js' -WorkingDirectory $server -WindowStyle Hidden -PassThru `
  -RedirectStandardOutput $serverLog -RedirectStandardError $serverErr
$ok = $false
for ($i = 0; $i -lt 60 -and -not $ok; $i++) {
  Start-Sleep -Seconds 1
  if ($api.HasExited) { break }
  try { $ok = (Invoke-RestMethod 'http://127.0.0.1:4000/api/health' -TimeoutSec 2).ok } catch { }
}
if (-not $ok) {
  Say 'The server did not start:' Red
  if (Test-Path $serverErr) { Get-Content $serverErr -Tail 15 | ForEach-Object { Say "  $_" Red } }
  Stop-Process -Id $tunnel.Id -ErrorAction SilentlyContinue
  Read-Host 'Press Enter to close'; exit 1
}
@($api.Id, $tunnel.Id) | Set-Content -Path (Join-Path $root 'pilot.pids') -Encoding ascii

Set-Content -Path (Join-Path $root 'current-link.txt') -Value $url -Encoding ascii
try { Set-Clipboard -Value $url } catch { }

Say ''
Say '==============================================================' Green
Say '  Tarakhis is online:' Green
Say "  $url" White
Say '  (copied to clipboard and saved in current-link.txt)' Gray
Say '==============================================================' Green
Say ''
Say 'Phones: open the link, or in the Android app use "Change server" and scan the code' Gray
Say 'from More -> Connect mobile app. The link changes every time you run this script.' Gray
Say 'Keep this computer awake (Settings -> Power -> Sleep: Never while plugged in).' Yellow
Say ''
if ($Background) { Say 'Running in the background. Use stop-pilot.cmd to stop it.' Gray; exit 0 }
Start-Process $url

Read-Host 'Press Enter here to STOP Tarakhis'
Stop-Process -Id $api.Id -ErrorAction SilentlyContinue
Stop-Process -Id $tunnel.Id -ErrorAction SilentlyContinue
Remove-Item (Join-Path $root 'pilot.pids') -ErrorAction SilentlyContinue
Say 'Stopped.'
