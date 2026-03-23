# Web UI: serve style.css and app.js locally (CDN fallback)

## Status: Implemented

## Summary

Browsers rejected jsDelivr responses for `style.css` / `app.js` when the CDN returned `Content-Type: text/plain` with `X-Content-Type-Options: nosniff`, so styles and scripts never applied.

**Changes:**

- **`lib/src/server/router.dart`** — `GET /assets/web/style.css` and `GET /assets/web/app.js` (with or without leading slash) handled in `_routePreQuery` before DB-backed routes.
- **`lib/src/server/generation_handler.dart`** — Streams files from package root resolved via `Isolate.resolvePackageUri(package:saropa_drift_advisor/saropa_drift_advisor.dart)`; sets `text/css` and `application/javascript` charset UTF-8; logs and closes on stream errors.
- **`lib/src/server/html_content.dart`** — Local-first `<link>` / `<script defer>` with `onerror` fallback to version-pinned jsDelivr URLs.
- **`lib/src/server/server_constants.dart`** — Path constants for asset routes.
- **`assets/web/build_shell.py`** — Regenerated shell strings stay aligned with local-first + fallback.
- **`test/handler_integration_test.dart`** — Asserts 200, MIME, body markers, alt path, 404 for unknown assets, POST not served as static file.
- **`test/drift_debug_server_test.dart`** — Root HTML asserts `src="/assets/web/app.js"`.
- **`README.md`**, **`CHANGELOG.md`** — Document behavior.

**Related:** `plans/history/20260317/001-monolithic-html-payload.md` (CDN-only era); this extends that design with same-origin serving.
