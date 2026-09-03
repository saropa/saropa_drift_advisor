# BUG: `.nl-help-panel code` uses `var(--mono, …)` but the token is `--font-mono` — every Ask-panel example chip falls back to the generic monospace font

**Status: Fixed**

<!-- Status values: Open → Investigating → Fix Ready → Closed -->

Created: 2026-09-02
Component: Server (web viewer styles, `assets/web/`)
File: `assets/web/_sql-editor.scss` (line 667); generated into `assets/web/style.css`
Severity: Low (cosmetic, but a single-source-of-truth violation in the design system)

---

## Summary

The NL "Ask in English" help panel renders about forty `<code>` example chips. Their rule asks for `var(--mono, ui-monospace, monospace)`. No `--mono` custom property exists anywhere; the design-system token is `--font-mono` (`_base.scss:44`). CSS silently takes the fallback, so the chips render in the browser's generic monospace rather than the JetBrains Mono face every other code surface uses. It is invisible to any tooling because an unknown custom property with a fallback is valid CSS.

---

## Attribution Evidence

Positive — the rule and the token both live in this repo:

```bash
grep -rn "var(--mono" assets/web/*.scss
```

```
assets/web/_sql-editor.scss:667:  font-family: var(--mono, ui-monospace, monospace);
```

The token that exists:

```bash
grep -rn "\-\-font-mono:\|--mono:" assets/web/*.scss
```

```
assets/web/_base.scss:44:  --font-mono: "JetBrains Mono", ui-monospace, monospace;
```

The chips it affects (the `<code>` elements inside `#nl-help-panel`):

```bash
grep -c "<code>" lib/src/server/html_content.dart
```

Negative attribution — not a sibling package's stylesheet:

```bash
grep -rn "\-\-mono" ../saropa_lints/ ../saropa_dart_utils/
# Expected: 0 matches
```

**Emit site(s):** `assets/web/_sql-editor.scss:667` (source); the compiled rule in `assets/web/style.css`.

---

## Environment

- OS: any
- Browser: any
- VS Code version: also reproduces in the panel (same stylesheet)
- Extension version: 4.2.5
- Dart SDK version: as pinned by `pubspec.yaml`
- Flutter SDK version: any
- Database type and version: n/a
- Connection method: browser at `http://127.0.0.1:8642`
- Relevant non-default settings: none
- Other potentially conflicting extensions: none

---

## Steps to Reproduce

1. Open the viewer and click the **Ask** icon in the toolbar (mouse) to show the Ask panel in the sidebar.
2. Click the **ⓘ** (Show supported phrases) button at the panel's top-right.
3. Compare the typeface of a chip such as `how many contacts?` with the SQL preview textarea below it.

Reproduces on every attempt.

---

## Expected Behavior

Chips and the SQL preview share the same monospace face (JetBrains Mono when loaded, the same system fallback otherwise).

---

## Actual Behavior

Chips render in the browser's default monospace (Consolas / Menlo / DejaVu Sans Mono depending on OS); the SQL preview renders in JetBrains Mono. On Windows the mismatch is obvious at 0.8em.

---

## Error Output

### VS Code Developer Tools Console

Nothing.

### Extension Output Channel

Nothing.

### Terminal / Command Output

n/a.

### Stack Traces

None.

---

## Duplicate-Emission Check

Single rule. The same *class* of problem — code surfaces that miss the mono token entirely — exists at `_search.scss:2` (global `pre`), `_views-screen.scss:83` (`.views-detail-sql`), and `_data-table.scss:523` (`.cell-value-popup-content pre`), where no `font-family` is declared at all. Those are tracked in plan `plans/82-web-viewer-visual-system.md` task B7 rather than here, because they are omissions, not a typo.

---

## Screenshots / Recordings

Not attached.

---

## Minimal Reproducible Example

```js
// Viewer console, with the help panel open:
getComputedStyle(document.querySelector('#nl-help-panel code')).fontFamily
// → "ui-monospace, monospace"   (expected: "JetBrains Mono", ui-monospace, monospace)
```

---

## What I Already Tried

- [x] Grepped every SCSS partial for a `--mono` definition — none.
- [x] Confirmed `_history-sidebar.scss:72,172,327` use `var(--font-mono, 'Fira Code', monospace)` — correct token, though the `'Fira Code'` fallback names a font the app never loads and should be dropped in the same fix.

---

## Regression Info

- Last working version: never — the rule was written with the wrong name.
- First broken version: whichever release introduced the NL help cheat-sheet.
- What changed: nothing since; the fallback masked it.

---

## Root Cause

A custom-property name was typed from memory (`--mono`) instead of the defined token (`--font-mono`), and the presence of a fallback value made the rule valid CSS, so neither the Sass compiler nor the browser reported anything.

---

## Changes Made

- `assets/web/_sql-editor.scss:667` (`.nl-help-panel code`): `font-family: var(--mono, ui-monospace, monospace)` -> `font-family: var(--font-mono)`, with a comment recording the wrong token name, why it failed silently, and why the fallback is dropped (a future rename should fail loudly rather than degrade).
- `assets/web/_history-sidebar.scss:72,172,327`: dropped the phantom `'Fira Code'` fallback — `var(--font-mono, 'Fira Code', monospace)` -> `var(--font-mono)`. The app never loads Fira Code, and `--font-mono` already carries its own `ui-monospace, monospace` tail.
- Generated `assets/web/style.css` NOT edited here — it is rebuilt from SCSS by the build step.

### Repo-wide undefined-token sweep (all `assets/web/*.scss`)

Every `var(--x)` usage was cross-checked against every `--x:` declaration in the SCSS sources.

Fixed (unambiguous typo of an existing token):

- `--mono` -> `--font-mono` (the bug above). The only one of its kind.

Not fixed — undefined, but each is a deliberate literal fallback for a design-system token that does not exist yet, i.e. an omission to be resolved by plan `plans/82-web-viewer-visual-system.md`, not a typo. Guessing a substitute would change rendered colors:

- `--error` — `_history-sidebar.scss:119,374`, `_settings.scss:240,241,251` (two different fallbacks: `#e53e3e` and `#e15759`).
- `--warning` — `_masthead.scss:84`, `_heartbeat-screen.scss:22,270` (`#e67e22`).
- `--accent` — `_query-builder.scss:121`, falling back to `var(--link)`.
- `--bg-hover` — `_query-builder.scss:63`, `_schema-explorer.scss:77`.
- `--bg-secondary` — `_data-table.scss:294`.
- `--link-rgb` — `_settings.scss:107` (an RGB-triple companion to `--link` that was never defined).

Not a defect: `--app-sidebar-width` is undefined in SCSS by design — `sidebar-resize.ts:46` sets it on `#app-layout` at runtime, and `_layout.scss:35` documents the default. `--tab-accent`, `--hb-*`, `--read-heat`, `--write-heat` are all defined in theme partials.

---

## Commits

<!-- Add commit hashes as fixes land. -->

---

## Impact

- **Who is affected:** anyone opening the Ask help panel.
- **What is blocked:** nothing.
- **Data risk:** none.
- **Frequency:** every render of the help panel.

---

## Fix Sketch

1. `assets/web/_sql-editor.scss:667`:

   ```scss
   /* --font-mono is the design-system token (_base.scss). This rule once
      referenced a non-existent --mono and silently took the generic fallback,
      so the chips rendered in a different face from the SQL preview. */
   font-family: var(--font-mono);
   ```

2. Same commit: drop the phantom `'Fira Code'` fallback at `_history-sidebar.scss:72,172,327` → `var(--font-mono)`.
3. `npm run build:style`, commit `assets/web/style.css`.
4. Guard against recurrence: add a stylelint config (or a node test under `assets/web/test/`) that fails when a `var(--x)` references a custom property not defined in `_base.scss`/`_themes.scss`. Plan 82 task B1 introduces the lint; if it lands first, this bug closes with it.


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

`.nl-help-panel code` requested `var(--mono, ...)`. No `--mono` token has ever existed; the
design-system token is `--font-mono`. An unknown custom property with a fallback is valid CSS, so
nothing reported it and the chips silently rendered in the browser's generic monospace.

Corrected to `var(--font-mono)` with no fallback, so a future token rename fails visibly rather
than degrading silently. A sweep of every `var(--x)` against every declared token found three
further references to a `'Fira Code'` face the viewer never loads; those were removed. Six
genuinely undefined tokens (`--error`, `--warning`, `--accent`, `--bg-hover`, `--bg-secondary`,
`--link-rgb`) were left in place: each carries a deliberate literal fallback, and substituting a
guess would change rendered colors. They are a design-system gap, recorded here rather than fixed.
