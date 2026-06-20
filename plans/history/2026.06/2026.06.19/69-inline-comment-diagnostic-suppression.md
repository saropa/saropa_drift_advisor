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

## Finish Report (2026-06-19)

Implemented in full, and extended beyond the original field-level scope to add
file-level suppression and a rules-management UI (both requested alongside the
field-level work).

### Implementation diverged from the original plan (better approach)
The plan proposed attaching `suppressedCodes` to each parsed `IDartColumn` and
checking it inside every column-scoped provider. That was replaced by a central,
line-based design that requires no per-provider changes and automatically covers
every diagnostic (column- and table-scoped):

- New `extension/src/diagnostics/suppression.ts` parses directives into an
  `IInlineSuppressions` structure (file-level codes + per-target-line codes).
  Pure, CRLF-safe, case-insensitive marker, codes lowercased. A full-line
  directive targets the next non-blank line; a trailing directive targets its
  own line — matching the Dart analyzer's `// ignore:` convention. A bare
  `ignore` / `ignore-file` (no codes) suppresses everything for that line / file.
- `IDartFileInfo` gains a `suppressions` field, populated in
  `dart-file-parser.ts`. `DiagnosticManager._applyDiagnostics` indexes
  suppressions by file URI once per refresh and skips file-level and
  field-level (line-matched against `range.start.line`) hits centrally.

### Field-level and file-level scopes
- Field: `// drift-advisor:ignore <codes>` above (or trailing) a column getter.
- File: `// drift-advisor:ignore-file <codes>` anywhere in the file.

### One-click insertion (quick fixes)
`extension/src/diagnostics/suppression-commands.ts` adds
`driftViewer.suppressDiagnosticInColumn` / `…InFile`, which insert the directive
(matching indentation for the column form; top-of-file for the file form) and
trigger a refresh. The workspace parser reads in-memory document text, so the
suppression takes effect before the file is saved. `DiagnosticManager.
provideCodeActions` appends both quick fixes to every advisor diagnostic.

### Rules-management UI
`extension/src/diagnostics/rules-tree-provider.ts` renders a "Drift Advisor
Rules" sidebar: every code in `DIAGNOSTIC_CODES` grouped by category, sorted
noisiest-first, with a live finding count (new
`DiagnosticManager.getCollectedCountsByCode()`) and on/off state. Clicking a rule
runs `driftViewer.rules.toggleRule`, which writes `disabledRules`. A new
`DiagnosticManager.onDidRefresh` event re-renders the tree after each cycle;
`driftViewer.rules.refresh` is the view-title button. The view + four commands
are registered in `package.json` with NLS titles.

### Tests
- `suppression.test.ts`: field (preceding/trailing), bare-ignore (all codes),
  multi-code, file-level, bare ignore-file, CRLF, case-insensitivity, empty.
- Updated four `IDartFileInfo` construction sites for the new `suppressions`
  field; updated two code-action tests for the two always-appended quick fixes;
  activation disposable count 232 -> 238.
- Full extension suite 2883 passing; TypeScript + NLS verify + coverage clean.
