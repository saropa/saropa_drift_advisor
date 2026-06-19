# 68 — Per-column & inline diagnostic suppression

## Problem

A column can be expected to be mostly NULL by design (e.g.
`harry_potter_characters.middle_name`, 94% NULL). Today the only ways to
silence the resulting `high-null-rate` warning are too broad:

- `disabledRules: ["high-null-rate"]` — kills the rule everywhere.
- `tableExclusions: { "high-null-rate": ["harry_potter_characters"] }` —
  silences the **whole table**, including columns that genuinely drift.
- `severityOverrides` — only downgrades severity, never silences.

There is no way to say "this one column is allowed to be 94% NULL" and no
inline (`// ignore:`-style) escape hatch. Drift Advisor does **not** read Dart
source comments for suppression — every check runs off live DB metadata.

This plan adds column-granular suppression two ways: a settings-based
`columnExclusions` map (Phase 1) and a source-comment directive (Phase 2).

## Current suppression flow (where the work lands)

- Config is read in
  [diagnostic-config.ts](../extension/src/diagnostics/diagnostic-config.ts):
  `disabledRules`, `tableExclusions`, `severityOverrides`,
  `categories`, `enabled`.
- Filtering is applied in `_applyDiagnostics`
  ([diagnostic-manager.ts:183-208](../extension/src/diagnostics/diagnostic-manager.ts#L183-L208)).
  Table exclusion matches `issue.data.tableName ?? issue.data.table`.
- `high-null-rate` issues already carry `data: { table, column, nullPct }`
  ([data-quality-provider.ts:178](../extension/src/diagnostics/providers/data-quality-provider.ts#L178)),
  so the column name is **already available** at the filter site — Phase 1 is
  a pure additive read + check.
- Dart columns are parsed in `parseColumn`
  ([dart-parser.ts:84-107](../extension/src/schema-diff/dart-parser.ts#L84-L107))
  from the builder-chain text + line offset, producing `IDartColumn`
  ([dart-schema.ts:12-27](../extension/src/schema-diff/dart-schema.ts#L12-L27)).
  This is where an inline comment directive would be captured.

## Phase 0 — split 100%-NULL ("unused column") from partial high-null (REQUIRED)

100% NULL means **no row ever sets the column** — a dead/unused column (or a
write path that never fires), which is a different finding from "mostly but not
entirely null." Today both collapse into one `high-null-rate` code at the 50%
threshold ([data-quality-provider.ts:166](../extension/src/diagnostics/providers/data-quality-provider.ts#L166)),
so you cannot tell them apart, tune them apart, or suppress them apart.

### Change
In `_checkHighNullRates`, branch on the rate:

- `nullPct === 100` (i.e. `nullCount === table.rowCount`) → new code
  **`unused-column`**, message `Column "{table}.{column}" is 100% NULL — no row
  sets a value (unused column)`.
- `HIGH_NULL_RATE_THRESHOLD <= nullPct < 100` → existing **`high-null-rate`**,
  message unchanged.

Both still carry `data: { table, column, nullPct }`, so they inherit the
column-level suppression from Phase 1/2 for free.

### Files
1. **data-quality-codes.ts** — register `unused-column` alongside
   `high-null-rate` ([data-quality-codes.ts:8-15](../extension/src/diagnostics/codes/data-quality-codes.ts#L8-L15)).
   Severity: Warning (an unused column is actionable — remove it, or fix the
   write path that should populate it). Distinct code means it gets its own
   `severityOverrides` / `disabledRules` / `tableExclusions` / `columnExclusions`
   entry.
2. **data-quality-provider.ts** — the rate branch above; emit the right code.
   Add a "Disable rule" code action here too (see gap below).
3. **package.json / docs** — document the new code.
4. **Tests** — extend
   [data-quality-provider.test.ts](../extension/src/test/data-quality-provider.test.ts):
   a 100%-null column emits `unused-column` (not `high-null-rate`); a 70%-null
   column still emits `high-null-rate`.

### Related gap — data-quality has no "Disable rule" lightbulb
Compliance/runtime/best-practice/naming providers offer a "Disable rule" quick
fix, but `DataQualityProvider.provideCodeActions`
([data-quality-provider.ts:63-99](../extension/src/diagnostics/providers/data-quality-provider.ts#L63-L99))
does not. Add the same `driftViewer.disableDiagnosticRule` action for
`high-null-rate`, `unused-column`, and `data-skew` so a user can disable from
the lightbulb instead of hand-editing settings. Pattern to copy:
[naming-provider.ts:46-53](../extension/src/diagnostics/providers/naming-provider.ts#L46-L53).

## Phase 1 — `columnExclusions` setting (recommended first; small, localized)

New setting, mirrors `tableExclusions` shape, keyed by `table.column`:

```json
"driftViewer.diagnostics.columnExclusions": {
  "high-null-rate": ["harry_potter_characters.middle_name"]
}
```

### Changes
1. **diagnostic-types.ts** — add `columnExclusions: Map<string, Set<string>>`
   to `IDiagnosticConfig`; default empty in `DEFAULT_DIAGNOSTIC_CONFIG`.
2. **diagnostic-config.ts** — parse `columnExclusions` exactly like
   `tableExclusions` (object of `code -> string[]`), build the map.
3. **diagnostic-manager.ts** — in `_applyDiagnostics`, after the table-exclusion
   block, add a column-exclusion block:
   - read `const col = issue.data?.column`
   - build key `${tableName}.${col}` and `continue` if the code's set has it.
   - Match on `tableName` already resolved from `data.tableName ?? data.table`.
4. **package.json** — register `driftViewer.diagnostics.columnExclusions`
   (type `object`, `additionalProperties: { type: array, items: string }`)
   with description + example.
5. **Tests** — extend
   [diagnostic-manager.test.ts](../extension/src/test/diagnostic-manager.test.ts):
   a `high-null-rate` issue on `t.col` is suppressed when `columnExclusions`
   lists `"t.col"`, and NOT suppressed for a sibling column `t.other`.

### Why a separate map, not overloading `tableExclusions`
Keeps the two semantics unambiguous (a bare `users` vs `users.email`). Matches
the existing pattern of distinct typed maps in the config object — extends the
inventory rather than splitting one list across two meanings.

### Applies to every column-scoped code, not just high-null-rate
Any issue whose `data` carries `column` (high-null-rate, and future
column-level checks) becomes column-suppressible for free.

## Phase 2 — inline source directive (the `// ignore:`-style ask)

A comment on the Drift column getter that travels with the code:

```dart
// drift-advisor:ignore high-null-rate
TextColumn get middleName => text().nullable()();
```

Use a **dedicated** marker, NOT Dart's `// ignore:` — that directive belongs to
the Dart analyzer's own lint codes; reusing it would make the analyzer warn
about an unknown lint and conflate two systems.

### Changes
1. **dart-schema.ts** — add `suppressedCodes: string[]` (or `Set<string>`) to
   `IDartColumn`.
2. **dart-parser.ts** — `parseColumn` already has the getter's line offset.
   Capture the trailing same-line comment and the immediately-preceding line;
   match `/\/\/\s*drift-advisor:ignore\s+([\w-]+(?:\s*,\s*[\w-]+)*)/` and store
   the codes. Reuse the existing comment-awareness helpers in this file
   (`isInsideComment`). Support `drift-advisor:ignore-all` to suppress every
   code on that column.
3. **data-quality-provider.ts** (and any other column-scoped provider) — after
   resolving `dartCol`, skip the issue when
   `dartCol.suppressedCodes.includes(issue.code)`. The provider already looks
   up `dartCol` for the line number
   ([data-quality-provider.ts:167-170](../extension/src/diagnostics/providers/data-quality-provider.ts#L167-L170)),
   so the directive check is one line at the existing lookup.
4. **Tests** — parser test: a getter with the comment yields
   `suppressedCodes`. Provider test: a high-null column with the directive
   emits no diagnostic.

### Trade-off
Inline lives next to the column and needs no central settings file, but only
works for diagnostics that map back to a parsed Dart column (DB-only / runtime
diagnostics can't be inline-suppressed — those stay on the settings path).

## Optional enhancement (not in scope unless requested)

`parseColumn` already detects `.nullable()`
([dart-parser.ts:103](../extension/src/schema-diff/dart-parser.ts#L103)). A
column declared `.nullable()` is *allowed* to be null by schema, so a high null
rate is arguably expected. Could **downgrade** (not silence) high-null-rate to
Information/Hint for `.nullable()` columns. Left out of the core plan because it
changes default behavior for everyone; the explicit suppression above is the
requested fix.

## Recommendation

Order: **Phase 0 → Phase 1 → (optional) Phase 2.**

- **Phase 0** is required per the unused-vs-partial distinction and is also the
  cleanest enabler — once `unused-column` is its own code, `middle_name` (94%,
  not 100%) stays `high-null-rate` and a genuinely-empty column becomes
  `unused-column`, each independently disable/suppressible.
- **Phase 1** then gives the column-level `columnExclusions` to silence the one
  expected-null column without nuking the table or the rule.
- **Phase 2** adds the in-source `// drift-advisor:ignore` escape hatch if
  wanted; reuses the existing column parser + comment helpers, more surface.

Also bundle the data-quality "Disable rule" lightbulb (named under Phase 0's
gap) so the rule is toggleable from the diagnostic itself, not only settings.

## Verification

- `columnExclusions` for `harry_potter_characters.middle_name` removes the
  warning while a deliberately-drifted sibling column still warns.
- Targeted test runs only:
  `npm test` scoped to `diagnostic-manager.test.ts` (Phase 1) and the
  dart-parser / data-quality provider tests (Phase 2).

## Finish Report (2026-06-19)

Phase 0 and Phase 1 are implemented and verified. Phase 2 (the in-source
`// drift-advisor:ignore` directive) was deferred and is tracked separately in
[plan 69](../../../69-inline-comment-diagnostic-suppression.md).

### Problem addressed
The advisor's `high-null-rate` data-quality check fired on columns that are
expected to be mostly NULL by design (reported case:
`harry_potter_characters.middle_name`, 94% NULL). The only suppression levers
were too broad — disable the rule globally, exclude the whole table, or downgrade
severity — none could silence a single column. Separately, a column that is 100%
NULL (never populated by any row) was indistinguishable from a merely-sparse
column because both collapsed into `high-null-rate` at the 50% threshold.

### Phase 0 — split 100%-NULL from partial high-null
- Added a distinct `unused-column` diagnostic code
  (`extension/src/diagnostics/codes/data-quality-codes.ts`). A column whose null
  count equals its row count emits `unused-column`; 50%–<100% stays
  `high-null-rate`. The branch keys on the raw count
  (`nullCount >= rowCount`), not the rounded percentage, so a 99.6% column that
  renders as "100%" is not misclassified as unused
  (`extension/src/diagnostics/providers/data-quality-provider.ts`).
- Closed a related gap: the data-quality provider offered no "Disable rule"
  lightbulb (compliance / runtime / best-practice / naming providers all did).
  Added the shared `driftViewer.disableDiagnosticRule` code action for every
  data-quality code.

### Phase 1 — per-column suppression setting
- Added `driftViewer.diagnostics.columnExclusions`, a map of diagnostic code →
  list of `table.column` identifiers, mirroring the existing `tableExclusions`.
  Parsed in `loadDiagnosticConfig`
  (`extension/src/diagnostics/diagnostic-config.ts`), typed on
  `IDiagnosticConfig` (`diagnostic-types.ts`), and applied in
  `DiagnosticManager._applyDiagnostics` immediately after the table-exclusion
  check, keyed on `${table}.${column}` from `issue.data` (`diagnostic-manager.ts`).
  Registered the setting in `package.json` with an NLS description in
  `package.nls.json`; regenerated `nls-coverage-data.ts`.
- Applies to every column-scoped code that carries `data.column`, not only
  `high-null-rate`.

### Tests
- `data-quality-provider.test.ts`: 100%-null → `unused-column` (and not
  `high-null-rate`); 94%-null → `high-null-rate` (and not `unused-column`); the
  new "Disable rule" action present for `high-null-rate`, `unused-column`,
  `data-skew`.
- `diagnostic-manager.test.ts`: a `columnExclusions` entry suppresses the rule
  on the named `table.column` and does NOT suppress a sibling column.
- Added `columnExclusions: new Map()` to the shared provider test-context
  builders to satisfy the widened `IDiagnosticConfig`.
- Full suite green (2871 passing); TypeScript compile + NLS verify + coverage
  gate clean.

### Recommended usage for the reported case
`harry_potter_characters.middle_name` at 94% stays `high-null-rate`; silence it
with, in the consuming workspace's `.vscode/settings.json`:
`"driftViewer.diagnostics.columnExclusions": { "high-null-rate": ["harry_potter_characters.middle_name"] }`.
