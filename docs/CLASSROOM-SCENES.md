# Classroom motion scenes (v1)

A scene is an English UI with author-supplied labels and lesson copy in any language. It is a typed data block, not HTML; diagrams, plots and inspect panels share a single clock. Choose one observable teaching point per beat, explain why the state changed, and give readable fallback text. Do not imitate a UI from a fixed subject template.

1. Ask MCP `classroom_format` with `include_scene_schema: true` for the input contract and an example.
2. Use stable IDs. A diagram may be flat or isometric. Plot positions are normalized screen coordinates (0 plain left/top, 100 right/bottom); label axes and units explicitly. A control can set exactly one component property; it cannot conflict with its animated track. Turn on `loop` only for a genuinely repeating process.
3. Use an inspect panel, optionally with LaTeX `\term{id}{...}`. Match that ID to a binding for one or more visible elements. The term and the object can then be selected in either direction. Use a meaningful explanation, not just a duplicate label.
4. Pass the scene's `data` as `scene` to `validate_course_visual`. It checks structure and references without writing. It cannot verify the explanation or source claims.
5. Stage the validated block via the existing draft flow and current revision anchor. Preview before the owner publishes. Use direct references and text fallbacks. There is no execution or publish tool in the new flow. Never retry an uncertain write without checking the original request ID.
6. Autoplay is local to each learner browser. Only one visible scene plays, it stops off-screen, and reduced motion disables automatic playback. App styles supply the colors and controls; no custom CSS, HTML, remote media, or script is accepted in the scene.

An optional mesh panel supports depth-buffered 3D spheres and boxes with camera controls. Opening a 3D view is explicit; a 2D drawing and named selectable objects remain available without WebGL. It does not load external models.

Development fixtures in `app/fixtures/motion` use synthetic teaching data, not live classroom content.

## Inline lessons and pacing

Place a text block, then a scene, then the next text block in the course's existing block array. If the lesson has a scene, Learn keeps this ordering and does not pull all visuals into a gallery. For an inline lesson without a scene, choose `layout: "inline"` on the lesson. Use the old formula block directly for a formula-only lesson and typed plots or static charts only when they teach something. Older lessons that do not request inline layout and have no scene keep their existing layout. Include a sentence introducing what to look at and a follow-up explaining what the learner saw.

Use the default linear timeline for data. A track may opt into `step` for a real state change or `ease-in-out` for a purely illustrative motion. Do not change measured data to make it look smoother. Off-screen and reduced-motion behavior still applies.

### A shared visual standard, not a fixed shape

Keep the learner in the lesson: establish the idea and a prediction in prose, put the explanatory image next to that idea, and follow it with an interpretation or self-check. The scene is not a replacement for the text. Use the course's language for labels, legend, step captions, and fallback copy.

Prefer a quiet stage, readable labels close to their subject, semantically distinct colors, one focal change per step, and compact playback. A network can use equipment, a physics lesson can use actual spatial primitives, and a graph can remain flat. Choose 3D when the viewpoint teaches something or a rotatable model is useful. Do not reuse a network rack's shape in unrelated subjects.

A mesh panel may use `path` with the same bounded XY points as a diagram; use its `z` to place that path on a plane. Both renderers share the same entities, timeline, seek position, and captions. Optional scene `legend` entries are plain label/tone pairs. Optional box `appearance` values `equipment-rack` and `display` draw simple equipment details without external assets. These additions do not change old scenes. The Load Balancing fixture is the reference for coordinating paths and counter-flow, not a subject-specific runtime.

The shared 3D presentation follows the user's Smooth Explainer reference: stable readable framing, purposeful short motion, softly settling camera, clear objects and paths, and progress explained in the nearby lesson. The Load Balancing and depth-marker fixtures deliberately use different shapes and subject matter. In a mesh panel, the third coordinate of an optional XYZ path point is absolute at a path entity z of 50; changing the path's z moves the whole path. The 2D fallback projects XY only. The camera is presentation state and does not move model entities or change the lesson timeline.

For a mesh, optional stage tabletop places the illustration on a world-space plane with a camera-relative grid, suitable for systems, machines or layouts. Keep upright (the default) where vertical or oblique spatial motion is the teaching point. Both stages retain document-localized controls and one narrator caption; avoid saturated whole-object flashes or stacking extra cards around playback.
