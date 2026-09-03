# BUG: Tables view sends `?S.limit=…&S.offset=…` — the server reads `limit`/`offset`, so every page returns the first 200 rows

**Status: Fixed**

<!-- Status values: Open → Investigating → Fix Ready → Closed -->

Created: 2026-09-02
Component: Server (web viewer, `assets/web/`)
File: `assets/web/table-list.ts` (line 58); shipped in `assets/web/bundle.js` (line 6303)
Severity: Wrong behavior — High (core browse workflow; pagination controls are inert)

---

## Summary

The Tables view builds its data URL with the query-parameter names `S.limit` and `S.offset` — the JavaScript variable expressions were pasted into the string instead of the parameter names. The Dart server only reads `limit` and `offset`, so it ignores both, applies its defaults (limit 200, offset 0), and returns the same first 200 rows for every page. The pagination bar still updates its "Showing 201–400 of N" text from the client-side state, so the UI claims to page while the data never moves. Rows-per-page is equally inert. The Search tab constructs the same URL correctly, which is why the defect survived.

---

## Attribution Evidence

Positive — the client URL builder and the server parameter names both live in this repo:

```bash
grep -rn "S.limit=" assets/web/*.ts assets/web/bundle.js
```

```
assets/web/bundle.js:6303:    fetch("/api/table/" + encodeURIComponent(name) + "?S.limit=" + limit + "&S.offset=" + offset, authOpts()).then((r) => r.json()).then((data) => {
assets/web/table-list.ts:58:  fetch('/api/table/' + encodeURIComponent(name) + '?S.limit=' + S.limit + '&S.offset=' + S.offset, S.authOpts())
```

The server's parameter names:

```bash
grep -n "queryParamLimit\|queryParamOffset" lib/src/server/server_constants.dart lib/src/server/router.dart
```

```
lib/src/server/server_constants.dart:293:  static const String queryParamLimit = 'limit';
lib/src/server/server_constants.dart:294:  static const String queryParamOffset = 'offset';
lib/src/server/router.dart:648:        request.uri.queryParameters[ServerConstants.queryParamLimit],
```

The server never looks for `S.limit`:

```bash
grep -rn "S\.limit" lib/src/server/
# Expected: 0 matches
```

The correct construction already exists in the same client, on the Search tab:

```bash
grep -n "?limit=" assets/web/search-tab.ts
```

```
assets/web/search-tab.ts:232:    var dataFetch = fetch('/api/table/' + encodeURIComponent(tableName) + '?limit=' + stLimit + '&offset=' + stOffset, S.authOpts())
```

Negative attribution — the viewer is not inherited from a sibling package:

```bash
grep -rn "S.limit" ../saropa_lints/ ../saropa_dart_utils/
# Expected: 0 matches
```

**Emit site(s):** `assets/web/table-list.ts:58` (source), `assets/web/bundle.js:6303` (shipped bundle).

---

## Environment

- OS: any
- Browser: any
- VS Code version: also reproduces in the panel, which loads the same bundle
- Extension version: 4.2.5
- Dart SDK version: as pinned by `pubspec.yaml`
- Flutter SDK version: any
- Database type and version: SQLite via Drift
- Connection method: browser at `http://127.0.0.1:8642`
- Relevant non-default settings: none
- Other potentially conflicting extensions: none

---

## Steps to Reproduce

1. Start the example app so the server binds 8642, and open the viewer in a browser.
2. Open a table with more than 200 rows (the example seeder produces one).
3. Note the first row's primary key value.
4. In the pagination bar click **Next** (mouse).
5. Note the status text and the first row's primary key value.
6. Change **Rows per page** to **50**.

Reproduces on every attempt.

---

## Expected Behavior

Step 5 shows rows 201–400 with a different first primary key. Step 6 shows 50 rows.

---

## Actual Behavior

Step 5 status reads "Showing 201–400 of N" but the first row is unchanged and the grid holds the same 200 rows. Step 6 still shows 200 rows. The network tab shows every request as `/api/table/<name>?S.limit=…&S.offset=…`.

---

## Error Output

### VS Code Developer Tools Console

Nothing — the server accepts the request and silently applies defaults.

### Extension Output Channel

Nothing.

### Terminal / Command Output

```
curl -s "http://127.0.0.1:8642/api/table/contacts?S.limit=50&S.offset=200" | head -c 200
```

Returns the first 200 rows, not rows 201–250.

### Stack Traces

None.

---

## Duplicate-Emission Check

One source site, one bundle site. The Search tab (`search-tab.ts:232`) is correct and must not be changed.

---

## Screenshots / Recordings

Not attached — the network request URL is the reproduction artefact.

---

## Minimal Reproducible Example

```js
// Paste in the viewer console with any table open, then click Next.
const orig = window.fetch;
window.fetch = (u, o) => { console.log('fetch', u); return orig(u, o); };
```

Logs `fetch /api/table/<name>?S.limit=200&S.offset=200`.

---

## What I Already Tried

- [x] Confirmed the server reads `ServerConstants.queryParamLimit` / `queryParamOffset` (`router.dart:648-652`) and falls back to `defaultLimit` when absent.
- [x] Confirmed the bundle carries the defect, so it is shipped, not a source-only regression.
- [x] Confirmed `search-tab.ts` builds the URL correctly, so the fix is a one-line alignment.

---

## Regression Info

- Last working version: unknown. The `S.` prefix is the state-module namespace introduced during the TypeScript modularization; the string likely broke when `limit` was renamed to `S.limit` by find-and-replace inside the string literal.
- First broken version: present in 4.2.5.
- What changed: a rename of the variable was applied inside the URL string literal.

---

## Root Cause

A mechanical rename (`limit` → `S.limit`) was applied inside a string literal, turning the query-parameter name into the JavaScript expression text. The server ignores unknown parameters rather than rejecting them, and the pagination bar derives its status text from client state rather than from the response, so nothing surfaced the mismatch.

---

## Changes Made

- **`assets/web/utils.ts`** — added `buildTableDataUrl(name, limit, offset)`, a
  pure helper that returns `/api/table/<encoded name>?limit=<n>&offset=<n>`.
  The parameter names now exist in exactly one place in the client, matching
  `ServerConstants.queryParamLimit` / `queryParamOffset` on the Dart side. The
  doc comment records the original defect so the next mechanical rename does
  not walk back into the string literal.
- **`assets/web/table-list.ts`** — `loadTable()` no longer hand-builds the URL;
  it calls `buildTableDataUrl(name, S.limit, S.offset)`. This is the actual
  fix: the request now carries `limit`/`offset` instead of `S.limit`/`S.offset`,
  so the server honors the page size and offset rather than falling back to its
  defaults and returning the first 200 rows for every page. Import updated.
- **`assets/web/search-tab.ts`** — the Search tab's (already-correct) inline URL
  was switched to the same helper so the two call sites cannot diverge again.
  Import updated. No behavioral change here.
- **`assets/web/test/table-data-url.test.mjs`** (new) — regression test:
  esbuilds the real `utils.ts` and asserts the exact string
  `/api/table/x?limit=50&offset=200`, that `S.limit`/`S.offset` never appear,
  that the table name is URL-encoded, and that `offset=0` is still emitted. A
  source-level check also asserts both call sites go through the helper and
  that neither hand-builds a `?limit=` query string.

`assets/web/bundle.js` is generated and was deliberately left untouched; it
must be rebuilt (`npm run build:js`) before the fix ships.

---

## Commits

<!-- Add commit hashes as fixes land. -->

---

## Impact

- **Who is affected:** every user browsing a table larger than 200 rows in the Tables view. That is the tool's primary job.
- **What is blocked:** seeing any row past the first 200 without writing SQL by hand.
- **Data risk:** none directly, but a user inspecting "page 3" is looking at page 1 and may draw wrong conclusions.
- **Frequency:** every page change and every rows-per-page change.

---

## Fix Sketch

1. `assets/web/table-list.ts:58` — change the two parameter names, and comment why:

   ```ts
   // Parameter names must be the server's `limit`/`offset`
   // (ServerConstants.queryParamLimit/Offset). A rename of the state
   // variable to S.limit was once applied inside this string, which sent
   // `?S.limit=` — the server ignored it and served page 1 for every page.
   fetch('/api/table/' + encodeURIComponent(name) + '?limit=' + S.limit + '&offset=' + S.offset, S.authOpts())
   ```

2. Extract the URL construction into a DOM-free helper (e.g. `buildTableDataUrl(name, limit, offset)` in a small module), use it from both `table-list.ts` and `search-tab.ts:232`, and add `assets/web/test/table-data-url.test.mjs` asserting the exact string `/api/table/x?limit=50&offset=200`. One source of truth prevents the two call sites from diverging again.
3. Rebuild the bundle (`npm run build:js`) and commit `assets/web/bundle.js` — the bundle is committed and does not rebuild on its own (see `bugs/015_infra_bundle_js_has_no_staleness_gate.md`).
4. Run `npm run test:web`.
5. CHANGELOG `### Fixed` entry: "Table pagination now actually pages…" referencing this file.


---

## Finish Report (2026-09-02)

Closed as part of a five-bug web-viewer batch (080-084). Consolidated record, including the
cross-cutting verification and the code-review round that followed the first pass:
`plans/history/2026.09/20260902/080-084-web-viewer-batch-report.md`.

### Verification applied to this fix

- `npm run build` — `bundle.js` and `style.css` regenerated from source; no generated file was
  hand-edited at any point.
- `npm run typecheck:web` — exit 0.
- `npm run test:web` — 338 tests, 338 pass, 0 fail.
- Extension mocha, full suite — 3151 passing, 0 failing. An earlier revision of this report
  described this run as "scoped to the 14 specs that assert on the changed sources". It was not
  scoped. `extension/.mocharc.yml` sets `spec: out/test/**/*.test.js`, and mocha *merges* CLI file
  arguments (and `--spec`) with that key rather than overriding it, so naming files on the command
  line ran the whole suite. The full suite passing is a stronger result than a scoped run, only a
  differently-described one.
- Extension mocha, genuinely scoped to the 15 specs that reference the changed web sources
  (`--no-config --no-package --require test/register-mock.js --timeout 5000`) — 303 passing,
  0 failing.
- `dart test test/html_content_test.dart test/web_viewer_nl_modal_contract_test.dart` — 41 passing.

### Defect and resolution

The Tables view built its request URL with the parameter names `S.limit` and `S.offset` — the
JavaScript variable expressions had been pasted in place of the parameter names. The Dart server
reads `limit` and `offset`, so it ignored both, applied its defaults, and returned the first 200
rows for every page while the pagination bar reported movement from client-side state.

Both call sites now build the URL through a single `buildTableDataUrl()` helper in `utils.ts`, so
the two cannot diverge again. The server clamps `limit` to `maxLimit` (1000), which matches the
UI's largest page-size option, so correcting the names opened no new blast radius.
