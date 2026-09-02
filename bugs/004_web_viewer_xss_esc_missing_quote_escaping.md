# BUG: Web viewer `esc()` does not escape quotes — database values injected into HTML attributes can break out (XSS)

**Status: Open**

Created: 2026-09-02
Component: Server (web viewer bundle, `assets/web/`)
File: `assets/web/utils.ts` (line 7), `assets/web/table-view.ts` (lines 274, 282, 299), + 14 other modules
Severity: Security (XSS) / Wrong rendering — High

---

## Summary

`esc()` — the web viewer's only general-purpose HTML escaper — escapes `&`, `<`, `>` but **not** `"` or `'`. It is called ~325 times across `assets/web/`, and many of those calls sit inside **HTML attribute values** that carry database-supplied strings (cell values, table names, column names, captured SQL, server error text). A value containing a double quote terminates the attribute early, so the remainder of the value is parsed as new attributes — i.e. `onmouseover=` / `onerror=` injection. The browser-served viewer ships no CSP, so an injected handler executes.

The repo already contains a correct escaper on the extension side (`escapeHtml` in `extension/src/shared-utils.ts`, whose own doc comment calls it "The single canonical HTML escaper"), which does escape `"` and `'`. The web viewer is the outlier.

---

## Attribution Evidence

Positive — the unsafe escaper and every call site live in this repo:

```bash
grep -rn -A6 "export function esc" assets/web/utils.ts
```

```
assets/web/utils.ts:7:export function esc(s: unknown): string {
assets/web/utils.ts-8-  if (s == null) return '';
assets/web/utils.ts-9-  const d = document.createElement('div');
assets/web/utils.ts-10-  d.textContent = String(s);
assets/web/utils.ts-11-  return d.innerHTML;
assets/web/utils.ts-12-}
```

`div.textContent = x; div.innerHTML` runs the HTML fragment-serialization algorithm over a **text node**, which escapes only `&`, U+00A0, `<`, `>`. Quote escaping is applied by that algorithm only when serializing **attribute** values — never text nodes. So `esc('a"b')` returns `a"b` verbatim.

The contrasting, correct escaper in the same repo:

```bash
grep -rn -A9 "export function escapeHtml" extension/src/shared-utils.ts
```

```
extension/src/shared-utils.ts:119:export function escapeHtml(value: unknown): string {
extension/src/shared-utils.ts-120-  const s = value === null || value === undefined ? '' : String(value);
extension/src/shared-utils.ts-121-  return s
extension/src/shared-utils.ts-122-    .replace(/&/g, '&amp;')
extension/src/shared-utils.ts-123-    .replace(/</g, '&lt;')
extension/src/shared-utils.ts-124-    .replace(/>/g, '&gt;')
extension/src/shared-utils.ts-125-    .replace(/"/g, '&quot;')
extension/src/shared-utils.ts-126-    .replace(/'/g, '&#39;');
extension/src/shared-utils.ts-127-}
```

Attribute-context call sites carrying **database cell values** (the exploitable ones):

```bash
grep -n 'data-raw="\|data-value="\|rawTitle' assets/web/table-view.ts
```

```
274:          cellContent = '<span title="' + esc(vt('viewer.table.grid.rawTitle', fmt.raw)) + '">' + esc(fmt.formatted) + '</span>'
282:      var copyBtn = '<button type="button" class="cell-copy-btn" data-raw="' + esc(displayStr) + '" title="' + esc(vt('viewer.table.grid.copyValueTitle')) + '">&#x2398;</button>';
299:        html += 'data-value="' + esc(rawStr) + '">' ;
```

`displayStr`, `rawStr` and `fmt.raw` are raw cell values returned by `GET /api/table/{name}`.

Modules that put `esc()` inside a quoted attribute (15 files):

```bash
grep -rlE '(="\$\{esc\()|(="'"'"' \+ esc\()' assets/web/*.ts
```

```
assets/web/diagram.ts
assets/web/fk-nav.ts
assets/web/heartbeat-cards.ts
assets/web/history-sidebar.ts
assets/web/performance.ts
assets/web/query-builder-multi.ts
assets/web/query-builder.ts
assets/web/schema-explorer.ts
assets/web/sql-history.ts
assets/web/sql-runner.ts
assets/web/table-list.ts
assets/web/table-view.ts
assets/web/tools-analytics.ts
assets/web/tools-compare.ts
assets/web/tools-import.ts
```

Other notable sinks taking DB- or server-controlled text:

- `assets/web/performance.ts:94`, `:115`, `:140` — `title="' + esc(sql) + '"`. **Any** SQL using a double-quoted identifier (`SELECT * FROM "my table"`) already breaks this attribute today, with no malice required.
- `assets/web/history-sidebar.ts:313` — `title="' + esc(e.error) + '"` (server error text).
- `assets/web/heartbeat-cards.ts:67` — `title="' + esc(t.table) + '"` (table name).
- `assets/web/schema-explorer.ts:206` — `data-table="' + esc(name) + '"`.
- `assets/web/query-builder-multi.ts:253` — `value="${esc(valDisplay)}"` (user filter value).
- `assets/web/diagram.ts:222` — `data-table="' + name + '"` where `name = esc(t.name)`.

Negative attribution — the escaper is not inherited from a sibling package:

```bash
grep -rn "function esc(" ../saropa_lints/lib/ ../saropa_dart_utils/lib/
# Expected: 0 matches (both are Dart packages; no JS escaper exists there)
```

**Emit site(s):** `assets/web/utils.ts:7` (definition); attribute-position uses across the 15 files listed above.
**Diagnostic `source` / `owner`:** n/a — runtime rendering defect, not a diagnostic.

---

## Environment

- OS: any
- Browser: any (Chrome / Firefox / Edge)
- VS Code version: n/a for the browser surface (panel surface is protected by CSP — see below)
- Extension version: 4.2.5
- Dart SDK version: as pinned by `pubspec.yaml` (`environment.sdk`)
- Flutter SDK version: any (example app)
- Database type and version: SQLite via Drift 2.31
- Connection method: browser at `http://127.0.0.1:8642` served by `DriftDebugServer`
- Relevant non-default settings: none required
- Other potentially conflicting extensions: none

---

## Steps to Reproduce

1. Start from a clean state: run the example app (`python scripts/run_example.py`) so the debug server binds port 8642.
2. Open `http://127.0.0.1:8642` in a browser and enter the example auth token when prompted.
3. Click the **SQL** tab in the sidebar (mouse click, not the command palette) and run, via the **Run** button:

   ```sql
   CREATE TABLE xss_demo (id INTEGER PRIMARY KEY, note TEXT);
   ```

   then

   ```sql
   INSERT INTO xss_demo (note) VALUES ('" onmouseover="document.title=''PWNED''" x="');
   ```

   (The example app passes `writeQuery:`, so DDL/DML is permitted.)
4. Click **xss_demo** in the Tables sidebar to load the data grid.
5. Move the mouse over the copy button in the `note` cell.

Not intermittent — reproduces every time.

---

## Expected Behavior

The cell shows the literal text `" onmouseover="document.title='PWNED'" x="`, and the copy button's `data-raw` attribute holds that exact string. Copying the cell yields the original value. Nothing executes.

---

## Actual Behavior

`buildDataTableHtml` (`assets/web/table-view.ts:282`) emits:

```html
<button type="button" class="cell-copy-btn" data-raw="" onmouseover="document.title='PWNED'" x="" title="Copy value">&#x2398;</button>
```

The `"` in the cell value closed `data-raw`, and `onmouseover=` became a real event-handler attribute. Hovering executes the injected script in the viewer origin. The copy button also copies the wrong (truncated) value.

---

## Error Output

### VS Code Developer Tools Console

n/a — the browser surface is the affected one.

### Browser Console

Nothing. Malformed attributes are silently accepted by the HTML parser; there is no error, warning, or exception. That silence is why this has gone unnoticed.

### Extension Output Channel

Nothing — the Dart server returns valid JSON; the defect is purely client-side rendering.

### Stack Traces

None — no exception is thrown.

---

## Duplicate-Emission Check

Three escapers exist for the same job in one repository; two of the three are safe and the one the viewer uses everywhere is not:

| Escaper | File | Escapes | Attribute-safe |
|---|---|---|---|
| `esc` | `assets/web/utils.ts:7` | `& < >` | **No** |
| `esc` | `assets/web/sql-highlight.ts:7` | `& < > "` | Yes |
| `escapeHtml` | `extension/src/shared-utils.ts:119` | `& < > " '` | Yes |

Both `assets/web` escapers are bundled into the same `assets/web/bundle.js`; the viewer imports the unsafe one everywhere except SQL syntax highlighting.

---

## Screenshots / Recordings

Not attached — the DOM excerpt in **Actual Behavior** is the evidence; it can be read directly in the browser's Elements panel by inspecting the `note` cell.

---

## Minimal Reproducible Example

The rendering corruption needs no attacker at all — a plain quoted SQL identifier is enough:

1. SQL tab → run `SELECT 1 AS "a""b"`.
2. Open **Session → Performance**, click **Refresh**.
3. `assets/web/performance.ts:94` builds `title="SELECT 1 AS "a""b""`; the tooltip is truncated at the first inner quote and stray text leaks into the `<td>` start tag.

---

## What I Already Tried

- [x] Read the source — traced `esc()` from definition to every attribute sink.
- [x] Compared against the extension's canonical escaper — confirmed the character-set gap.
- [x] Confirmed the same `bundle.js` is CSP-protected in the panel and unprotected in the browser.
- [ ] Restarted VS Code — not applicable; defect is deterministic and in source.

---

## Regression Info

- Last working version: none — `esc()` has used the `textContent`/`innerHTML` round-trip since the module was extracted from `app.js`.
- First broken version: present in 4.2.5 (current).
- What changed: n/a — this is a latent defect, not a regression.

---

## Root Cause

`esc()` was written as a **text-node** escaper (the `textContent` → `innerHTML` round-trip) but is used in both text **and** attribute positions. The HTML serialization algorithm never escapes quotes in text nodes, so every attribute sink is unprotected.

---

## Aggravating Factor: no CSP on the browser surface

`HtmlContent.buildIndexHtml()` emits a `<head>` containing charset, viewport, title, preconnects, font stylesheets and the inline `<style>` — and **no** `<meta http-equiv="Content-Security-Policy">`:

```bash
grep -rn "Content-Security-Policy" lib/
# Expected: 0 matches

grep -rn "Content-Security-Policy" extension/src/webview-csp.ts
# extension/src/webview-csp.ts:102:    `<meta http-equiv="Content-Security-Policy" content="${buildWebviewCsp(nonce, opts)}">`
```

The identical bundle is CSP-hardened with a per-render nonce when hosted in the VS Code panel and completely unprotected when served by the Dart server to a browser. An injected inline handler is blocked in one host and executes in the other.

For contrast, `lib/src/server/report_html.dart:6-14` documents the correct posture for the portable report — "every value the database supplied … is embedded ONLY inside a single JSON island and rendered into the DOM with `textContent` (never `innerHTML`) … XSS-safe by construction". The project already holds this bar on the Dart side; the web viewer does not.

---

## Changes Made

<!-- Fill in when a fix is written. -->

---

## Commits

<!-- Add commit hashes as fixes land. -->

---

## Impact

- **Who is affected:** every user of the browser-served web viewer, plus anyone whose database contains a `"` in a rendered cell, table name, column name, or captured SQL.
- **What is blocked:** correct rendering of ordinary data — quoted SQL identifiers already corrupt tooltips and the copy-button payload today.
- **Data risk:** high. The viewer origin holds `DRIFT_VIEWER_AUTH_TOKEN` (`assets/web/state.ts:11`) and can reach every write endpoint (`/api/sql`, `/api/cell/update`, `/api/import`, `/api/edits/apply`) and `/api/dump` (full database download). A poisoned row in a development database — seeded from a production export or a third-party sync — becomes stored XSS against the developer's machine.
- **Frequency:** the corruption path (any `"` in data) is common; the code-execution path requires attacker-influenced row content.

---

## Fix Sketch

1. Replace `assets/web/utils.ts:7` with an escaper safe in both contexts. This is strictly a superset of current behavior, so no text-position call site regresses:

   ```ts
   /**
    * HTML-escape for BOTH text and attribute contexts.
    *
    * BUG FIX: the previous textContent -> innerHTML round-trip escaped only
    * & < > — the HTML serializer never escapes quotes inside a text node — so
    * any value containing a double quote broke out of `attr="..."` and the rest
    * of the value was parsed as further attributes (event-handler injection).
    * Escaping the quotes explicitly closes that hole for all ~325 call sites at
    * once, rather than auditing each sink for text-vs-attribute position.
    */
   export function esc(s: unknown): string {
     if (s == null) return '';
     return String(s)
       .replace(/&/g, '&amp;')
       .replace(/</g, '&lt;')
       .replace(/>/g, '&gt;')
       .replace(/"/g, '&quot;')
       .replace(/'/g, '&#39;');
   }
   ```

2. Add `assets/web/test/esc.test.mjs` asserting `esc('" onmouseover="x')` contains no bare `"`, and a round-trip test that a table named `a"b` survives `getAttribute('data-table')` in `diagram.ts` / `schema-explorer.ts`.
3. Emit a CSP `<meta>` from `HtmlContent.buildIndexHtml` so the browser surface is at least as hardened as the panel. The inlined bundle and the `window.__SDA_L10N` injection are inline scripts, so a per-response nonce is preferable to `'unsafe-inline'`; the font `<link>`s require `style-src`/`font-src` allowances for `fonts.googleapis.com` / `fonts.gstatic.com`, and the CDN fallback path requires `script-src https://cdn.jsdelivr.net`.
4. Rebuild `assets/web/bundle.js` (`npm run build:js`) — the committed bundle is what ships. Note that no gate currently enforces that rebuild; see `bugs/015_infra_bundle_js_has_no_staleness_gate.md`.
5. The regression test is worthless unless it runs; see `bugs/016_infra_web_typecheck_and_tests_never_gated.md`.
