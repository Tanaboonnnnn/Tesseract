# Tesseract foundation: verification and next gate

Base: Panya `8cb35bb1000ef2d9c7a2607581a7ef77fe31165a`. Upstream MIT notice remains intact. Tesseract uses a distinct app identity and local port (4320, dev UI 5180), plus distinct settings under `~/.tesseract/`. The existing workspace features remain enabled; course fixtures are test-only. Cross-device pairing still uses the app on a host you control. It does not replicate private data into Git, and it requires the host to be reachable.

## What was optimized

- Defer independently navigable routes until opened. The dashboard retains its Skills radar, but defers its renderer until the card is near the viewport. Learning lists do not ship the visual renderer before opening a visual.
- Production entry graph in same-environment builds: 1,080,606 → 345,305 bytes of JavaScript raw; 319,452 → 109,470 bytes gzip (about 66% less). These are static imports reachable from the site entry, not total downloads after loading a deferred feature or a claim about page speed, memory or total install size.
- In the original baseline, the isolated MCP test profile advertised 3 tools instead of exposing the 29 legacy remote tools to the classroom workflow. Tool list serialized size 13,751 → 1,394 bytes (about 90% smaller; different tool sets, not a speed comparison between unlike workloads). Stage-and-validate returns a receipt in one call; receipt lookup does not replay the write.
- In a 35-call, small synthetic in-process benchmark after warm-up, stage p50/p95 ≈ 0.68/2.47 ms; receipt ≈ 0.28/0.65 ms. These results exclude network, Tunnel queue and model latency. The legacy profile is unchanged in capability.

## Verification commands

From `app/`, run `npm ci`, `npm run typecheck`, `npm test`, `npm run build:desktop`, `node scripts/perf-web.ts <upstream-dist> apps/web/dist`, and `node apps/mcp/src/benchmark.ts`. The benchmark and tests create only disposable synthetic data. The server can also be tested with an isolated temporary `--data` directory and loopback only.

## Explicitly not enabled

No real rooms, content migration, user-facing classroom UI or publish HTTP endpoints, and no live tunnel configured for the classroom profile. The isolated store exercises draft validation, deduplication, version switches and history with synthetic data. Actual browser interaction, Windows launcher/device behavior, and end-to-end MCP over Tunnel must be verified separately before claiming production readiness.

## Follow-up: backup, device checks and MCP status

- [Recover a workspace](BACKUP.md): export validated managed data and restore it only to a new directory. The local-only restore preview suppresses integrations.
- [Device QA](DEVICE_QA.md): Linux Chromium covers desktop, Android-sized and iPad-sized screens. Hardware and Safari are separate gates.
- Local stdio now verifies a live `running` notification (when requested by the MCP client), a durable `staged` receipt and reconnect-time lookup by request ID without re-running the write. A missing receipt is `unknown`, not proof of non-delivery. The isolated profile now advertises four tools; legacy remote authorization and the default app remain unchanged.
- Benchmark with `node apps/mcp/src/benchmark.ts --stdio` from `app/`. It reports cold child-process connection separately from tool calls. This is a local process boundary, not OpenAI Tunnel or actual chat latency. No Classroom product endpoint or real room is enabled.
