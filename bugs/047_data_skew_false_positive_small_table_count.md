# BUG: `data-skew` fires on almost every two- or three-table database, regardless of row counts

**Status: Open**

Created: 2026-09-02
Component: Extension
File: `extension/src/diagnostics/providers/data-quality-checks.ts` (line ~349)
Severity: False positive

---

## Summary

`checkDataSkew` reports a table holding more than 50% of *all* database rows. With only two tables, one of them exceeds 50% unless the split is exactly even; with three, the largest exceeds 50% whenever it holds more than the other two combined. The threshold encodes an assumption about many-table schemas and has no floor on table count above 2, no absolute row floor, and no comparison against an expected share.

---

## Attribution Evidence

```bash
# Positive - diagnostic IS defined here
grep -rn "'data-skew'" extension/src/
# extension/src/diagnostics/codes/data-quality-codes.ts:60:  'data-skew': {
# extension/src/diagnostics/codes/data-quality-codes.ts:61:    code: 'data-skew',
# extension/src/diagnostics/providers/data-quality-checks.ts:78:        code: 'data-skew',
# extension/src/diagnostics/providers/data-quality-provider.ts:81:    if (code === 'data-skew') {

grep -rn "'data-skew'" lib/src/
# Expected: 0 matches (TypeScript-only diagnostic)

# Negative - not a sibling-repo rule
grep -rn "'data-skew'" ../saropa_lints/lib/src/rules/
# Expected: 0 matches   (actual: 0 matches; ../saropa_lints/lib/src/rules/ exists, 21 entries)
```

**Emit site(s) - list ALL:** `extension/src/diagnostics/providers/data-quality-checks.ts:372`
**Diagnostic `source` / `owner` as seen in Problems panel:** `drift-advisor`

---

## Environment

- OS: Windows 11 Pro 10.0.22631
- VS Code version: any
- Extension version: 4.2.5
- Database type and version: SQLite (Drift)
- Connection method: local debug server
- Relevant non-default settings: none (data-quality category enabled by default)

---

## Steps to Reproduce

1. A minimal two-table app database - the shape of every early-stage project and every example app:

   ```sql
   CREATE TABLE users    (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL);
   CREATE TABLE settings (id INTEGER PRIMARY KEY AUTOINCREMENT, k TEXT, v TEXT);
   INSERT INTO users    (name) VALUES ('a'),('b'),('c'),('d'),('e'),('f');
   INSERT INTO settings (k, v)  VALUES ('x','1'),('y','2'),('z','3'),('w','4'),('q','5');
   ```

2. Connect the extension and refresh diagnostics.

---

## Expected Behavior

No diagnostic. 6 rows versus 5 rows in a 2-table database is not data skew by any meaningful definition, and there is no action a developer could take in response.

---

## Actual Behavior

> drift-advisor Table "users" has 55% of all database rows (data skew)

reported at Information on the `Users` table class line.

---

## Minimal Reproducible Example

Pure arithmetic from `data-quality-checks.ts:354-381`:

```ts
tableSizes = [ { table: 'users', rowCount: 6 }, { table: 'settings', rowCount: 5 } ];
tableSizes.length < 2            // false -> proceeds
totalRows = 11
users:    6 / 11 * 100 = 54.5 > DATA_SKEW_THRESHOLD (50)  -> emit
settings: 5 / 11 * 100 = 45.5                              -> no emit
```

In a two-table database the rule is a coin-flip on which table wins, and only a perfect 50/50 split silences it. Concretely, the *only* two-table row-count pairs that do not fire are those where both counts are equal.

Three tables behave the same whenever one dominates for benign reasons:

```ts
[ {table:'log_entries', rowCount: 800},
  {table:'users',       rowCount: 40},
  {table:'settings',    rowCount: 12} ]
// log_entries: 800/852 = 93.9% -> emit, though "the log table has the most rows"
// is the intended design of every app that has a log table.
```

There is also no absolute floor - a database with `users: 3, settings: 1` fires at 75%.

---

## Root Cause

`DATA_SKEW_THRESHOLD = 50` treats "share of all rows" as skew, but share is only informative relative to the number of tables. With `n` tables the *expected* even share is `100 / n`, so a fixed 50% threshold means:

- n = 2: fires unless the split is exactly even (expected share 50%, threshold 50%);
- n = 3: fires at 1.5x expected;
- n = 20: fires at 10x expected.

The rule is calibrated for large schemas and mis-calibrated everywhere else. The `tableSizes.length < 2` guard rejects only the degenerate single-table case; two tables is the first case the rule handles and also its worst.

There is a second, independent problem: a dominant fact/log/event table is normal architecture, not a defect, so even a correctly-calibrated version needs an exclusion path.

**Fix sketch**

1. Make the threshold relative to the table count and require a meaningful multiple of the even share:

   ```ts
   // Share only means something relative to how many tables could hold rows.
   // With 2 tables the even share IS 50%, so a fixed 50% threshold fires on any
   // uneven split. Require a multiple of the expected share instead.
   const expectedShare = 100 / tableSizes.length;
   const SKEW_MULTIPLE = 3;
   if (percentage > Math.max(DATA_SKEW_THRESHOLD, expectedShare * SKEW_MULTIPLE)) { ... }
   ```

   This makes the rule silent below 4 tables (where `expectedShare * 3 >= 75` and `>= 100` at n=3, i.e. unreachable) and progressively more sensitive as the schema grows - the behaviour the 50% constant was reaching for.
2. Add an absolute floor (`totalRows >= MIN_ROWS_FOR_SKEW`, e.g. 1000). Percentages of a 10-row debug database carry no information; the module already applies this reasoning for null rates via `MIN_ROWS_FOR_ANALYSIS`.
3. Honour the existing `ctx.config.userDataTables` exclusion the way `checkHighNullRates` does (`data-quality-checks.ts:394`) - a table the user marked as holding unrepresentative debug data should not drive a share statistic either. `checkDataSkew` does not receive `ctx` today; passing it is a signature change only.
4. Test: `extension/src/test/data-quality-provider.test.ts` has no two-table fixture. Add the 6/5 case above asserting zero issues, and a 20-table case with one 60% table asserting the issue still fires.

---

## Impact

- Who is affected: every project with a small schema - new projects, example apps, and the extension's own demo database.
- What is blocked: nothing hard, but the diagnostic is unactionable and permanent, and it is the first thing a new user sees. It also mislabels the normal "one big log table" architecture as a defect.
- Data risk: none.
- Frequency: every refresh, on essentially every 2-3 table database.
