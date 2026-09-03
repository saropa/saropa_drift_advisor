# Fix 081 — localStorage verdict persistence

The icon font fallback shipped in `2df5ac70` (bug 081 concern 5) added an inline
`<head>` script that reads `localStorage('drift-viewer-icons-available')` to seed
`icons-unavailable` on first paint, but the write side was never implemented —
`initIconFontFallback()` computed a verdict every load and discarded it. The
feature was dead code and the comment in `html_content.dart` falsely claimed both
a shared constant (`ICON_STATE_KEY`) and a regression test existed.

## Finish Report (2026-09-03)

**What changed:**

- `assets/web/toolbar.ts`: Added `ICON_STATE_KEY` export constant holding the
  localStorage key literal. Added `localStorage.setItem()` call inside the
  `apply()` closure in `initIconFontFallback()`, wrapped in try/catch for
  restricted webview contexts.

- `lib/src/server/html_content.dart`: Corrected the comment to accurately
  describe the write path (`apply()` in `initIconFontFallback()`).

- `assets/web/bundle.js`: Rebuilt — now contains both the constant and the
  `setItem` call.

- `assets/web/test/icon-font-fallback.test.mjs`: Added localStorage stub to
  `makeDocument()`, updated `runFallback()`/`runTimeout()` to accept a storage
  parameter. Added three new test cases: parity assertion (reads the Dart source
  and verifies the key literal matches `ICON_STATE_KEY`), verdict persistence
  (`'1'` for available, `'0'` for missing), and graceful degradation when
  localStorage is unavailable.

- `CHANGELOG.md`: Added maintenance entry.

**Hardening (reflection gate):**

- `assets/web/test/icon-font-fallback.test.mjs`: Parity test now resolves the
  Dart path from `git rev-parse --show-toplevel` instead of fragile relative
  `../../..` navigation. Added a second parity assertion that `toolbar.ts`
  actually contains a `localStorage.setItem(ICON_STATE_KEY` call — catches
  removal of the write side even when the key name still matches. Added a
  `QuotaExceededError` test for localStorage.setItem throwing.

- `scripts/check_icon_state_key_parity.py`: New pre-commit gate script. Reads
  both `toolbar.ts` and `html_content.dart`, extracts the localStorage key from
  each via regex, and fails if they diverge.

- `.husky/pre-commit`: Gate 7 added — runs `check_icon_state_key_parity.py`
  when either `toolbar.ts` or `html_content.dart` is staged.

**Tests:** 373 web tests pass (35 new across the file), 32 Dart `html_content`
tests pass, 181 Dart tests across 5 modified test files pass.

**Scope:** Bug 081 localStorage persistence fix + pre-commit Gate 7 + test
description convention renames across 6 Dart test files (cosmetic, no assertion
changes).
