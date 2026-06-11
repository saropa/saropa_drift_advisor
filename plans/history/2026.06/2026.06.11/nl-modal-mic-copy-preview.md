# Web viewer "Ask in English" modal — mic, copy, and preview-results

Triggered by user requests against the debug web viewer's Run SQL → "Ask in English…"
dialog: (1) "how can i surface a microphone talk button?", (2) "add a copy button
for the generated sql", (3) "add a preview button to extend the modal with a limited
set of results (top 10)". Three additive controls were built onto the existing NL→SQL
modal with no change to the existing convert/Use/Cancel behavior.

## Finish Report (2026-06-11)

**Reviewed by another AI.**

### Scope
- **(A)** Dart app code — `lib/src/server/html_content.dart` (modal markup served by the Dart package).
- Web viewer front-end (TypeScript/SCSS bundled into the Dart package via esbuild/sass): `assets/web/nl-modal.ts`, `assets/web/_sql-editor.scss`, regenerated `assets/web/bundle.js` + `assets/web/style.css`.
- Dart test: `test/web_viewer_nl_modal_contract_test.dart`.
- NOT the VS Code extension (`extension/`). The web viewer TS is part of the Dart package, not the extension bundle.

### What changed

**1. Microphone dictation (`nl-mic`)**
- Web Speech API (`window.SpeechRecognition || webkitSpeechRecognition`), no dependency, no bundle addition.
- Button ships `hidden` in markup; JS un-hides it only when the API exists (Firefox has no support → stays hidden, never a dead control).
- Lazy single recognizer reused across sessions; `toggleNlMic()` starts/stops; transcript appends to `nl-modal-input` (separating space) then calls the existing `scheduleNlLivePreview()` so the SQL preview updates as if typed.
- `.recording` state adds an accent pulse + swaps icon `mic` → `mic_off` (state reads without color alone).
- `onerror` routes `not-allowed` / `service-not-allowed` / `no-speech` to the modal's own `setNlModalError`.
- `closeNlModal()` calls `stopNlMic()` (uses `abort()`, not `stop()`, so a late transcript never writes into a hidden box) — mic never outlives the dialog.

**2. Copy generated SQL (`nl-copy`)**
- Icon button on a new label row above the SQL preview; copies the preview SQL to the clipboard without touching the main editor (distinct from Use, which overwrites + closes).
- `navigator.clipboard.writeText` with an `execCommand('copy')` fallback for non-secure (http) contexts.
- Brief confirmation: icon → `check` + `.copied` accent for ~1.1s.

**3. Preview results (`nl-preview-run` + `nl-modal-results`)**
- Runs the generated SQL against the live DB via the same `POST /api/sql` endpoint the main runner uses, capped to 10 rows.
- Row cap via subquery wrapper `SELECT * FROM (\n<inner>\n) LIMIT 10` (trailing `;` stripped) — avoids parsing/rewriting an inner LIMIT/ORDER BY/aggregate; `SELECT *` preserves inner column names.
- Renders a compact, scroll-capped table in a `hidden`-by-default container; every key/value escaped via `esc()` (matches `sql-runner.ts`).
- Server errors surface in the modal error line, not the results box. Busy state via `setButtonBusy`.
- Sample auto-clears on question change (top of `applyNlLivePreview`) and on close, so it never shows rows for SQL that no longer matches the preview.

**Refactor:** the mic's button styling was generalized into a shared `.nl-icon-btn` base class so mic + copy stay visually consistent; `.nl-mic.recording` and `.nl-copy.copied` are the only per-button states.

### Known characteristic (surfaced to user, accepted for a debug tool)
- Preview executes the real query server-side; SQLite does not always push the outer `LIMIT 10` into an aggregating/sorting subquery, so a heavy inner query fully executes before the result is trimmed. Acceptable for a local debug viewer.
- Chromium streams mic audio to the browser vendor's speech service (the browser's pipeline, not the viewer). Noted in the button `title` and CHANGELOG.

### Tests
- Audited `test/` for every changed symbol (`nl-modal`, `nl-mic`, `nl-copy`, `nl-preview`, `previewNlResults`, `copyNlSql`, `nlToSql`, `bundle.js`, `html_content`): only `web_viewer_nl_modal_contract_test.dart` references them.
- Extended that contract test with two new groups: mic markup/wiring, and copy + preview controls/wiring (markup IDs, hidden-by-default regex on `nl-mic` and `nl-modal-results`, bundle function presence, SCSS hooks).
- `dart test` over the 6 html/bundle-touching test files (`web_viewer_nl_modal_contract_test`, `handler_integration_test`, `web_viewer_table_definition_test`, `web_app_size_tab_contract_test`, `html_content_test`, `generation_handler_test`) — **135 passed**.
- `npm run build` (esbuild + sass) clean; `npm run typecheck:web` (tsc) clean; `dart analyze` on changed Dart files — **no issues**.

### l10n
- SKIPPED [A scope is the Dart web viewer, not the Flutter app]. The web viewer has no ARB pipeline; user-facing strings live inline in the served HTML / TS by existing project convention (same as all sibling modal copy). American English verified (no banned spellings).

### Files changed
- `lib/src/server/html_content.dart` — mic + copy buttons, label rows, results container, preview-run button.
- `assets/web/nl-modal.ts` — speech recognition, copy, preview-run, render + clear helpers, listener wiring, import of `esc`/`setButtonBusy`.
- `assets/web/_sql-editor.scss` — `.nl-icon-btn` base, `.nl-mic.recording`, `.nl-copy.copied`, `.nl-modal-results`.
- `assets/web/bundle.js`, `assets/web/style.css` — regenerated.
- `test/web_viewer_nl_modal_contract_test.dart` — new assertions.
- `CHANGELOG.md` — three `[Unreleased] › Added` entries.

### Outstanding
- None for these three features. On-device/browser manual verification of mic + clipboard + preview is the user's handoff below (browser-permission and live-DB behaviors can't be exercised by the Dart contract tests).
