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

1. In [OpenAI Platform → Tunnels](https://platform.openai.com/settings/organization/tunnels), create a tunnel and associate it with the ChatGPT workspace you use. Copy the complete Tunnel ID.
2. In OpenAI Platform, create a **restricted runtime key** with only **Tunnels: Read + Use**. Keep it private.
3. From the [official tunnel-client releases](https://github.com/openai/tunnel-client/releases/latest), download the runtime archive for your OS/architecture and its `SHA256SUMS.txt`. Match the archive's SHA-256 before extracting; on Windows use `Get-FileHash <archive> -Algorithm SHA256`. Put the runtime and any bundled companion binary side by side in `~/.tesseract/bin` (Windows: `%USERPROFILE%\.tesseract\bin`).
4. On the **main computer**, open **Settings → OpenAI Tunnel → Set up tunnel**. Paste the Tunnel ID and restricted key, then **Save setup**. Choose **Connect for 1 h / 8 h / 24 h**. Wait for **Connected** (the runtime's loopback readiness check) before trying it in ChatGPT. **Disconnect** stops it; it never starts automatically.
5. **Add it in ChatGPT** (web, once): chatgpt.com → Settings → Apps & Connectors (or Plugins) → add a custom
   MCP server → Name *Tesseract*, Connection **Tunnel** → pick your tunnel → save. Start a new chat and ask
   "list your Tesseract tools" to check. It then works in the phone app too.

## Where the key goes

Windows protects new keys with DPAPI for the current Windows user. Linux needs an unlocked Secret Service and `secret-tool`; the app does not fall back to plaintext if storage fails. An existing manually configured key file remains supported and is not deleted when you save a new protected setup. Manual setups display **Running (unverified)**. A saved setup only reports the key's status, never the key or a prefilled copy, and cannot be modified from a paired phone or tablet.

## After updating Tesseract

ChatGPT remembers the tool list from when the connector was added. After you pull a new version that adds or
changes tools, open the connector in ChatGPT and press **Refresh** (or remove and add it again), then start a
**new chat**. Otherwise ChatGPT keeps saying a new tool or option "is not supported".

## Turning it off / revoking

- **Turn off** in the sidebar (or wait: it stops by itself at the chosen time, and when the server stops).
- Revoke for good: delete the key or tunnel in OpenAI Platform. A legacy `openai-tunnel-key` file can be removed manually after verifying the new setup; the app does not delete it.

## Notes

- Memory while on: ~106 MB (tunnel-client ~55 MB + MCP ~51 MB, measured); nothing runs when off.
- The card shows plain errors: key rejected (401), no access (403), tunnel not found (404), bad tunnel ID.
- While on, the server keeps running even with the app window closed (ChatGPT needs it).
- Answers ChatGPT reads are stored by OpenAI under your ChatGPT data settings.
- Logs: `~/.tesseract/tunnel.log`. We never write the key, but if OpenAI rejects a key its error message
  is converted into a fixed diagnostic message. New logs do not store raw runtime output. Older logs are not rewritten.
