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

## Follow-up: `.pubignore` gap (2026-03-25)

The original implementation worked from the package source directory (tests pass) but
failed for consumer apps installing from pub.dev. Root cause: `.pubignore` contained an
unanchored `web/` pattern which — per gitignore spec — matches at any depth, silently
excluding `assets/web/` from the published archive. Fixed by anchoring to `/web/`
(root-only). Regression test added in `test/version_sync_test.dart`.

## Follow-up: emulator 404s (2026-03-25)

On Android/iOS emulators the host filesystem is unreachable — `Isolate.resolvePackageUri`
throws in Flutter runtimes and `Directory.current` points to the device, so the ancestor
walk never finds the package root. Both `app.js` and `style.css` returned HTTP 404;
the CDN `onerror` fallback also failed silently.

**Fix:** `lib/src/server/web_assets_embedded.dart` — new generated file containing
`app.js` and `style.css` as Dart `r'''...'''` string constants.
`generation_handler.dart` `_sendWebAsset()` now serves from the embedded constant
when file-based resolution fails, instead of returning 404.
Sync tests in `version_sync_test.dart` verify the constants match the on-disk files.

## Follow-up: Firefox onerror never fires on 404 with correct MIME (2026-04-03)

The `onerror` attribute on `<link>` and `<script>` elements does not reliably
fire in Firefox when the server returns HTTP 404 with the correct MIME type.
The multi-CDN fallback chain (`_sda_fb`) was dead code in practice.

**Fix:** CSS and JS are now inlined directly into the HTML response via
`<style>` / `<script>` tags when the package root is resolved on disk.
`HtmlContent.indexHtml` replaced with `HtmlContent.buildIndexHtml()` which
accepts optional `inlineCss` / `inlineJs` parameters. When local files are
unavailable, the HTML references jsDelivr CDN URLs directly — CSS via
`<link onerror>` (CDN→CDN only), JS via a fetch-based loader that creates
`<script>` elements dynamically. The loading overlay now shows version and
per-asset diagnostic status instead of a blank "Loading…" message.
