# Diagnostic severity reclassification + Saropa Lints ingestion

Advisory, heuristic diagnostics were emitted at Warning severity, reading as
defects when they are suggestions; and `saropa_lints` findings were only ever
dumped as text to an Output channel, never surfaced as real diagnostics. This
change drops 13 advisory codes to Information and adds an on-demand path that
publishes `saropa_lints` findings into the Problems panel.

## Severity reclassification (13 codes Warning → Information)

### Rationale
A diagnostic that flags a possible improvement or a heuristic observation — not
a definite correctness defect — should read as informational, not as a warning
squiggle. Genuine defects (schema drift, integrity violations, orphaned /
mismatched foreign keys) keep Warning/Error.

### Mechanism
Severity is sourced in two places: each code's `defaultSeverity` in the codes
registry, and an inline `severity:` the emitting provider/checker sets, which
overrides the default in `DiagnosticManager`. Both had to move for each code.

### Codes reclassified to Information
- Data quality: `high-null-rate`, `unused-column`, `data-skew`
  (`codes/data-quality-codes.ts` + `providers/data-quality-provider.ts`).
- Performance: `full-table-scan`, `slow-query-pattern`, `n-plus-one`,
  `unindexed-where-clause`, `unindexed-join` (`codes/performance-codes.ts` +
  `checkers/slow-query-checker.ts`, `checkers/n-plus-one-checker.ts`,
  `checkers/query-pattern-checker.ts`).
- Schema: `missing-fk-index`, `anomaly` (`codes/schema-codes.ts` +
  `checkers/index-checker.ts`, `checkers/anomaly-checker.ts`).
- Best practices: `text-pk`, `cascade-risk`, `duplicate-index`
  (`codes/best-practice-codes.ts` + `checkers/pk-checker.ts`).

### Behavior notes
- `slow-query-pattern` and `n-plus-one` previously escalated to Warning when a
  diagnostic could be pinned to a known caller location; that escalation was
  removed. Pin location is still chosen (caller line vs table-definition
  fallback) — only the severity is now constant Information.
- `anomaly` keeps Error for server-flagged integrity defects: those map to the
  `orphaned-fk` code, which is unchanged. Only non-error statistical anomalies
  dropped to Information.
- Kept as Warning/Error (genuine defects / drift / intentional): all integrity
  violations, orphaned/mismatched FKs, missing table/column, `column-type-drift`,
  `nullable-mismatch`, `no-primary-key`, `circular-fk`, `missing-migration`,
  `reserved-word`, all `compliance-*` (opt-in user rules), `data-breakpoint-hit`.
- Defaults only; `driftViewer.diagnostics.severityOverrides` still re-tunes any
  code per consumer.

### Tests
Four provider assertions that pinned the old Warning severity were updated to
Information (`data-quality-provider.test.ts` ×2, `performance-provider.test.ts`,
`performance-provider-nplus1.test.ts`).

## Saropa Lints findings → Problems panel

### Rationale
The existing `driftViewer.runSaropaLints` command shelled out to
`dart run saropa_lints scan .` and dumped raw text to an Output channel. Findings
were not diagnostics — no inline squiggles, no Problems-panel entries, no
click-through.

### Mechanism
New `SaropaLintsDiagnostics` (`extension/src/saropa-lints-diagnostics.ts`) owns a
dedicated `saropa-lints` diagnostic collection. `runAndPublish` invokes
`dart run saropa_lints scan . --format json` — the scanner already exposes a
stable, versioned (schema v1) JSON report, so no change to `saropa_lints` was
required. stdout is parsed tolerantly (sliced from the first `{` to the last `}`
to survive `dart run` build chatter), and each finding maps to a
`vscode.Diagnostic`:
- `filePath` → `Uri` (relative paths resolved against the workspace root),
- 1-based analyzer line/column → 0-based VS Code range (clamped),
- analyzer `severity` name → `DiagnosticSeverity` (case-insensitive;
  unknown → Information, never dropped),
- `ruleName` → `code`, `correctionMessage` appended to the message,
- `source` = "Saropa Lints".

Exit code 1 (findings present) is treated as success; only a missing/invalid
report is an error.

### Design constraints
- On-demand, not in the auto-refresh provider pipeline: the scan runs the Dart
  analyzer over the whole project and is far too costly to run every refresh /
  on-save cycle. Results persist until re-run or cleared.
- Dedicated collection, deliberately NOT routed through the advisor's
  `disabledRules` / `severityOverrides`: `saropa_lints` rules are toggled in the
  consumer's `analysis_options.yaml` (custom_lint convention); the rule registry
  lives in `saropa_lints`, not the advisor.

### Wiring
Two commands added in `saropa-lints-commands.ts` alongside the untouched
text-dump command: `driftViewer.runSaropaLintsDiagnostics` ("Run Saropa Lints
(Publish to Problems)") and `driftViewer.clearSaropaLintsDiagnostics` ("Clear
Saropa Lints Problems"). Registered in `package.json` with NLS titles in
`package.nls.json`; `nls-coverage-data.ts` regenerated. Activation-test
disposable count updated 229 → 232 (manager dispose + two command registrations).

### Tests
`saropa-lints-diagnostics.test.ts` unit-tests the pure functions: `mapScanSeverity`
(case-insensitive + unknown fallback), `parseScanReport` (clean report, build-
chatter tolerance, non-JSON → null, missing diagnostics array → null), and
`mapReportToFileDiagnostics` (group-by-file, 1-based→0-based coords, rule name as
code, source set, correction appended, rule-name fallback message).

### Not built (requires saropa_lints, a separate project)
Live (analyzer-push) updates on save — the JSON path is an on-demand batch scan.
Adding that needs changes inside `saropa_lints` and would be a plan filed there.

## Verification
TypeScript compile clean; full extension suite 2871 passing; NLS verify + coverage
gate clean. CHANGELOG updated (Added / Changed + Maintenance).
