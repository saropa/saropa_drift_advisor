# Feature: Global column-name-based suppression config

**Status:** Fixed  
**Filed:** 2026-09-07  
**From:** contacts project

## Resolution

Added `driftViewer.diagnostics.columnNameExclusions` VS Code setting — keys
are diagnostic codes, values are bare column names matched case-insensitively
across every table. Complements the existing `columnExclusions`
(`table.column`-scoped) and `tableExclusions` settings.

- `extension/src/diagnostics/diagnostic-types.ts` — `columnNameExclusions` on
  `IDiagnosticConfig`
- `extension/src/diagnostics/diagnostic-config.ts` — parses the setting
- `extension/src/diagnostics/diagnostic-apply.ts` — applies it after the
  `table.column` exclusion check
- `extension/package.json` / `package.nls.json` — setting schema + description

## Problem

Columns like `lastModified` are nullable by design — NULL means "never
modified." Every table that carries one needs a per-column
`// drift-advisor:ignore high-null-rate` directive. This is repetitive and
easy to miss when adding new tables.

## Proposed solution

Support a project-level config (e.g. `.drift-advisor.yaml` or a section in
`analysis_options.yaml`) that suppresses specific diagnostic codes by column
name pattern:

```yaml
drift_advisor:
  suppress:
    high-null-rate:
      columns:
        - lastModified
        - updatedAt
```

This would eliminate per-column inline directives for columns whose
nullability is a known design choice across the schema.

## Finish Report (2026-09-07)

Columns nullable by design (e.g. `lastModified`, `updatedAt`) previously
required either a `// drift-advisor:ignore` comment on every affected column,
or a `table.column` entry per table in the existing `columnExclusions`
setting. Neither scaled across a schema where the same column name recurs on
many tables.

A new VS Code setting, `driftViewer.diagnostics.columnNameExclusions`, was
added alongside the existing `tableExclusions` and `columnExclusions`
settings. It maps a diagnostic code to a set of bare column names, matched
case-insensitively against every table's column data regardless of which
table the diagnostic was raised on:

```json
{
  "driftViewer.diagnostics.columnNameExclusions": {
    "high-null-rate": ["lastModified", "updatedAt"]
  }
}
```

`loadDiagnosticConfig` in `diagnostic-config.ts` parses and lowercases the
configured column names into `IDiagnosticConfig.columnNameExclusions` (a
`Map<code, Set<lowercaseColumnName>>`, optional to avoid updating every
existing test-helper config constructor). `buildDiagnosticsByFile` in
`diagnostic-apply.ts` checks it immediately after the existing
`table.column`-scoped `columnExclusions` check, inside the same
`typeof tableName === 'string'` guard (every current producer of
`data.column` also sets `data.table`/`data.tableName`, so this guard does not
currently block any column-name-only diagnostic — noted as a latent coupling
during code review, not a live bug).

Three tests were added to the existing `columnExclusions` describe block in
`diagnostic-manager.test.ts`: suppression across two different tables sharing
a column name, case-insensitive matching, and non-interference with an
unrelated column name. `npx tsc --noEmit` is clean and the full extension test
suite (3327 tests) passes; a single unrelated pre-existing failure in
`extension.test.js` (disposable count) predates this change and traces to
already-uncommitted, out-of-scope edits to
`extension-activation-event-wiring.ts`.
