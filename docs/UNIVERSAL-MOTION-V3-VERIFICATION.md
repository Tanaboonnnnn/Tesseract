# Universal Motion V3 — pre-release verification

Base: `044bb11` (GitHub v0.5.0). Development uses a separate checkout and synthetic course data. No live course, deployed app, GitHub branch, or release was changed.

| Surface | Evidence |
| --- | --- |
| TypeScript/build | `npm run typecheck`, `npm run build:desktop` passed on Linux; WebGL code builds as a separately loaded chunk. |
| Regression suite | `npm test`: 227 passed, 1 Windows-only credential test skipped. Scene validation covers bounded data, IDs, script/asset fields, bindings, sampling, and easing. Classroom tests preserve older schema and confirm inline layout. |
| MCP | Real local Streamable HTTP SDK test calls the schema and validation tools using an ephemeral listener. Controlled remote/classroom profile tests verify the tool and draft-only behavior. Live ChatGPT/OpenAI Tunnel has not been tested on this iteration. |
| Classroom preview | Real Chrome: text → Load Balancer scene → follow-up text, selecting Request 2 shows Server B, number slider changes state, formula → picture and picture → formula, Next/Previous navigate terms, and switching to Lab removes the player. |
| Cross-subject | Network/ML worked in the same player. Spring fixture was added after freezing the initial 2D player (commit `93944d0`); its first commit contains only JSON and time/rewind/binding assertions passed. This proves the authored fixture does not require new renderer code; it is not an independent two-AI test. |
| Adaptive layout | Desktop mixed plot/formula card measured 676 px for plot, 272 px for inspector, with natural independent heights. Narrow layouts stack by container width. Physical mobile not re-tested after the adjustment. |
| WebGL | Startup fallback in Chrome was verified: the environment did not provide WebGL, format retained interactive 2D, shared timeline, and formula binding. Native WebGL orbit/click and mid-play context loss still require a capable host; the sample uses primitives and is not an anatomical model. |
| User data | Only isolated fixtures. Existing learning/course suites pass. No on-disk changes to real data. Do not downgrade a workspace after submitting new-feature scenes without restoring a separate pre-upgrade backup. |

Release is gated on native GPU/Windows and physical-device checks, live Tunnel validation, and the remaining V3 acceptance tests. No public release is implied by a successful local build.
