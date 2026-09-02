# Finish Report — Fixes 003–010 Batch

## Finish Report (2026-09-02)

Eight bugs from the project-review audit were fixed across the Dart server
(`lib/src/server/`) and VS Code extension (`extension/src/editing/`). Fixes
004–006, 008, and 010 were landed in prior sessions; fixes 003, 007, and 009
were coded and verified in this session.

### Fixes applied this session

**Fix 003 — CSRF gates on two missed POST endpoints.**
`router.dart` lacked `_rejectNonJsonBody()` calls on `POST /api/session/{id}/annotate`
and `POST /api/dvr/config`. Both now reject non-JSON bodies with 415 before the
handler runs. Additionally, `session_handler.dart handleSessionAnnotate` silently
fell back to an empty map (`?? <String, dynamic>{}`) when the JSON body was
unparseable — replaced with an explicit 400 response using
`ServerConstants.jsonKeyError` / `ServerConstants.errorInvalidJson`.

**Fix 007 — Int64 warning surfaced on single-cell edit.**
`editing-bridge.ts _handleCellEdit` stored the edit via `addCellChange` but
never checked `result.warning`. A value beyond `Number.MAX_SAFE_INTEGER` was
stored correctly (as `RawIntegerLiteral`) but the user received no notification.
Now mirrors the `_handleRowInsert` pattern: `if (result.warning) showWarningMessage()`.

**Fix 009 — Empty-string PK rejection after coercion.**
`sqlite-cell-value.ts validateRowInsert` checked `hasOwnProperty` to catch
missing PK values, but an empty string passes that check. `parseCellEditForColumn`
then coerces `""` to `null` for nullable columns, reproducing the original NULL
PK bug. Added a post-coercion guard: `if (col.pk && !isRowidAlias && r.value === null)`
→ reject with "cannot be empty".

### Code review findings

- `session_handler.dart:162` used literal `'error'` key instead of
  `ServerConstants.jsonKeyError` — fixed to use the constant.
- `hamburger-menu.test.ts ruleBody()` failed because SCSS now emits
  comma-separated selector lists — fixed to handle both formats.
- `utils.ts:1176` hardcodes `'limit'`/`'offset'` query param names with no
  cross-language sync to `ServerConstants.queryParamLimit/queryParamOffset` —
  acknowledged as architectural; no code-gen mechanism exists to fix it today.

### Tests added

- `validateRowInsert rejects empty-string TEXT primary key that coerces to null`
- `validateRowInsert rejects whitespace-only TEXT primary key`
- `should surface int64 precision warning on cell edit`

### Test results

- `npx mocha`: 3151 passing, 0 failing
- `dart test`: 114 passing (session/integration/request-body tests)

### Bug archival

All eight bug files (`bugs/003_*.md` through `bugs/010_*.md`) archived to
`plans/history/2026.09/20260902/` with `Status: Fixed`. References in
`bugs/015_*.md` and `bugs/044_*.md` repointed to the new paths.

### Hardening pass (reflection gate)

**Integration tests for fix 003:** Two new tests in `handler_integration_test.dart`:
`POST /api/session/<id>/annotate rejects text/plain body` (415) and
`POST /api/session/<id>/annotate rejects malformed JSON` (400). Confirms both
the `_rejectNonJsonBody` gate and the new explicit 400 path.

**Font-probe timeout cleanup:** `toolbar.ts initIconFontFallback` now stores the
`setTimeout` id and calls `clearTimeout(fallbackTimer)` in both the resolve and
reject callbacks of `fonts.load()`, eliminating a no-op timer wakeup on every
page load where the promise settles before the 3 s deadline.

**Invariant comment:** `sqlite-cell-value.ts parseCellEditForColumn` now documents
that its `{ ok: true, value: null }` return for empty strings on nullable columns
is depended on by `validateRowInsert`'s post-coercion PK guard (bug 009).

**CI script:** `scripts/check_csrf_gate_coverage.py` scans every POST route in
`router.dart` and asserts a `_rejectNonJsonBody` call within 8 lines. Five
routes are exempted with documented reasons (SQL handler validates internally;
DVR start/stop/extend have no body). Prevents fix 003's class of bug from
recurring on new endpoints.
