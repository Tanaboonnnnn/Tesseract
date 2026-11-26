# Isometric illustrations

Use Learning → Review for a saved visual. A lesson can embed a visual in its own Learning item using the existing visual block. An ISO part is catalog data, never HTML or SVG from the author.

1. Use `visual_formats({type:"iso"})`, then ask for a pack (`network` or `physics`).
2. Adapt the selected example. Keep one idea per scene, captions that work without movement, named anchors and half-grid positions. Avoid projected overlap: separate key parts across both axes, leave room for labels, and route around unrelated solids. Split crowded scenes instead of adding tiny labels. Use one meaningful event per step and explain the outcome in the caption; do not pad playback with empty beats. Failed saves return a rule, path, message and suggested repair.
3. Send the scene with the target Learning ID to `save_visual`. Existing IDs cannot switch to/from ISO; pick a new ID. Writes go through Core with audit and undo.
4. For a Classroom draft, request `classroom_format({iso_pack:"network"})`, use `schema_version: 2`, and include a plain-text fallback. Submit a draft; only the local owner publishes with existing controls. Keep existing v1 bundles as v1. A manual downgrade uses a full workspace copy taken before using v2; older app binaries are not v2 clients.

## Definition of done for a lesson visual
- Make one teaching point with a cause, change and outcome. Require a caption that works with motion disabled; the picture backs up the lesson rather than replacing it.
- Start from the app's recommended view. Check that a learner can identify each relevant part and follow the route without rotating first. Verify the other three views and the reset action do not change the lesson step.
- Verify desktop and compact layouts, both palettes, keyboard navigation and the Pause/Replay path. On compact screens numbered pins are paired with an ordinary-text key containing the same labels and statuses.
- Keep the motion scoped to the active event and leave the final result visible. Split scenes that remain hard to read. Keep the authoring rules in both on-demand MCP paths, not per-tool descriptions. Passing the schema is not a visual quality or factual accuracy guarantee.

## Adding a pack
- Define a subject in `app/packages/core/src/iso-catalog.ts`: grid footprint, named anchor offsets and roles, wire/flow support, explicit cutaway support only if it exists.
- Define data-only validity rules and passing and failing examples in `iso.ts` and core tests. Make format discovery return only the selected pack on demand. Do not add tools or runtime authoring of components.
- Add trusted component functions in `app/apps/web/src/components/visuals/iso-parts.tsx`. Keep shapes within their reserved envelope and use only the scoped tokens in `iso-tokens.css`. Use the renderer/manifest parity test, snapshot every state, verify dark/light and motion-off, and check layout against the references. Do not repeat the player, animation runtime, or per-device settings.
- Future slots are intentionally unregistered. Chemistry, biology and economics are not built.

## Deliberate limitations
No factual or electrical simulation is implied. The validator checks shape, references, counts, grid and component connectivity direction, not whether a real network design or electrical circuit behaves that way. An occluded object in projection is not a collision in world coordinates. The renderer selects the clearest of four orthographic corners based on overlap, important routes, and callouts. Labels are placed by the app, never by the author. Learners can rotate in quarter turns or reset without changing the step, board size, or palette. It is not free orbit. Some dense layouts, intentional stacks and unusual scripts still require visual review at the intended viewport. The pre-existing interactive `scene` visual is a separate format and no content is migrated from it.

## Design constants
Projection uses exact 30° axes and 40 CSS units per world unit. Scene markup uses a 1.5 unit ink edge, 1 unit details, 3 unit wire, 6/8 static dash spacing, 13 unit base label, compact status labels, 10% minimum stage margin, and a consistent 12% soft contact shadow offset (6,5). Theme values are the proposed DESIGN palette in `iso-tokens.css`; light defaults to the System Design paper variant. Shadow blur is a static treatment. The single burst on entering a step is 950 ms for a token and 200 ms for a newly introduced fault; motion uses transform only and a stationary terminal token is shown without motion. No glow, gradients or external assets. Device motion-off and reduced-motion both cancel movement. Existing player owns navigation and autoplay.

## Reproduce the synthetic preview (Linux)
From `app/`: create a disposable folder with `mktemp -d /tmp/tess-iso-review.XXXXXX`, copy `fixtures/sample-data/.` into it, run `node fixtures/iso/preview.ts <that-folder>`, then `npm run build:desktop` and `node apps/server/src/main.ts --data <that-folder> --restore-preview --port 4389`. Visit the paths printed by the fixture script. No fixture is installed in normal workspaces.

## Verification handoff
- Phase 2: the web art layer lives in `IsoArt.tsx`, `IsoView.tsx`, `iso-parts.tsx`, and the scoped ISO CSS files; `Visual.tsx` still owns the step controls. The artwork is loaded in a separate Vite chunk. A fixed square tile board includes the entire authored route, never recomputes on step changes, and keeps the grid behind opaque solids.
- Phase 3: the existing `save_visual` and `classroom_format` paths use Core validation; the latter only stages v2 drafts. Validated the local publish/restore lifecycle in temp data, including preserving v1 revision/attempts, rejecting a future stored version before changing the pointer, and accepting v2 in JSON/ZIP. Guide counts one on-demand ISO request.
- Phase 4: network and physics have two synthetic examples each and seven solid components each; wire is a connection. Tests compare each component in four states, all four sample scenes for deterministic markup, exact theme structure, route corner transforms, and fixed framing. Chrome showed the square circuit board unchanged across switching, the warm-paper and navy tokens with identical framing, and a distinct fault before the breaker response.
- First-load production manifest on this Linux build: 362,241 bytes raw JS and five chunks before and after; gzip 113,887 → 113,883 bytes on the final observed build. Renderer is lazy. 269 tests passed, one Windows DPAPI-only test skipped; typecheck and desktop build passed.
- An independent author given only the real MCP format response authored a queue-to-worker-to-database lesson. Its unmodified first attempt saved and read back successfully through the remote profile in temporary data. Separately, the scripted MCP smoke covered three topics and undo. Reference comparison is not a claim of asset or pixel parity.
- Remaining external checks: physical Windows device and the owner’s visual review. No release, remote production tunnel, or live workspace revision was changed.
