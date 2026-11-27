# Layouts inspired by OpenDesign

Settings → Layout presents the existing five choices, then Linear, Notion, Warm Editorial and Insights, Fieldbook, and Study Instrument. These layouts change the desktop frame and navigation. Insights also has a distinct Home overview. The app pages, routes, and stored workspace data are unchanged. Phones keep the bottom menu except in Study Instrument, where the same workspace keys remain at the top.

| Layout | Navigation | Default Colours choice |
| --- | --- | --- |
| Linear | Compact grouped sidebar, wider workspace | Indigo |
| Notion | Workspace and library sidebar, breadcrumb, narrow content column | Paper |
| Warm Editorial | Centred serif masthead and horizontal index | Terracotta |
| Insights | Icon rail, section sidebar, quick find, and data-backed Home cards | Garden |
| Fieldbook | Quiet sidebar, agenda and reading-first Classroom | Fieldbook Paper |
| Study Instrument | Desk, Study and System keys with context links and one reading surface | Instrument Paper |

Selecting a different Layout applies that layout’s matching Colours preset. Choosing a different Colours preset afterward is allowed and persists on reload; selecting the same Layout again does not override it. The former Appearance presets section is removed. Layout preferences remain per browser/device. A successful QR pairing or re-scan copies the layout and colours from the QR, not any account data or a live preference feed.

References: [OpenDesign Linear](https://github.com/nexu-io/open-design/blob/main/design-systems/linear-app/DESIGN.md), [OpenDesign Notion](https://github.com/nexu-io/open-design/blob/main/design-systems/notion/DESIGN.md), and [OpenDesign Warm Editorial](https://github.com/nexu-io/open-design/blob/main/design-systems/warm-editorial/DESIGN.md). Tesseract adapts visual principles; it does not ship those products' logos, external fonts, packages, or any OpenDesign service integration.

## Colour fidelity

- **Indigo / Linear:** in dark mode, reference canvas `#08090a`, sidebar `#0f1011`, panel `#191a1b`, text `#f7f8f8`, CTA `#5e6ad2`, and interactive accent `#7170ff`. Light mode uses the reference's light neutrals.
- **Paper / Notion:** in light mode, reference white canvas, warm surface `#f6f5f4`, warm sidebar `#31302e`, CTA `#0075de`, and 10% black borders.
- **Terracotta / Warm Editorial:** in light mode, the [live catalogue preview](https://open-design.ai/plugins/design-system-warm-editorial/) uses paper `#fbf6ee`, panel `#fffdf8`, warm surface `#f1e3cf`, text `#201914` and rust accent `#9b5b32`. This intentionally takes precedence over the older Markdown palette.

See also the official [Linear](https://open-design.ai/plugins/design-system-linear-app/) and [Notion](https://open-design.ai/plugins/design-system-notion/) app and website examples. The dark versions of Paper and Terracotta are Tesseract adaptations, not claims about the source's exact dark theme. A different Colours selection still overrides the layout's recommended palette. No third-party assets, fonts, or stylesheets are loaded.

Insights uses existing workspace and schedule data and does not import report data, branding, or sample metrics from the reference image. Ctrl/⌘+K opens desktop quick find for pages, projects, and courses.

Study Instrument reuses the Fieldbook reading structure and shared course resume state without replacing lesson visuals. The only raised elements are the mode keys, the active mode has the strongest accent, and chapter chips keep long titles clipped to their own hit areas. The Windows installer and workspace format are unchanged.
