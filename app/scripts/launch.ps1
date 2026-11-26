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

function Stop-Launch([string]$Message) {
  if (-not $NoWindow) {
    try {
      Add-Type -AssemblyName System.Windows.Forms
      [void][System.Windows.Forms.MessageBox]::Show($Message, "Tesseract", "OK", "Warning")
    } catch {}
  }
  throw $Message
}

$node = (Get-Command node -ErrorAction Stop).Source
$entry = Join-Path $app "apps\server\dist\server.mjs"
$web = Join-Path $app "apps\web\dist"
if (!(Test-Path -LiteralPath $entry -PathType Leaf) -or !(Test-Path -LiteralPath (Join-Path $web "index.html") -PathType Leaf)) {
  Stop-Launch "Desktop build not found. Run npm.cmd run build:desktop from the app folder."
}
if (!(Test-Path -LiteralPath $Data -PathType Container)) {
  Stop-Launch "Workspace folder not found. Use the existing data folder beside app or pass its actual location with -Data."
}
$Data = (Resolve-Path -LiteralPath $Data).Path
$checker = Join-Path $PSScriptRoot "desktop-identity.ts"
function Get-ServerStatus([string]$Mode) {
  $status = & $node $checker $entry $web $Data $Port $Mode
  if ($LASTEXITCODE -ne 0) { Stop-Launch "Could not verify this build and workspace. Check Node.js and the build." }
  return $status
}
function Confirm-ServerStatus([string]$Status) {
  if ($Status -eq "mismatch") {
    Stop-Launch "Another Tesseract build or workspace is running on port $Port. Stop the previous Tesseract server yourself, then open this shortcut again. Nothing was stopped."
  }
  if ($Status -ne "match" -and $Status -ne "free") {
    Stop-Launch "Port $Port is in use or did not respond as expected. Check the process before stopping anything."
  }
}

$status = Get-ServerStatus "probe"
Confirm-ServerStatus $status
if ($status -eq "free") {
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
  $status = Get-ServerStatus "wait"
  Confirm-ServerStatus $status
  if ($status -ne "match") {
    Stop-Launch "Tesseract did not start on port $Port. See $logDir\server-error.log."
  }
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
