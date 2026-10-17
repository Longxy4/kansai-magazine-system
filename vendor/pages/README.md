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

Single-page animation adaptation: skip the duplicate left resting page and the paired hard-page drawing in single display mode; use soft pages on portrait screens and clip curls to one sheet. Touch devices show a faint sidebar handle inside the original 12 × 96 hit area; pointer-based desktop entry remains invisible.

Animation stability: temporary page copies use the original image's selected URL without responsive-source reselection; adjacent real pages are decoded in both directions. Image sizing follows single/double layout without resetting srcset or toggling image compositor layers at the end of a flip. Single-sheet containment uses overflow clipping instead of nesting a parent clip-path around the animated page clip-paths.
