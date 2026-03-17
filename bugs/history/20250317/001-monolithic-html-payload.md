# BUG-001: Monolithic HTML payload (~143KB inline)

## Status: Resolved

## Summary

Web UI CSS and JavaScript were extracted from the inline Dart string in `html_content.dart` into standalone assets and served via jsDelivr CDN.

**Changes:**
- **`assets/web/style.css`** — Extracted CSS (~129 lines). Theme, layout, components, connection banner, charts, data table, column chooser, query builder.
- **`assets/web/app.js`** — Extracted client-side script (~3,860 lines). Auth, SQL runner, schema, sessions, performance, heartbeat, query builder, diff rendering, copy toast, etc.
- **`lib/src/server/html_content.dart`** — Replaced ~4,212-line monolithic string with a ~227-line HTML shell. Head includes `<link>` for style.css and body ends with `<script src="...app.js">`. CDN URLs use `ServerConstants.packageVersion` (getter `indexHtml` for interpolation). A matching git tag (e.g. v1.6.1) must exist for the CDN to serve assets.
- **`test/drift_debug_server_test.dart`** — "GET / serves HTML with SQL history UI" now asserts `assets/web/app.js` in the response (SQL history lives in app.js).
- **`assets/web/build_shell.py`** — One-time script to regenerate the shell from a monolithic html_content.dart; doc notes line ranges must match source.

**Benefits:** Consuming app binaries no longer embed ~143KB of static UI; CSS/JS are cacheable by CDN and browser; IDE tooling for .css/.js; version-pinned immutable URLs.

**Related:** Modularization plan issue #2 (`bugs/026-modularization-plan.md`) — COMPLETE.
