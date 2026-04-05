# BUG: N+1 detection flags intentional per-action activity logging as a query pattern issue

**Date:** 2026-04-05
**Severity:** Medium
**Component:** Diagnostics / N+1 detection
**Code:** `n-plus-one`
**Affects:** Tables that receive frequent independent writes from user-driven actions

---

## Summary

The diagnostic reports:

```
[drift_advisor] Potential N+1 query pattern: "activities" queried 11 times in recent window
```

This is a false positive. The `activities` table is an activity log — every user action (viewing a contact, making a call, editing a field, etc.) writes a separate activity record. 11 independent INSERT operations during normal app usage is expected behavior, not an N+1 query pattern.

## What N+1 actually means

An N+1 query pattern is when code loads a list of N parent records and then executes one query per parent to load related child records — a total of N+1 queries where a single JOIN or IN query would suffice.

The activity table inserts are:

- **Independent operations** — each insert corresponds to a distinct user action at a different point in time
- **Not related to a parent query** — there is no "fetch list, then query per item" pattern
- **Write operations** (INSERTs), not reads — N+1 is fundamentally a read-path optimization concern

## Root cause

The N+1 detector appears to count the number of times a table is accessed within a time window, without distinguishing:

1. **Reads vs. writes** — INSERT-heavy tables like activity logs will always have high write frequency
2. **Independent operations vs. loop-driven queries** — 11 inserts from 11 separate user actions over 30 seconds is not the same as 11 SELECTs inside a `for` loop
3. **Call site correlation** — a true N+1 originates from a single code path iterating over a collection; independent call sites across the app are not N+1

## Expected behavior

The N+1 detector should only flag patterns where:

1. A single code path issues multiple queries in a loop (same call stack)
2. The queries are reads (SELECTs) that could be batched into a single query
3. The queries follow a parent-child pattern (e.g., fetch contacts → for each contact, fetch phone numbers)

Independent writes from different code paths should never be flagged.

## Suggested fixes

### Option A: Distinguish reads from writes

Only count SELECT operations for N+1 detection. INSERT/UPDATE/DELETE operations are inherently per-record and cannot be "batched" in the same way.

### Option B: Track call site, not just table name

Instead of counting "table X was accessed N times," track "table X was accessed N times from the same call stack / code location." Multiple accesses from different code paths are independent operations, not a loop.

### Option C: Raise the threshold for activity/log tables

Tables with names matching common logging patterns (`activities`, `logs`, `events`, `audit_*`) should have a higher threshold or be excluded from N+1 detection, since high write frequency is their entire purpose.

## Reproduction steps

1. Open a Drift project with an `activities` table used for user action logging
2. Perform 10-15 normal app actions (navigate screens, view contacts, etc.)
3. Observe the N+1 warning in the Problems panel

## Impact

- **Misleading performance warning** on a table that is functioning correctly
- Developer may waste time trying to "batch" activity inserts that are inherently independent
- Reduces trust in the N+1 detector, causing developers to ignore it when a real N+1 pattern occurs

## Files likely involved

| File | Role |
|------|------|
| `extension/src/diagnostics/checkers/n-plus-one-checker.ts` (or equivalent) | Counts table access frequency without distinguishing read/write or call site |
| `extension/src/diagnostics/codes/` | Defines the `n-plus-one` diagnostic code |
