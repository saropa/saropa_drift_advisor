# BUG: `duplicate_rows` anomalies are silently discarded before reaching the Problems panel

**Status: Open**

Created: 2026-09-02
Component: Extension
File: `extension/src/diagnostics/checkers/anomaly-checker.ts` (line ~24)
Severity: False negative

---

## Summary

`checkAnomalies` re-derives the table and column from `anomaly.message` with the regex `/(\w+)\.(\w+)/` and `continue`s when it does not match. The server's `duplicate_rows` anomaly message contains no `table.column` pair, so every duplicate-row finding is dropped and never appears as a diagnostic — even though the server ships `table` and `column` as first-class fields on the payload that the checker never reads.

---

## Attribution Evidence

```bash
# Positive — diagnostic IS defined here
grep -rn "'anomaly'" extension/src/
# extension/src/diagnostics/checkers/anomaly-checker.ts:62:    const code = anomaly.severity === 'error' ? 'orphaned-fk' : 'anomaly';
# extension/src/diagnostics/codes/schema-codes.ts:110:  'anomaly': {
# extension/src/diagnostics/codes/schema-codes.ts:111:    code: 'anomaly',

grep -rn "'orphaned-fk'" extension/src/
# extension/src/diagnostics/checkers/anomaly-checker.ts:62
# extension/src/diagnostics/codes/schema-codes.ts:31,32
# extension/src/diagnostics/providers/schema-provider.ts:168

# Producer side (Dart server) — the anomaly this report is about
grep -n "duplicate_rows" lib/src/server/anomaly_detector.dart
# lib/src/server/anomaly_detector.dart:873:        'type': 'duplicate_rows',

# Negative — not a sibling-repo rule
grep -rn "'anomaly'" ../saropa_lints/lib/src/rules/
grep -rn "'orphaned-fk'" ../saropa_lints/lib/src/rules/
# Expected: 0 matches   (actual: 0 matches; ../saropa_lints/lib/src/rules/ exists, 21 entries)
```

**Emit site(s) — list ALL:** `extension/src/diagnostics/checkers/anomaly-checker.ts:69`
**Diagnostic `source` / `owner` as seen in Problems panel:** `drift-advisor` (never shown for this case — that is the bug)

---

## Environment

- OS: Windows 11 Pro 10.0.22631
- Extension version: 4.2.5
- Database type and version: SQLite (Drift)
- Connection method: local debug server
- Relevant non-default settings: none (schema category enabled by default)

---

## Steps to Reproduce

1. Create a table with no unique constraint and insert a fully duplicated row:
   ```sql
   CREATE TABLE tags (id INTEGER PRIMARY KEY AUTOINCREMENT, label TEXT NOT NULL);
   INSERT INTO tags (label) VALUES ('work'), ('work');
   ```
   (`_detectDuplicateRows` compares `COUNT(*)` against `COUNT(DISTINCT ...)`; the auto PK must not be part of the distinct projection — reproduce against whatever projection the server uses, or use a table without a rowid alias.)
2. Run the anomaly scan so `/api/analytics/anomalies` reports the finding.
3. Open the Problems panel with the corresponding Dart table file open.

---

## Expected Behavior

A `drift-advisor` diagnostic on the `Tags` table class line reading `4 duplicate row(s) in tags`, at Warning severity (the server sets `'severity': 'warning'`).

---

## Actual Behavior

No diagnostic at all. The finding appears only in the standalone Anomaly panel.

---

## Minimal Reproducible Example

The exact server payload that gets dropped (`lib/src/server/anomaly_detector.dart:870-880`):

```json
{
  "table": "tags",
  "type": "duplicate_rows",
  "severity": "warning",
  "count": 4,
  "message": "4 duplicate row(s) in tags"
}
```

Run the checker's regex against that message:

```js
"4 duplicate row(s) in tags".match(/(\w+)\.(\w+)/)   // => null
```

`null` → `continue` at `anomaly-checker.ts:25`. The anomaly is discarded.

For contrast, the four anomaly kinds that DO survive all happen to embed a dot:

```
"Potential outlier in contacts.age: upper value 91 is 4.2σ from mean 31.20 (range [0, 91], n=40)"
"12 orphaned FK(s): contact_points.contact_id -> contacts.id"
"3 NULL value(s) in NOT NULL column contacts.name (12.5%)"
"7 empty string(s) in contacts.middle_name"
```

The `outlier_check_hint` anomaly (`anomaly_detector.dart:238`) is dropped for the same reason.

### This skip is deliberate today — and its stated rationale no longer holds

`extension/src/test/anomaly-checker.test.ts:109-124` pins the current behaviour:

```ts
it('skips anomalies whose message has no `table.column` pattern', () => {
  // duplicate_rows messages are table-scoped and have no dot
  // form — the prior behavior was to drop them silently
  // (no Dart location to attach to). This test pins that
  // behavior so a future widening of the regex doesn't start
  // attaching table-scoped anomalies to arbitrary columns.
  ...
  assert.strictEqual(issues.length, 0);
});
```

The comment's premise — "no Dart location to attach to" — is false for `duplicate_rows`: the server
sends `'table': tableName`, and `checkAnomalies` already resolves a table-only location three lines
below the skip (`const line = dartColumn?.line ?? dartTable?.line ?? 0`). The test's *concern* is
sound and must be preserved: widening the message regex would indeed start attaching table-scoped
findings to arbitrary columns. That is an argument against widening the regex, not an argument for
dropping the anomaly — the fix below reads `anomaly.table` and pins to the class line, which
satisfies both the test's intent and this report.

Any fix must replace that test rather than delete it: keep a case asserting that a table-scoped
anomaly does **not** land on a column getter line, and add one asserting it **does** land on the
class line.


---

## Root Cause

`anomaly-checker.ts` parses structured data out of a human-readable string when the structured data is already on the wire. `api-types.ts:55-62` declares:

```ts
export interface Anomaly {
  message: string;
  severity: 'error' | 'warning' | 'info';
  /** Table the anomaly concerns; present on table-scoped findings from the server. */
  table?: string;
  /** Column the anomaly concerns, when column-scoped. */
  column?: string;
}
```

and `anomaly_detector.dart` sets `'table'` on every anomaly kind including `duplicate_rows`. The checker never reads either field.

**Fix sketch**

1. Prefer the structured fields; fall back to the regex only when both are absent (older servers):
   ```ts
   const match = anomaly.message.match(/(\w+)\.(\w+)/);
   const tableName = anomaly.table ?? match?.[1];
   const columnName = anomaly.column ?? match?.[2];
   if (!tableName) continue;   // table-less hints (outlier_check_hint) still skip
   ```
2. Make `columnName` optional throughout — the existing `dartColumn?.line ?? dartTable?.line ?? 0` chain already handles a missing column, so a table-scoped anomaly lands on the class line.
3. Add `data: { table: tableName, column: columnName }` to the pushed issue so per-table/per-column exclusions in `diagnostic-apply.ts:70-87` actually work for anomalies (they currently never match, because no anomaly issue carries `data`).

---

## Impact

- Who is affected: every user whose database has duplicate rows.
- What is blocked: the duplicate-row finding never reaches the Problems panel or `getLastCollectedIssues()`, so it is also absent from Log Capture session exports and the Rules-tree live counts.
- Data risk: none directly; a real data-integrity defect goes unreported.
- Frequency: every scan where `duplicate_rows` fires.
