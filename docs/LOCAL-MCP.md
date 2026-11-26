# Local MCP over Streamable HTTP

Use this only for a native MCP client running on the **same computer** as
Tesseract. You don't need to change the web server, LAN pairing, stdio MCP, or
OpenAI Secure MCP Tunnel settings. Keep using stdio for clients that can launch
Tesseract directly or the separate restricted tunnel for supported cloud clients.

## Start it in the app

On the host, open Settings, then Local MCP, and choose Start Local MCP. Copy the endpoint and Authorization header into a trusted native MCP client. The key is separate from OpenAI Tunnel and lives only for this app-host session. A fresh start generates a different URL and key. Stopping either connection leaves the other alone. The host does not idle out while either connection is enabled.

## URL-only clients

If your native client has only a URL field, stop the current Local MCP listener
and select **Start URL-only MCP** instead. Paste **Copy private URL** into the
client's **Streamable HTTP** URL field. Leave its Authorization settings empty.
The private URL is the credential, contains a random 256-bit secret, and stays
valid only until you stop or restart the listener. Treat it like a password:
do not share it, paste it in a browser, or sync it to a cloud account. This mode
keeps local tools, including writes, but omits the two legacy Learning Map
creators (`create_course` and `create_roadmap`). For a teaching course the agent
reads `classroom_format` and calls `submit_course_draft`; only the owner can
publish in the app. Existing maps remain accessible, and the header mode and
stdio keep their existing tools. Use this link only with a trusted native app
on the same computer. Both modes stay
on loopback; OpenAI Tunnel has its own separate controls and permissions.

## Start it from a terminal

From the repository's `app/` directory, provision a separate bearer token in
your client or OS secret store. Generate it with Node if needed:

```console
node -e "process.stdout.write(require('node:crypto').randomBytes(32).toString('base64url')+'\n')"
```

Set `BRAIN_MCP_LOCAL_TOKEN` to that value **only in the shell/service environment
that launches this listener**, then run:

```console
npm run mcp:local-http -- --data /path/to/workspace
```

Use a scratch copy of your workspace when experimenting. If omitted, `--data`
uses Tesseract's normal location. The command prints a URL such as
`http://127.0.0.1:51234/mcp/tesseract/<instance-id>`. Configure the client:

- **Transport:** Streamable HTTP (not legacy SSE).
- **URL:** the exact URL that the command prints.
- **Authorization header:** `Bearer <your local token>`. Use the client's secret
  field or secret store; don't put the token in the URL, command arguments, logs,
  or project files. For clients without custom-header support use the app's
  separate URL-only mode or stdio.

Each start gets a different instance ID and, by default, an OS-assigned port.
Refresh the client's URL after restarting. An optional `--port` pins the TCP
port, but not the instance ID; a port already in use makes startup fail instead
of connecting the wrong listener.

## What stays local

The listener binds only IPv4 loopback and checks the exact Host; requests carrying
an Origin header are denied. Authentication is required on every request and
the random instance ID is not a substitute for a token. Use a distinct token for
each listener/consumer trust boundary. This optional endpoint exposes the same
local tool profile as stdio, including writes, so only give the credential to a
trusted client. Don't port-forward, reverse proxy, tunnel, or publish this endpoint.
Stop the process to close it; to rotate credentials, set a new token and restart.
Long-lived streams and session resumption aren't enabled. A successful request
uses JSON responses, and GET / DELETE are unsupported by this stateless endpoint.

The separation of local identities, loopback binding and authenticated calls is
inspired by [ComGu's MCP server](https://github.com/Tanaboonnnnn/Com-gu/blob/main/src/main/mcp/server.ts);
the default mode keeps the bearer secret out of the URL.
See the [MCP transport security guidance](https://modelcontextprotocol.io/specification/2025-11-25/basic/transports#security-warning).
