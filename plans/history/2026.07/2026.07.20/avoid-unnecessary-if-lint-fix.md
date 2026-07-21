# Fix `avoid_unnecessary_if` lint in `AnomalySuppression.matches`

The `avoid_unnecessary_if` lint rule flagged `AnomalySuppression.matches()` in
`lib/src/server/server_types.dart` at line 220. The method used a trailing
`if (type != null && type != anomaly['type']) return false; return true;`
guard-clause pair that is logically equivalent to a single boolean return.

## What changed

- **`lib/src/server/server_types.dart`** — Replaced the two-line guard
  (`if … return false; return true;`) with `return type == null || type == anomaly['type'];`.
  Semantically identical via De Morgan's law; satisfies the lint.

- **`CHANGELOG.md`** — Added `[Unreleased]` section with a Maintenance entry.

## Finish Report (2026-07-20)

**Scope:** Dart library code only (Scope A). Single method body change — no new
behavior, no API surface change, no user-facing impact.

**Testing:** Five existing `AnomalySuppression` test cases in
`test/anomaly_detector_test.dart` (lines 1699, 1733, 1782, 1815, 1839) exercise
table-only, column-match, type-match, wildcard, and non-matching scenarios. All
cover the rewritten code path. No assertions broken.

**Risk:** Negligible. Pure logic-preserving refactor of a three-line method body.
