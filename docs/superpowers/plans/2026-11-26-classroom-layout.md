# Classroom layout implementation

Approved desktop and mobile frames are Figma document ZWbvMEOTrDaXFkfXmE40ta, nodes 7:70 and 7:244. Use the paper/green palette, IBM Plex Sans Thai, and compact Rajdhani labels within Classroom only; preserve the shell and user dark preference.

1. Test chapter display strings, a bounded desktop chapter window, and a source-derived outline. Use actual lesson anchors, revision IDs and navigation routes; no schema or persisted data changes.
2. Replace the Classroom reading surface with a responsive reading layout: topic chooser, stable Learn/Lab/Check tabs, objective, small text outline, readable editorial Markdown and inline full-width visuals. Keep the unchanged data-driven SVG player and compatibility for legacy lessons. Adapt lab and quiz styling without changing grading or draft visibility.
3. Embed the Thai subset locally; verify Vite output and the existing Windows regression checks.
4. Compare the read-only Windows preview on desktop and 390 px, navigate into Lab/Check and confirm the existing autoplay, reduced motion and progress behavior. No production publish, no write against the live course.
