# Vendored Pages sources

Pages: https://github.com/S-poony/Pages
Commit: cb7c648b05298c6fdd70453244dbaf116880e4d1
License: MIT (declared in upstream README).

PagesEngine: https://github.com/S-poony/PagesEngine
Commit: 6c585892900409b2f794afb34c9ad3dc4e6f715d
License: MIT; see ENGINE-LICENSE.
engine.js and engine.css were bundled from src/PageFlip.ts with esbuild 0.25.12, IIFE global name St.

Local patches: showCover enabled; resize updates display mode and page aspect ratio, recreates spread collection only when switching mode; initial page number and input minimum corrected; page-number/hash jumps use the engine's immediate turnToPage API to avoid jumping animations from cover pages. scripts/reader-extras.js adds magazine sharing controls. The PDF processor is a build-time Poppler/Pillow adapter; the original Pages generator, UI, animation, navigation and zoom modules remain in use.

Reader UI adaptation: one floating bottom toolbar outside the perspective container and current/total page display. Pages' original active state and hide timer are reused; pointer movement into the bottom 96px or a bottom-edge touch reveals the toolbar. Ctrl+wheel and plus/minus keys feed the original slider input handler, reusing transform, pan limits and image-quality updates. The sharing dialog contains QR and clipboard copy without success feedback. Fullscreen targets the document to retain the dock.
