# Tesseract desktop launcher (Windows).
# Starts the local server if it isn't running (hidden, low priority, small memory limits,
# exits on its own 15 min after the last window closes), then opens the app in its own window.
#   powershell -NoProfile -ExecutionPolicy Bypass -File scripts/launch.ps1 [-Data <dir>] [-Port 4320] [-NoWindow]
param(
  [string]$Data = "",
  [int]$Port = 4320,
  [double]$IdleExit = 15,
  [switch]$NoWindow
)
$ErrorActionPreference = "Stop"
$app = Split-Path -Parent $PSScriptRoot           # .../app
if (-not $Data) { $Data = Join-Path (Split-Path -Parent $app) "data" }
$url = "http://localhost:$Port"
$logDir = Join-Path $env:USERPROFILE ".tesseract"
New-Item -ItemType Directory -Force -Path $logDir | Out-Null

function Test-Server {
  try {
    $r = Invoke-WebRequest "http://127.0.0.1:$Port/api/session" -UseBasicParsing -TimeoutSec 1
    if ($r.StatusCode -ne 200) { return $false }
    $state = $r.Content | ConvertFrom-Json
    return ($state.app -ceq "tesseract") -and ($state.ok -eq $true) -and ($state.local -eq $true)
  } catch { return $false }
}

if (-not (Test-Server)) {
  $node = (Get-Command node -ErrorAction Stop).Source
  # Pre-built bundle uses ~30 MB less memory; fall back to the TypeScript source.
  $entry = Join-Path $app "apps\server\dist\server.mjs"
  if (-not (Test-Path $entry)) { $entry = Join-Path $app "apps\server\src\main.ts" }
  $nodeArgs = @(
    "--max-old-space-size=48", "--max-semi-space-size=1",
    "`"$entry`"", "--data", "`"$Data`"", "--port", $Port, "--idle-exit", $IdleExit, "--desktop"
  )
  # Phone & tablet access (switch in Settings): LAN mode with device pairing.
  $desktopSettings = Join-Path $logDir "desktop.json"
  if (Test-Path $desktopSettings) {
    try { if ((Get-Content $desktopSettings -Raw | ConvertFrom-Json).lan) { $nodeArgs += "--lan" } } catch {}
  }
  $p = Start-Process -FilePath $node -ArgumentList $nodeArgs -WorkingDirectory $app -WindowStyle Hidden -PassThru `
    -RedirectStandardOutput (Join-Path $logDir "server.log") -RedirectStandardError (Join-Path $logDir "server-error.log")
  try { $p.PriorityClass = "BelowNormal" } catch {}
  $ready = $false
  for ($i = 0; $i -lt 50 -and -not $ready; $i++) { Start-Sleep -Milliseconds 200; $ready = Test-Server }
  if (-not $ready) { throw "Tesseract did not respond on port $Port. Another app may be using it. See $logDir\server-error.log" }
}

if (-not $NoWindow) {
  # Edge app window: no tabs or address bar; shares the WebView2/Edge engine Windows already has.
  Start-Process "msedge" -ArgumentList "--app=$url"

  # Saved window opacity (set from the Transparency slider): apply once the window exists.
  $windowSettings = Join-Path $logDir "window.json"
  if (Test-Path $windowSettings) {
    try {
      $opacity = [int](Get-Content $windowSettings -Raw | ConvertFrom-Json).opacity
      if ($opacity -lt 100) { & (Join-Path $PSScriptRoot "window-opacity.ps1") -Percent $opacity -WaitSeconds 15 | Out-Null }
    } catch {}
  }
}
