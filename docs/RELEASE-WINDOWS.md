<!-- release-windows-install:v1 -->
## Install and restart on Windows

Use Node.js 24. Download **Source code (zip)** for the version you want, extract it to a **new folder**, and open PowerShell in the extracted folder (the one that contains `app`). Run these in order. If a command fails, stop there.

```powershell
cd app
npm.cmd ci
npm.cmd run build:desktop
```

1. **Stop the old server, not just its window.** In the PowerShell window running the old Tesseract, press **Ctrl+C**. If you started it from a shortcut, first stop its Local MCP / OpenAI Tunnel in Settings if enabled, close its window, and let the old server exit. To stop the background server without waiting for its idle timeout, identify its PID using the commands below. End only the Node process whose command line you confirm is the old Tesseract server. Never end all Node processes.
2. **Back up the data folder.** For an existing workspace, copy the entire folder, including the hidden `.classroom` folder, with the old server and any separately launched MCP process stopped. Use a copy if trying a new version first. The app's export alone does not include Classroom history or answers.
3. **Start the new build from this new `app` folder.** If your migrated workspace is the `data` folder next to `app`, use the default command below. If your data lives elsewhere, use the separate custom-location instructions. Do not launch an old desktop shortcut: it may still point to the previous extracted folder.

```powershell
# Check the previous listener. Change 4320 if your old app used another port.
$port = 4320
Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue |
  Select-Object -ExpandProperty OwningProcess -Unique |
  ForEach-Object { Get-CimInstance Win32_Process -Filter "ProcessId = $_" } |
  Select-Object ProcessId, Name, CommandLine
```

If the listing still shows the old Tesseract server, check its full command line and use `Stop-Process -Id <confirmed PID>` with that specific number. Run the check again; the chosen port should be free before you launch the new build.

**Default location:** From the new `app` folder, run this only after verifying that `..\data` contains the workspace you migrated (including its hidden `.classroom` folder, if present). Do not point Tesseract at an empty replacement folder by mistake.

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\scripts\launch.ps1
```

**Custom data location:** If the workspace is stored elsewhere, enter its actual full path at the prompt. This checks that the folder exists before opening it.

```powershell
$data = (Read-Host 'Full path of your existing Tesseract data folder').Trim().Trim('"')
if (!$data -or !(Test-Path -LiteralPath $data -PathType Container)) {
  throw 'Data folder not found. Enter the path of your existing workspace.'
}
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\scripts\launch.ps1 -Data $data
```

Open [http://127.0.0.1:4320](http://127.0.0.1:4320). If you use a custom port, add `-Port` with that port when launching and open the same port in your browser. Restart any connectors you use from Settings; Local MCP issues a fresh URL and credential.

**Refresh old Windows shortcuts:** If you use the default data path and port and already use Start Menu and startup shortcuts, run `powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\scripts\desktop.ps1 install` from the new `app` folder to update both without rebuilding. This also enables launch at sign-in. For a custom data path or port, keep using a launcher with those explicit arguments rather than the default shortcuts. For a rollback, open a pre-upgrade data copy with the old version, not a workspace already updated by a newer version.
<!-- /release-windows-install:v1 -->
