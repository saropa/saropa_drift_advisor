# BUG: blob-column-large warning fires without size context

**Date:** 2026-04-05
**Severity:** Low
**Component:** Diagnostics / BLOB checker
**Code:** `blob-column-large`
**Affects:** Every table with a `BlobColumn`

---

## Summary

The `blob-column-large` diagnostic fires on every BLOB column with the message "may cause memory issues with large data." This is not actionable because:

1. It fires on every BLOB column regardless of actual data size
2. It does not check how the BLOB is used (e.g., whether rows are loaded in bulk or one at a time)
3. The developer already chose BLOB storage intentionally — the warning adds no new information

## Observed false positives

| Table | Column | Why BLOB is correct |
|-------|--------|---------------------|
| `contact_avatars` | `image` | Contact profile photo bytes. Loaded one at a time per contact detail view. Size-capped before storage. |
| `contact_avatars` | `image_thumbnail` | Pre-generated thumbnail (~5-10 KB). Small by design — this is the optimization. |
| `native_contact_rollbacks` | `previous_value_bytes` | Serialized contact snapshot for undo/rollback. Written once, rarely read, loaded individually. |

## Root cause

The checker flags `BlobColumn` purely by type, with no analysis of:

- Row count or average blob size
- Query patterns (single-row lookup vs. bulk SELECT)
- Whether the column has application-level size constraints

## Expected behavior

Either:

1. **Don't flag BLOB columns at all** — the developer chose BLOB storage deliberately
2. **Only flag when actual data exceeds a threshold** — e.g., average blob size > 1 MB, or any blob > 10 MB
3. **Downgrade to Hint severity** with actionable guidance: "Consider storing files externally if blobs exceed X MB"

## Impact

- Low-value noise in Problems panel
- Cannot be resolved without removing the BLOB column, which is not an option
- Trains developers to ignore the diagnostic

## Files likely involved

| File | Role |
|------|------|
| `extension/src/diagnostics/checkers/blob-checker.ts` (or equivalent) | Unconditional BLOB type check |
