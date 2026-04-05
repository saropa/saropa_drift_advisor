# BUG: column-type-drift should distinguish pre-built DB schema mismatch from code errors

**Severity:** Low
**Component:** Diagnostics / Column type checker
**Code:** `column-type-drift`
**Affects:** Projects using pre-built SQLite databases alongside Drift-generated schemas
**Status:** FIXED

---

## Summary

The diagnostic correctly identifies that `currency_rates.rate_date` and `currency_rates.created_at` have type TEXT in the database but Drift expects INTEGER (since `store_date_time_values_as_text: false`). However, the diagnostic message said:

```
Column "currency_rates.rate_date" type mismatch: Dart=INTEGER, DB=TEXT
```

This was technically correct but lacked context.

## Fix applied

Updated `extension/src/diagnostics/checkers/column-checker.ts`:

1. **Actionable message** — changed from `Dart=X, DB=Y` to `Dart schema expects X but database has Y. Either update the database column or change the Dart definition` so the developer knows both sides are candidates for the fix.

2. **DateTime-specific hint** — when the mismatch is INTEGER vs TEXT on a `DateTimeColumn`, the message now appends: `Check store_date_time_values_as_text in build.yaml` to surface the most common root cause.

3. **Severity** — already `Warning` (not Error as originally reported), which is appropriate since the mismatch is real but the fix direction is ambiguous.
