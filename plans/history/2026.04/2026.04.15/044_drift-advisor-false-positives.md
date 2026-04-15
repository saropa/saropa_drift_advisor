# 044 — Drift Advisor: False Positive Diagnostics

## Status: Partially Resolved

## Problem

The Drift Advisor reported several diagnostic categories that produced false positives in projects with legitimate architectural reasons for the flagged patterns. Two of the three issues have already been resolved. The remaining issue (Bug 1) requires per-table suppression support.

---

## Bug 1: `no-foreign-keys` on tables using UUID soft references — OPEN

**Severity reported:** Information (hint)
**Actual behavior:** The rule only fires on tables that have columns ending in `_id` whose prefix matches a known table name, but which lack `FOREIGN KEY` constraints. Tables with no FK-like columns are not flagged.

The diagnostic is a false positive for projects that:

1. Use UUID-based soft references across tables (common in Isar-to-Drift migration)
2. Store static/read-only data imported from bundled JSON where FK enforcement adds cost with zero benefit
3. Deliberately avoid FK constraints for performance (cascading deletes, insert ordering)

**Existing workaround:** The rule can be globally disabled via VS Code settings:

```json
{
  "driftViewer.diagnostics.disabledRules": ["no-foreign-keys"]
}
```

This is a blunt instrument — it disables the rule for all tables, including tables where the warning is legitimate.

**Fix needed:** Add per-table suppression via the `driftViewer.diagnostics.tableExclusions` setting, allowing users to suppress specific rules on specific tables while keeping the rule active elsewhere.

---

## Bug 2: `empty-table` on tables populated at runtime — RESOLVED

**Resolution:** The `empty-table` diagnostic was removed from the codebase. It no longer exists in any diagnostic code file. The data-quality provider test suite confirms: "Empty tables are a valid database state, not a data quality issue."

No action needed.

---

## Bug 3: `slow-query-pattern` on `user_public_private_keys` is a phantom — RESOLVED

**Resolution:** Fixed in v3.2.1 (commit `ee3db2b`). Extension-internal queries (change-detection probes, `sqlite_master` lookups) are now tagged with `isInternal: true` and filtered out at two layers:

1. **Server-side:** `performance_handler.dart` excludes internal queries from the `slowQueries` list before sending to the extension
2. **Client-side:** `slow-query-checker.ts` guards with `if (query.isInternal) continue;` as a safety net

No action needed.

---

## Remaining Work

1. Implement `driftViewer.diagnostics.tableExclusions` — a map of rule name to table name list, allowing per-table suppression for any diagnostic rule (Bug 1)
