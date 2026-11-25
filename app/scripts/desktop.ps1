# Install / uninstall Panya as a desktop app (Windows).
#   install        Start menu shortcut + open at sign-in
#   uninstall      remove both shortcuts
#   autostart-on   open at sign-in
#   autostart-off  stop opening at sign-in (Start menu shortcut stays)
param([Parameter(Mandatory)][ValidateSet("install", "uninstall", "autostart-on", "autostart-off")][string]$Action)
$ErrorActionPreference = "Stop"

$launcher = Join-Path $PSScriptRoot "launch.ps1"
$icon = Join-Path $PSScriptRoot "panya.ico"
$name = "Panya.lnk"
$startMenu = Join-Path ([Environment]::GetFolderPath("Programs")) $name
$startup = Join-Path ([Environment]::GetFolderPath("Startup")) $name

function New-Shortcut([string]$path) {
  $shell = New-Object -ComObject WScript.Shell
  $lnk = $shell.CreateShortcut($path)
  # conhost --headless runs PowerShell with no console window at all (no flash).
  $lnk.TargetPath = Join-Path $env:WINDIR "System32\conhost.exe"
  $lnk.Arguments = "--headless powershell.exe -NoProfile -ExecutionPolicy Bypass -File `"$launcher`""
  $lnk.WorkingDirectory = Split-Path -Parent $PSScriptRoot
  $lnk.Description = "Panya"
  if (Test-Path $icon) { $lnk.IconLocation = $icon }
  $lnk.Save()
  Write-Host "Created $path"
}

function Remove-Shortcut([string]$path) {
  if (Test-Path $path) { Remove-Item $path; Write-Host "Removed $path" }
}

switch ($Action) {
  "install" { New-Shortcut $startMenu; New-Shortcut $startup }
  "uninstall" { Remove-Shortcut $startMenu; Remove-Shortcut $startup }
  "autostart-on" { New-Shortcut $startup }
  "autostart-off" { Remove-Shortcut $startup }
}
