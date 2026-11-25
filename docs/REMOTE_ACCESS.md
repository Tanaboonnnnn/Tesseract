# Remote access: Tesseract in ChatGPT (web + phone)

ChatGPT's normal chat runs in OpenAI's cloud, so it can't start the local plugin. Remote access runs OpenAI's
**Secure MCP Tunnel** client on this PC: it connects **outbound only** to OpenAI and starts a **read-mostly**
Tesseract for ChatGPT. No port is opened and no public URL exists. Background: [REMOTE_MCP_RESEARCH.md](REMOTE_MCP_RESEARCH.md).

## What ChatGPT can do through it

| Can | Can't (do these in the app) |
|---|---|
| Read everything: overview, projects, tasks, maps, learning, review queue, skills, notes, quizzes, schedule, visuals, activity | Delete anything, undo |
| Add/update tasks, add topics, update topic status, add/update events, create notes, create quizzes, save visuals, move "you are here" | Redraw a whole map, create/edit projects or courses |
| | Change skill levels or record assessments (honest metrics) |
| | Read inbox files, sync Google Calendar |

ChatGPT asks you before every write. Every remote change shows in **Activity** as `remote-chatgpt` and can be undone.

## One-time setup (your accounts, your keys)

**You need:** Tesseract running as the desktop app (`npm run desktop:install`, see the README), a ChatGPT account whose
plan lets you add custom MCP servers / connectors, and access to platform.openai.com with the same account.
Everything below is per person: each user makes their own tunnel and key. Never share them.
Menu names on OpenAI's sites change from time to time; look for the closest match.

0. **Create the folder** where Tesseract keeps its local settings (outside the repo):
   ```powershell
   New-Item -ItemType Directory -Force "$env:USERPROFILE\.tesseract\bin" | Out-Null
   ```
1. **Create the tunnel.** platform.openai.com → Settings → Organization → **Tunnels** → Create tunnel:
   Name `tesseract`, a short description, Organization *Personal*, and under **ChatGPT workspaces pick your own
   workspace** (otherwise it won't show up in ChatGPT). Leave "Restrict client network access" off on a home
   connection (your IP changes). Copy the **tunnel ID** (`tunnel_` + 32 letters/digits). It is an identifier,
   not a password. Save it:
   ```powershell
   '{ "tunnel_id": "PASTE_TUNNEL_ID" }' | Set-Content "$env:USERPROFILE\.tesseract\tunnel.json"
   ```
2. **Create a restricted key.** platform.openai.com → API keys → create a **restricted** key with only
   *Tunnels: Read + Use*. This one **is** secret. Copy it, then save it straight from the clipboard (it never
   appears on screen; the clipboard is cleared afterwards):
   ```powershell
   Get-Clipboard | Set-Content -NoNewline "$env:USERPROFILE\.tesseract\openai-tunnel-key"; Set-Clipboard -Value " "
   ```
3. **Install tunnel-client** (OpenAI's official, open-source client). From
   github.com/openai/tunnel-client/releases download the latest `tunnel-client-runtime-*-windows-amd64.zip` and
   its `SHA256SUMS.txt`. Check the zip before unpacking; the two values must match:
   ```powershell
   (Get-FileHash "$env:USERPROFILE\Downloads\tunnel-client-runtime-<version>-windows-amd64.zip").Hash.ToLower()
   Select-String "windows-amd64.zip" "$env:USERPROFILE\Downloads\SHA256SUMS.txt"
   ```
   Then put `tunnel-client-runtime.exe` from the zip in `%USERPROFILE%\.tesseract\bin\`.
4. **Check and turn it on:** in Tesseract, Settings → **Remote access** shows a checklist (tunnel-client, key, tunnel
   ID). When all three are ticked, choose *On for 1 h / 8 h / 24 h*.
5. **Add it in ChatGPT** (web, once): chatgpt.com → Settings → Apps & Connectors (or Plugins) → add a custom
   MCP server → Name *Tesseract*, Connection **Tunnel** → pick your tunnel → save. Start a new chat and ask
   "list your Tesseract tools" to check. It then works in the phone app too.

## After updating Tesseract

ChatGPT remembers the tool list from when the connector was added. After you pull a new version that adds or
changes tools, open the connector in ChatGPT and press **Refresh** (or remove and add it again), then start a
**new chat**. Otherwise ChatGPT keeps saying a new tool or option "is not supported".

## Turning it off / revoking

- **Turn off** in the sidebar (or wait: it stops by itself at the chosen time, and when the server stops).
- Revoke for good: delete the key in platform.openai.com (and the file `openai-tunnel-key`), or delete the tunnel.

## Notes

- Memory while on: ~106 MB (tunnel-client ~55 MB + MCP ~51 MB, measured); nothing runs when off.
- The card shows plain errors: key rejected (401), no access (403), tunnel not found (404), bad tunnel ID.
- While on, the server keeps running even with the app window closed (ChatGPT needs it).
- Answers ChatGPT reads are stored by OpenAI under your ChatGPT data settings.
- Logs: `~/.tesseract/tunnel.log`. We never write the key, but if OpenAI rejects a key its error message
  includes OpenAI's masked form (first 8 + last 4 characters). The log stays on this PC.
