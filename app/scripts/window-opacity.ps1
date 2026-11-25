# Make the Panya app window see-through (whole window, Windows "layered window").
# The compositor (GPU) blends it with the desktop: no extra memory, nothing runs afterwards.
#   powershell -NoProfile -ExecutionPolicy Bypass -File scripts/window-opacity.ps1 -Percent 90 [-WaitSeconds 10] [-Save]
# -Percent: 100 = solid ... 50 = half see-through (lower is clamped to 50 so text stays readable).
# -Save: remember it in ~/.panya/window.json; the launcher applies it every time the window opens.
param(
  [ValidateRange(0, 100)][int]$Percent = 90,
  [double]$WaitSeconds = 0,
  [switch]$Save
)
$ErrorActionPreference = "Stop"
$Percent = [Math]::Max(50, $Percent)

if ($Save) {
  $dir = Join-Path $env:USERPROFILE ".panya"
  New-Item -ItemType Directory -Force -Path $dir | Out-Null
  @{ opacity = $Percent } | ConvertTo-Json | Set-Content -Encoding utf8 (Join-Path $dir "window.json")
}

Add-Type -ErrorAction SilentlyContinue -TypeDefinition @"
using System;
using System.Collections.Generic;
using System.Runtime.InteropServices;
using System.Text;
public static class SbWindow {
  delegate bool EnumProc(IntPtr h, IntPtr p);
  [DllImport("user32.dll")] static extern bool EnumWindows(EnumProc f, IntPtr p);
  [DllImport("user32.dll")] static extern bool IsWindowVisible(IntPtr h);
  [DllImport("user32.dll", CharSet = CharSet.Unicode)] static extern int GetWindowText(IntPtr h, StringBuilder s, int n);
  [DllImport("user32.dll", CharSet = CharSet.Unicode)] static extern int GetClassName(IntPtr h, StringBuilder s, int n);
  [DllImport("user32.dll")] static extern int GetWindowLong(IntPtr h, int i);
  [DllImport("user32.dll")] static extern int SetWindowLong(IntPtr h, int i, int v);
  [DllImport("user32.dll")] static extern bool SetLayeredWindowAttributes(IntPtr h, uint key, byte alpha, uint flags);
  const int GWL_EXSTYLE = -20, WS_EX_LAYERED = 0x80000;
  const uint LWA_ALPHA = 2;

  // Edge --app windows: Chromium window class, title = the page title, no " - Microsoft Edge" suffix.
  public static List<IntPtr> Find() {
    var found = new List<IntPtr>();
    EnumWindows((h, p) => {
      if (!IsWindowVisible(h)) return true;
      var t = new StringBuilder(256); GetWindowText(h, t, 256);
      var c = new StringBuilder(64); GetClassName(h, c, 64);
      var title = t.ToString();
      if (c.ToString() == "Chrome_WidgetWin_1" && title.StartsWith("Panya") && !title.Contains("Microsoft") && !title.Contains("Edge"))
        found.Add(h);
      return true;
    }, IntPtr.Zero);
    return found;
  }

  public static void Apply(IntPtr h, int percent) {
    int style = GetWindowLong(h, GWL_EXSTYLE);
    if (percent >= 100) {
      SetWindowLong(h, GWL_EXSTYLE, style & ~WS_EX_LAYERED);   // back to a normal, solid window
      return;
    }
    SetWindowLong(h, GWL_EXSTYLE, style | WS_EX_LAYERED);
    SetLayeredWindowAttributes(h, 0, (byte)Math.Round(255 * percent / 100.0), LWA_ALPHA);
  }
}
"@

$deadline = (Get-Date).AddSeconds($WaitSeconds)
do {
  $windows = [SbWindow]::Find()
  if ($windows.Count -gt 0) { break }
  Start-Sleep -Milliseconds 300
} while ((Get-Date) -lt $deadline)

foreach ($h in $windows) { [SbWindow]::Apply($h, $Percent) }
"windows: $($windows.Count), opacity: $Percent%"
