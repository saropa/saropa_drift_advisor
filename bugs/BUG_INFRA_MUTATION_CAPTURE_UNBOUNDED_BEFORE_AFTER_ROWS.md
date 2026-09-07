# BUG: Mutation before/after capture reads whole tables with `SELECT *` and retains them in a 500-event ring

**Status: Open**

Created: 2026-09-02
Component: Server
File: `lib/src/server/mutation_tracker.dart` (lines ~236-244, ~74, ~221-224)
Severity: Crash

---

## Summary

`MutationTracker._captureByWhere` issues `SELECT * FROM "<table>" WHERE <clause>` twice (before and
after) for every tracked `UPDATE` / `DELETE` that carries a `WHERE`. The clause is copied verbatim
from the incoming statement, so a broad predicate (`WHERE 1=1`, `WHERE deleted_at IS NULL`) captures
the entire table — including BLOB payloads — and both copies are stored in `_events`, a 500-entry
ring. There is no row cap, no BLOB exclusion, and no byte budget on the ring, so 500 retained events
can each hold two full-table row sets.

---

## Attribution Evidence

```bash
# Positive — the unbounded capture reads
grep -rn "SELECT \* FROM \${ServerUtils.quoteIdent" lib/src/server/mutation_tracker.dart
# 240:          'SELECT * FROM ${ServerUtils.quoteIdent(table)} WHERE $whereClause';
# 262:          'SELECT * FROM ${ServerUtils.quoteIdent(table)} '

# The ring is capped by ENTRY COUNT only, never by row count or bytes
grep -n "maxEvents\|_events" lib/src/server/mutation_tracker.dart
# 74:  static const int maxEvents = 500;
# 76:  final List<MutationEvent> _events = [];
# 83:    if (_events.isEmpty) return const [];
# 86:    return _events.where((e) => e.id > since).toList(growable: false);
# 221:    _events.add(event);
# 222:    if (_events.length > maxEvents) {
# 223:      _events.removeRange(0, _events.length - maxEvents);

# No blob-safe select list on the Dart side (the extension's fix never landed here)
grep -rn "blobSafeSelectList" lib/
# (0 matches)
```

**Emit site(s) — list ALL:** `lib/src/server/mutation_tracker.dart:240` (`_captureByWhere`, called
for before AND after on every UPDATE/DELETE), `lib/src/server/mutation_tracker.dart:262`
(`_captureAfterInsert`).
**Diagnostic `source` / `owner` as seen in Problems panel:** n/a (runtime server behavior).

---

## Environment

- OS:
- VS Code version:
- Extension version:
- Dart SDK version:
- Flutter SDK version (if applicable):
- Database type and version: SQLite (any)
- Connection method: HTTP loopback
- Relevant non-default settings: `writeQuery` supplied (mutation tracking is only wired then)
- Other potentially conflicting extensions:

---

## Minimal Reproducible Example

With `writeQuery` wired and a `photos` table holding 1000 rows × 1 MB BLOB:

```bash
curl -X POST http://127.0.0.1:8642/api/edits/apply \
  -H 'Content-Type: application/json' \
  -d '{"statements":["UPDATE photos SET caption = '\''x'\'' WHERE id > 0"]}'
```

`_parseSqlForMutation` extracts `id > 0` as the WHERE clause, `_captureByWhere` runs
`SELECT * FROM "photos" WHERE id > 0` **before** the write and again **after**, so ~2 GB of blob
bytes are read into the isolate and both copies are appended to `_events` as one `MutationEvent`.
The event stays resident until 500 further mutations evict it.

---

## Expected Behavior

Before/after capture should be bounded on three axes: a row cap (e.g. reuse
`ServerConstants.maxSqlResultRows` or a much smaller mutation-specific cap), a BLOB-safe select list
(`length(col) AS col`, as `extension/src/sql/blob-safe-select.ts` already does), and a total
byte budget on the event ring so 500 large events cannot exceed a fixed memory ceiling.

---

## Actual Behavior

Unbounded `SELECT *` twice per tracked statement, retained by entry count only.

---

## Error Output

Native OOM abort in the connected app on a large table; otherwise a steadily growing resident set
that the `maxEvents = 500` cap does not constrain in any meaningful way.

---

## Duplicate-Emission Check

Dart-only path — the extension does not run mutation before/after capture. The BLOB-safe helper it
does own (`extension/src/sql/blob-safe-select.ts`) has no Dart equivalent; see also
`005_infra_snapshot_capture_select_star_blob_oom.md`, which is the same missing-helper root cause on the
snapshot path.

---

## What I Already Tried

- [x] Traced `captureFromWriteQuery` → `_captureByWhere` → `readQuery(sql)` — no LIMIT is appended
- [x] Confirmed `_recordEvent` evicts on `_events.length` only, never on payload size
- [x] Confirmed `MutationEvent` stores `beforeRows` / `afterRows` as full row maps

---

## Regression Info

- Last working version: n/a — present since mutation tracking was added
- First broken version:
- What changed:

---

## Root Cause

The capture was designed around the mental model "a WHERE clause selects one row." Nothing enforces
that; the clause is whatever the caller wrote.

**Proposed fix sketch:**

1. Append `LIMIT <cap + 1>` to both capture queries; when the extra row comes back, store the
   truncated set and set a `truncated: true` flag on the `MutationEvent` so the UI can say so.
2. Build the select list from `PRAGMA table_info` with BLOB columns replaced by `length(col)`,
   sharing the helper proposed in `005_infra_snapshot_capture_select_star_blob_oom.md`.
3. Track an approximate byte total alongside `_events` and evict on `bytes > budget` as well as on
   `length > maxEvents`.
4. Regression test: apply an `UPDATE ... WHERE 1=1` on a 10k-row table and assert the recorded event
   holds at most the cap.

---

## Changes Made

<!-- Fill in when a fix is written. -->

---

## Commits

<!-- Add commit hashes as fixes land. -->

---

## Impact

- Who is affected: hosts that wire `writeQuery` and apply batch edits touching many rows.
- What is blocked: the mutations timeline becomes a liability rather than a feature on large tables.
- Data risk: none directly; the connected app can be killed mid-write.
- Frequency: any broad-predicate UPDATE/DELETE — common when clearing test data.
