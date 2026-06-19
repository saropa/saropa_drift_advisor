# 69 — Inline `// drift-advisor:ignore` source-comment suppression

Extracted from plan 68 (per-column suppression). Plan 68 shipped settings-based
per-column suppression (`columnExclusions`) and the 100%-NULL / unused-column
split; this remaining phase adds the in-source escape hatch and is tracked
separately so the open item is not buried in a closed plan.

## Goal

Let a Drift column getter carry a suppression directive in source, traveling
with the code instead of living in a central settings file:

```dart
// drift-advisor:ignore high-null-rate
TextColumn get middleName => text().nullable()();
```

Use a **dedicated** marker, NOT Dart's `// ignore:` — that directive belongs to
the Dart analyzer's own lint codes; reusing it would make the analyzer warn
about an unknown lint and conflate two systems. Support
`// drift-advisor:ignore-all` to suppress every advisor code on that column.

## Why this is the harder path (and was deferred)

The advisor's column-scoped diagnostics are computed from live DB metadata, not
from the Dart source — so the directive only works for diagnostics that map back
to a parsed Dart column. DB-only / runtime diagnostics cannot be inline-
suppressed; those stay on the settings path (`columnExclusions`,
`tableExclusions`, `disabledRules`).

## Changes

1. **dart-schema.ts** — add `suppressedCodes: string[]` to `IDartColumn`
   ([dart-schema.ts:12-27](../extension/src/schema-diff/dart-schema.ts#L12-L27)).
2. **dart-parser.ts** — `parseColumn` already receives the getter's builder
   chain + line offset
   ([dart-parser.ts:84-107](../extension/src/schema-diff/dart-parser.ts#L84-L107)).
   Capture the trailing same-line comment and the immediately-preceding line;
   match `/\/\/\s*drift-advisor:ignore(-all)?\s*([\w-]*(?:\s*,\s*[\w-]+)*)/` and
   store the codes (empty list + `-all` → suppress everything). Reuse the
   existing comment-awareness helper `isInsideComment` in this file.
3. **data-quality-provider.ts** (and any other column-scoped provider) — after
   resolving `dartCol`, skip the issue when
   `dartCol.suppressedCodes.includes(issue.code)` (or the `-all` sentinel). The
   provider already looks up `dartCol` for the line number, so the directive
   check is one line at the existing lookup.
4. **Tests** — parser test: a getter with the comment yields `suppressedCodes`;
   provider test: a high-null column with the directive emits no diagnostic.

## Verification

- A column annotated `// drift-advisor:ignore high-null-rate` produces no
  high-null-rate diagnostic, while a sibling column without the comment still
  reports.
- Targeted runs only: the dart-parser test and the data-quality provider test.
