# DeepuNotes V2.1 — iPad Pencil Fix

This build fixes the V2 HTML/JavaScript mismatch and removes the old service-worker
dependency that could leave Safari serving stale files.

## Main fixes
- Apple Pencil draws across the whole writing page.
- Finger touch scrolls instead of drawing.
- Focus mode does not depend on browser fullscreen.
- Blank / Ruled / Grid / Dot backgrounds work.
- Page list and page switching work.
- Local IndexedDB storage.
- Backup / restore.
- No cloud account or analytics.

## IMPORTANT
Replace ALL files in the GitHub Pages repository with these V2.1 files.
Do not mix V2.1 `index.html` with an older `app.js` or `style.css`.

If your existing GitHub Pages site previously installed a DeepuNotes service worker,
use the V2.1 files and then reload the site. If Safari still shows the old screen,
open the site in a fresh private tab or clear that site's website data, then reopen it.

For the cleanest test, you can also publish V2.1 from a NEW repository / URL.

## Current scope
PDF import/annotation/export is intentionally not included in this test build.
The priority here is to verify reliable Apple Pencil input first.
