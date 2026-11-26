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
3. **Start the new build from this new `app` folder.** Replace the example `-Data` path with the workspace folder (or its copy) you chose. Open the same port in your browser. Do not launch an old desktop shortcut: it may still point to the previous extracted folder.

```powershell
# Check the previous listener. Change 4320 if your old app used another port.
$port = 4320
Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue |
  Select-Object -ExpandProperty OwningProcess -Unique |
  ForEach-Object { Get-CimInstance Win32_Process -Filter "ProcessId = $_" } |
  Select-Object ProcessId, Name, CommandLine
```

If the listing still shows the old Tesseract server, check its full command line and use `Stop-Process -Id <confirmed PID>` with that specific number. Run the check again; the chosen port should be free before you launch the new build.

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\scripts\launch.ps1 -Data "D:\Tesseract-workspace-copy" -Port 4320
```

Open [http://127.0.0.1:4320](http://127.0.0.1:4320), or the port you supplied. After a restart, restart any connector you use from Settings; Local MCP issues a fresh URL and credential. If an old shortcut opens the wrong copy, pin the new launcher instead. For a rollback, open a pre-upgrade data copy with the old version, not a workspace already updated by a newer version.
<!-- /release-windows-install:v1 -->
