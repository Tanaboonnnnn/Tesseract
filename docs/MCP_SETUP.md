# Connecting AI clients (MCP)

The server runs locally over stdio — no network, no account. Each client starts it with its own `--agent` name, so the activity log shows who changed what.

```
node <repo>/app/apps/mcp/src/main.ts --agent <name> [--data <data dir>]
```

- Requires Node 22.18+ (runs TypeScript directly). Check: `node -v`.
- `<repo>` = the folder you cloned this repo into (examples below use `C:/path/to/panya`; replace it with yours, forward slashes).
- Optional env: `BRAIN_DATA_DIR` (data folder), `BRAIN_GIT_COMMIT=1` (git-commit each change).
- If a GUI app can't find `node`, use the full path from `(Get-Command node).Source`.

## Claude Code

Add it once from the repo folder, then check with `/mcp`:

```powershell
claude mcp add panya -- node C:/path/to/panya/app/apps/mcp/src/main.ts --agent claude-code
```

## Claude Desktop

Settings → Developer → Edit Config (`%APPDATA%\Claude\claude_desktop_config.json`), add:

```json
{
  "mcpServers": {
    "panya": {
      "command": "node",
      "args": [
        "C:/path/to/panya/app/apps/mcp/src/main.ts",
        "--agent", "claude-desktop"
      ]
    }
  }
}
```

Restart Claude Desktop.

## Codex

Add to `~/.codex/config.toml`, then restart Codex:

```toml
[mcp_servers.panya]
command = "node"
args = ["C:/path/to/panya/app/apps/mcp/src/main.ts", "--agent", "codex"]
```

## Antigravity

Agent panel → MCP Servers → Manage → View raw config (`mcp_config.json`). Same shape as Claude Desktop, with `"--agent", "antigravity"`. *(Verify the menu path against your Antigravity version.)*

## ChatGPT — not set up yet

ChatGPT connects from OpenAI's servers, so `localhost` URLs don't work. Use OpenAI's **Secure MCP Tunnel**
(no public URL, no open ports): create a tunnel in OpenAI Platform settings linked to your ChatGPT workspace,
run `tunnel-client` locally with
`--mcp-command "node '<repo>/app/apps/mcp/src/main.ts' --agent chatgpt"`, then in ChatGPT choose
Add custom MCP server → **Tunnel**. Keep the tunnel API key in an environment variable, never in the repo.
See https://developers.openai.com/api/docs/guides/secure-mcp-tunnels (plan eligibility isn't documented there).

## Try it

> "Show my overview."
> "Add a Learning Roadmap for Kubernetes with 5 phases, linked to my Full-Stack Developer goal."
> "Quiz me on RBAC, then record the result honestly."
> "What did the AI change today? Undo the last one."

## Cost

- Tool definitions: ~5.4k tokens (32 tools) — loaded once per session.
- `get_overview`: ~400 tokens on sample data.
