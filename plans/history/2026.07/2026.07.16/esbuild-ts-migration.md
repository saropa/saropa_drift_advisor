# esbuild + TypeScript Migration Plan — COMPLETE

## Context

The web viewer's JS assets were a 6700-line `app.js` monolith plus 4 small IIFEs (`fab.js`, `masthead.js`, `table-def-toggle.js`, `sql-highlight.js`), all plain JS with `checkJs`. Inter-module communication used `window.*` globals. Adding each new module required touching 4+ Dart files for plumbing. This migration added esbuild to bundle everything into a single `bundle.js`, converted the small modules to TypeScript, and collapsed the Dart server plumbing from N cached fields / N script tags to 1.

`app.js` remains plain JS (type-checked via `checkJs`) — it consumes `window.*` globals bridged by `index.js`. Since the migration landed, 50+ additional `.ts` modules have been extracted from `app.js` and added to the bundle (charts, schema explorer, query builder, sidebar, etc.), validating the architecture.

---

## Status: ALL PHASES COMPLETE

All four phases have landed and are verified in production.

---

## Phase 1: esbuild infrastructure — COMPLETE

- `assets/web/index.js` — entry point importing all TS modules + `app.js`
- `esbuild.config.mjs` — IIFE bundle, ES2020 target, `--watch` support
- `assets/web/bundle.js` — build output, checked into git
- `package.json` — `esbuild: ^0.28.1` devDep, scripts: `build:js`, `build:js:watch`, `build`

---

## Phase 2: Dart server simplification — COMPLETE

Files live under `lib/src/server/`, not `lib/src/`.

- `generation_handler.dart` — single `_cachedBundleJs` field, one-read `_cacheWebAssets()`, simplified `_sendWebAsset()` switch
- `html_content.dart` — `buildIndexHtml({inlineBundleJs:})`, single `<script>` tag or CDN fetch-loader for `bundle.js`
- `server_constants.dart` — `pathWebApp = '/assets/web/bundle.js'`, `pathWebAppAlt = 'assets/web/bundle.js'`

---

## Phase 3: Convert small modules to TypeScript — COMPLETE

- `sql-highlight.ts` — exported function, IIFE removed, `window.sqlHighlight` bridged in `index.js`
- `masthead.ts` — exported init + `MastheadStatus` interface, `window.mastheadStatus` bridged in `index.js`
- `fab.js` — deleted (FAB replaced by toolbar; no `hamburger-menu.ts` either — that was superseded by `toolbar.ts`)
- `table-def-toggle.ts` — exported init, IIFE removed
- `index.js` — imports all TS modules, bridges `window.*` globals for `app.js`
- `dom-globals.d.ts` — Window interface extended with `sqlHighlight`, `mastheadStatus`, `_chartRows`, toolbar globals, etc.
- `tsconfig.web.json` — includes `index.js`, `app.js`, `assets/web/**/*.ts`, `dom-globals.d.ts`; excludes `bundle.js`; `allowImportingTsExtensions: true`
- Old `.js` files deleted: `fab.js`, `masthead.js`, `table-def-toggle.js`, `sql-highlight.js`

---

## Phase 4: Update tests — COMPLETE

- `test/html_content_test.dart` — uses `inlineBundleJs:`, asserts `bundle.js` in CDN URLs
- `test/generation_handler_test.dart` — tests route `/assets/web/bundle.js`, MIME type `application/javascript`

---

## File Change Summary (as landed)

| Action | File |
|--------|------|
| Create | `assets/web/index.js` |
| Create | `esbuild.config.mjs` |
| Create | `assets/web/bundle.js` (build output, committed) |
| Rename | `sql-highlight.js` → `sql-highlight.ts` |
| Rename | `masthead.js` → `masthead.ts` |
| Delete | `fab.js` (replaced by `toolbar.ts`) |
| Rename | `table-def-toggle.js` → `table-def-toggle.ts` |
| Modify | `package.json` |
| Modify | `tsconfig.web.json` |
| Modify | `dom-globals.d.ts` |
| Modify | `lib/src/server/generation_handler.dart` |
| Modify | `lib/src/server/html_content.dart` |
| Modify | `lib/src/server/server_constants.dart` |
| Modify | `test/html_content_test.dart` |
| Modify | `test/generation_handler_test.dart` |
| Modify | `CHANGELOG.md` |

---

## Verification (all passing)

1. `npm run build:js` — `bundle.js` produced without errors
2. `npm run typecheck:web` — no TS errors
3. `dart test test/html_content_test.dart` — all tests pass
4. `dart test test/generation_handler_test.dart` — all tests pass
5. Manual: web UI loads, connection pill works, SQL highlighting works, toolbar works, table-def toggle works
