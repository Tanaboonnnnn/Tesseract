# Connecting Tesseract to normal chat apps safely (research, 2026-11-25)

Goal: use the Tesseract MCP tools from ChatGPT (web/mobile chat) and Claude.ai, not only from local clients
(Codex, Claude Code, Claude Desktop, ChatGPT Work mode), without putting the data at risk.

**The core problem:** cloud chat apps call MCP servers **from their own servers**, so they can't reach `localhost`.
Something has to carry their requests to this PC. Three ways exist today.

## Option 1: OpenAI Secure MCP Tunnel (no public URL) ⭐ try first for ChatGPT

- A small open-source `tunnel-client` runs on this PC and makes **outbound-only** HTTPS calls to OpenAI. It long-polls
  for MCP requests, forwards them to our server, and posts the answers back. No inbound port, no public URL.
- It can start a **stdio** MCP server directly (`--mcp-command`), so our existing server works as is.
- In ChatGPT: Plugins → Add custom MCP server → Connection: **Tunnel**. Also works in Codex and the Responses API.
- Access: OpenAI Platform roles (Tunnels Read/Manage/Use) + ChatGPT workspace permissions. Setup needs an OpenAI
  Platform API key for the control plane (store it in `~/.tesseract`, never in the repo).
- Limits: 600 MCP requests/min, 10 MiB per message, 120 s per request.
- **Unknowns to check before building:** which ChatGPT plans show "Connection: Tunnel" for a personal account
  (the docs list no plans; developer-mode eligibility differs between OpenAI pages), whether a personal Platform org
  is enough, cost, and the RAM of `tunnel-client` (measure it).
- If OAuth is used, the authorization server itself is *not* tunneled and must be public.

## Option 2: Anthropic MCP tunnels: not for personal use yet

- Same idea (outbound-only, via `cloudflared` + an Anthropic gateway), but it's a **research preview / private beta**
  (access by form), aimed at the Claude API and organisations. Console-created tunnels are "not available as
  connectors in claude.ai". Each MCP server must still do its own OAuth. Revisit later.

## Option 3: Public tunnel + our own OAuth: works with both ChatGPT and Claude.ai today

- Cloudflare Tunnel (outbound-only connector, public HTTPS hostname), ngrok, or Tailscale Funnel. All of them make
  the endpoint **public**, so authentication is entirely our job.
- Claude.ai custom connectors: reach the server from Anthropic's cloud over the public internet, **port 443 only**
  (no `:8443`), OAuth redirect `https://claude.ai/api/mcp/auth_callback`. Free plan = 1 custom connector.
- ChatGPT developer mode: SSE or streaming HTTP, OAuth / no auth / mixed. Write actions ask for confirmation by
  default (tools without a read-only hint count as writes). Plan eligibility differs between OpenAI pages.
- Cloudflare Access "Managed OAuth" can front the server so we don't write an OAuth server ourselves, but community
  reports show connector OAuth flows stalling with some setups. Test the whole flow end to end.
- A stable hostname needs a domain on Cloudflare (quick tunnels change URL on every start).

## Security rules for any option (from the MCP spec and vendor guidance)

1. **Never "no auth" on a public URL.** A secret path is for testing only.
2. **OAuth 2.1 done properly:** PKCE with S256, exact pre-registered redirect URIs, short-lived access tokens,
   tokens **audience-bound** to this server (`resource` parameter), validate every token; never pass a client's token
   through to another API (token passthrough is forbidden by the spec).
3. **Consent happens on this PC:** the public sign-in page only shows a code; approval needs the desktop app (like the
   phone pairing flow), so someone who finds the URL can't approve themselves.
4. **Remote profile = least privilege:** reads + "open page" + a few low-risk writes (task/topic status, save_visual).
   No delete, no undo, no whole-map overwrite, Notes optional. Agent name `remote-chatgpt` / `remote-claude` in Activity.
5. **Assume prompt injection reaches us:** validate everything server-side (core already does), rate-limit, cap sizes,
   log every remote call, and keep undo.
6. **Off by default with an expiry:** a "Remote access" switch in the app (e.g. 8 h), visible while on, one-click off,
   and token revoke.
7. **Expose only `/mcp`**, never the web API, pairing or `/api/window`/Google endpoints. Keep the Host check by mapping
   the tunnel hostname explicitly, not by turning the check off.
8. **Know where data goes:** tool answers are stored by the chat provider under its retention policy. Tunnel
   providers see metadata (Cloudflare/ngrok terminate TLS unless end-to-end).

## Recommendation

1. Check whether your ChatGPT account offers **Connection: Tunnel**. If yes: Option 1 with a remote profile. No public
   endpoint and no OAuth server to build: the smallest attack surface.
2. For Claude.ai: Option 3 (Cloudflare Tunnel on your own domain + our OAuth with PC-side consent + remote profile).
   This is the bigger build. Do it once Option 1 has shown that cloud chat is worth it.
3. Either way, build the **remote profile + Remote access switch** first: it protects every option.

## Sources
- [OpenAI: Secure MCP Tunnel](https://developers.openai.com/api/docs/guides/secure-mcp-tunnels)
- [OpenAI: Connect private MCP servers to OpenAI products](https://developers.openai.com/blog/connect-private-mcp-servers-to-openai-products)
- [OpenAI: ChatGPT developer mode](https://developers.openai.com/api/docs/guides/developer-mode)
- [OpenAI Help: Developer mode and MCP connectors](https://help.openai.com/en/articles/12584461-developer-mode-and-mcp-connectors)
- [OpenAI: Plugins security & privacy](https://developers.openai.com/plugins/guides/security-privacy.md)
- [Anthropic: MCP tunnels](https://platform.claude.com/docs/en/agents-and-tools/mcp-tunnels/overview) · [support article](https://support.claude.com/en/articles/14290952-mcp-tunnels)
- [Claude Help: custom connectors using remote MCP](https://support.claude.com/en/articles/11175166-get-started-with-custom-connectors-using-remote-mcp)
- [MCP spec: authorization security considerations](https://modelcontextprotocol.io/specification/latest/basic/authorization/security-considerations) · [security best practices](https://modelcontextprotocol.io/specification/latest/basic/security_best_practices)
- [Cloudflare: secure MCP servers](https://developers.cloudflare.com/cloudflare-one/access-controls/ai-controls/secure-mcp-servers/)
- [ngrok: MCP gateway](https://ngrok.com/docs/gateway/api-gateway/mcp-gateway)
- [mcp-ferry (community, Cloudflare Access + stdio)](https://github.com/dalberto/mcp-ferry) · [connector OAuth stall report](https://github.com/Waishnav/devspace/issues/113)
