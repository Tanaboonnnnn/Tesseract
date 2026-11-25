# Foundation hardening implementation plan

**Goal:** Recover Tesseract data safely, verify paired-device flows, and clarify MCP request outcomes without launching a classroom.
**Architecture:** Core owns a versioned, offline workspace snapshot and restore-to-new-directory operation. The paired web client uses the existing session endpoint; MCP transport tests use the existing isolated draft profile.
**Spec:** SPEC.md §3–4 and §11; approved follow-up in the Tesseract conversation.

- [x] Add core tests for workspace export/restore, portable paths, corruption and no-overwrite; implement a local CLI and document exclusions.
- [x] Test paired device session, shared workflow and host loss using disposable data; retain existing UI design and auth. Physical hardware remains a separate gate.
- [x] Test request-state semantics through stdio across fresh sessions; never automatically retry a write or start a live Tunnel.
- [x] Run typecheck, tests, desktop build and browser checks separately; record hardware/cloud checks that could not run.

Release gates still pending: native Windows, physical Android/iPad (including Safari), and an explicitly authorized OpenAI Tunnel test.
