# esbuild + TypeScript Migration Plan

## Context

The web viewer's JS assets are a 6700-line `app.js` monolith plus 4 small IIFEs (`fab.js`, `masthead.js`, `table-def-toggle.js`, `sql-highlight.js`), all plain JS with `checkJs`. Inter-module communication uses `window.*` globals. Adding each new module requires touching 4+ Dart files for plumbing. This migration adds esbuild to bundle everything into a single `bundle.js`, converts the small modules to TypeScript, and collapses the Dart server plumbing from N cached fields / N script tags to 1.

`app.js` stays as-is (6700 lines of JS) — splitting it into TS modules is a separate future task.

---

## Phase 1: esbuild infrastructure

### 1a. Create `assets/web/index.js` (entry point)
```js
import './sql-highlight.js';
import './masthead.js';
import './app.js';
import './fab.js';
import './table-def-toggle.js';
```
Order: producers (`sqlHighlight`, `mastheadStatus`) before consumer (`app.js`), self-contained last.

### 1b. Create `esbuild.config.mjs` (root)
- Entry: `assets/web/index.js`
- Output: `assets/web/bundle.js`
- Format: `iife`, target: `es2020`
- No minify, no sourcemap (matches current setup)
- `--watch` flag support

### 1c. Update `package.json`
- Add `esbuild: ^0.25` to devDependencies
- Add scripts: `build:js`, `build:js:watch`, `build` (js + style combined)

### 1d. Run build, commit `bundle.js`
`bundle.js` is checked into git (Dart consumers don't need Node).

---

## Phase 2: Dart server simplification

### 2a. `generation_handler.dart`
- **Remove** 4 cached fields: `_cachedAppJs`, `_cachedFabJs`, `_cachedMastheadJs`, `_cachedTableDefToggleJs`
- **Add** 1 field: `_cachedBundleJs`
- Simplify `_cacheWebAssets()`: one file read (`assets/web/bundle.js`) instead of 4
- Simplify `_sendWebAsset()` switch: 2 arms (`style.css`, `bundle.js`)
- Simplify `sendHtml()` call: `inlineBundleJs: _cachedBundleJs`

### 2b. `html_content.dart`
- **Change signature**: `buildIndexHtml({String? inlineCss, String? inlineBundleJs})`
- **Replace** 4 JS tag variables with 1 `bundleJsTag`
- CDN loader: same fetch-based pattern, URLs point to `bundle.js` instead of `app.js`
- Diagnostic text: `jsSource`/`jsStatus` reference `bundle.js`
- HTML injection: single `$bundleJsTag` replaces 4 lines at L636-639

### 2c. `server_constants.dart`
- Change `pathWebApp` / `pathWebAppAlt` to point to `bundle.js`

---

## Phase 3: Convert small modules to TypeScript

### 3a. `sql-highlight.js` -> `sql-highlight.ts`
- Remove IIFE, add `export function highlightSql(sql: string): string`
- Remove `window.sqlHighlight` assignment

### 3b. `masthead.js` -> `masthead.ts`
- Remove IIFE, export `initMasthead()` returning the status API object
- Export `MastheadStatus` interface

### 3c. `fab.js` -> `fab.ts`
- Remove IIFE, export `initSuperFab(): void`

### 3d. `table-def-toggle.js` -> `table-def-toggle.ts`
- Remove IIFE, export `initTableDefToggle(): void`

### 3e. Update `index.js` to bridge window globals
```js
import { highlightSql } from './sql-highlight.ts';
import { initMasthead } from './masthead.ts';
import './app.js';
import { initSuperFab } from './fab.ts';
import { initTableDefToggle } from './table-def-toggle.ts';

// Bridge for app.js (still reads window.*)
window.sqlHighlight = highlightSql;
const api = initMasthead();
if (api) window.mastheadStatus = api;

initSuperFab();
initTableDefToggle();
```

### 3f. Update `dom-globals.d.ts`
- Add `sqlHighlight` to Window interface
- Keep `mastheadStatus` and `_chartRows`

### 3g. Update `tsconfig.web.json`
- Include: `index.js`, `app.js`, all `.ts` files, `dom-globals.d.ts`
- Exclude: `bundle.js`
- Add `allowImportingTsExtensions: true`

### 3h. Delete old `.js` files
- `fab.js`, `masthead.js`, `table-def-toggle.js`, `sql-highlight.js`

---

## Phase 4: Update tests

### `test/html_content_test.dart`
- L17-19: Change `inlineJs:` to `inlineBundleJs:` in setUp
- L33, L45: Change `app.js` assertions to `bundle.js`
- L94: CDN fallback URL assertion: `app.js` -> `bundle.js`

### `test/generation_handler_test.dart`
- Route path may need updating if `pathWebApp` constant changes
- MIME type tests unchanged

---

## File Change Summary

| Action | File |
|--------|------|
| Create | `assets/web/index.js` |
| Create | `esbuild.config.mjs` |
| Create | `assets/web/bundle.js` (build output, committed) |
| Rename | `sql-highlight.js` -> `sql-highlight.ts` |
| Rename | `masthead.js` -> `masthead.ts` |
| Rename | `fab.js` -> `fab.ts` |
| Rename | `table-def-toggle.js` -> `table-def-toggle.ts` |
| Modify | `package.json` |
| Modify | `tsconfig.web.json` |
| Modify | `dom-globals.d.ts` |
| Modify | `generation_handler.dart` |
| Modify | `html_content.dart` |
| Modify | `server_constants.dart` |
| Modify | `html_content_test.dart` |
| Modify | `CHANGELOG.md` |

---

## Verification

1. `npm run build:js` — bundle.js produced without errors
2. `npm run typecheck:web` — no new TS errors
3. `dart test test/html_content_test.dart` — all tests pass
4. `dart test test/generation_handler_test.dart` — all tests pass
5. Manual: start Dart server, load web UI, verify:
   - Loading overlay appears then clears
   - Connection status pill works (Online/Offline/Reconnecting)
   - SQL highlighting works
   - FAB menu opens/closes
   - Table definition toggle works
