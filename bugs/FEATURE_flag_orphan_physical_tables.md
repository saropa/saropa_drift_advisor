# Feature Request — Flag orphan PHYSICAL tables (present in the DB, absent from the Drift schema)

> Filed from the Saropa Contacts repo following an ANR / schema-drift
> investigation (2026-06-06).
> Origin item: `contacts/docs/PLAN_STARTUP_PERFORMANCE_ANR_FOLLOWUP.md` **T15(a)**.

---

## Summary

Add an Advisor check that detects **orphan physical tables**: a table that
physically exists in the SQLite file but has **no** corresponding definition in
the app's Drift schema (the generated `*.g.dart` / `@DriftDatabase` table set).
This is the inverse of the usual "schema declares a table the DB lacks" check.

This check would have caught the **v33 orphan** in Saropa Contacts — a physical
table left in the database by a migration whose Drift definition had since been
removed/renamed, which sat undetected because nothing in the schema pointed at
it.

## Why it matters

- Orphan physical tables silently bloat the DB file and can shadow a re-created
  table on the next migration (a re-`CREATE TABLE` against an existing physical
  name behaves differently than against a clean slate).
- They are invisible to a schema-first audit: the Drift classes are the source
  of truth, so a table absent from them is never inspected. Only a check that
  starts from the **physical** side (enumerate `sqlite_schema`, subtract the
  Drift-declared set) can surface them.
- Saropa Contacts is mid-migration from Isar→Drift with a hand-written
  `build_static_data.py` path **plus** Drift migrations as a dual schema source
  (see `contacts` memory `project_drift_migration_collapse_at_freeze`), which is
  exactly the condition that produces orphans.

## Proposed Behavior

1. Enumerate physical tables from `sqlite_schema`
   (`WHERE type = 'table' AND name NOT LIKE 'sqlite_%'`).
2. Subtract Drift-internal bookkeeping tables (e.g. the migration/version table)
   from consideration.
3. Compare against the set of tables the connected Drift schema declares.
4. Any physical table not in the declared set → emit a diagnostic:
   "Orphan physical table `<name>` — present in the database but not declared in
   the Drift schema. Left by a prior migration? Drop it or restore its
   definition."

## Proposed Acceptance Criteria

- [ ] A physical table with no Drift declaration is flagged.
- [ ] Drift's own internal/version table is **not** flagged.
- [ ] A normal, fully-declared schema produces zero orphan findings (no false
      positives on the healthy case).
- [ ] The finding names the exact table and states the likely cause + remedy.
- [ ] The check is opt-in or report-only first (does not auto-drop anything —
      dropping a table is destructive and must stay a human decision).

## Environment

| Field | Value |
|---|---|
| Repo | `saropa_drift_advisor` (this repo) — likely the analyzer side under `lib/src/` |
| Motivating case | Saropa Contacts v33 orphan physical table (Drift, SQLite) |
| Severity | Low–Medium (data-integrity guard; prevents a class of silent migration drift) |

## Related / companion items (NOT this repo — pointers only)

The same ANR follow-up (T15) names two sibling-repo items, recorded here only so
the thread isn't lost. They are **not** filed in this repo because their
emitters live elsewhere; each needs filing in its own repo:

- **T15(b)** — a signal template for repeated native platform-channel calls
  (the real N+1 the log analyzer can't see) → belongs in `saropa-log-capture`.
- **T15(c)** — an optional equivalent `saropa_lints` rule → belongs in
  `saropa_lints`.

Do not implement T15(b)/(c) from this repo.
