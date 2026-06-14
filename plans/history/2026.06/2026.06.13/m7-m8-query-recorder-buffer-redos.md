# Query Replay recorder: O(1) eviction + bounded table-name parser (audit M7/M8)

The DVR query recorder documented itself as a "ring buffer" but stored events in a plain `List` and evicted the oldest with `removeAt(0)`, which shifts every remaining element. At the 5000-entry default cap, each recorded query past the cap was O(n), and `updateConfig`'s shrink loop was O(n²). Separately, `_parseTableName` ran a `^\s*SELECT\s+.*?\s+FROM` regex with a lazy quantifier against the full SQL string on every recorded query — a long generated SELECT with no early `FROM` could backtrack heavily (a ReDoS-shaped CPU spike on the recording hot path).

## Finish Report (2026-06-13)

### Scope

(A) Dart package code (`lib/`) + Dart test. No extension/Flutter/docs beyond the changelog.

### What changed

- **`lib/src/query_recorder.dart`** —
  - Backing store changed from `List<RecordedQuery>` to `dart:collection` `ListQueue<RecordedQuery>` (a circular buffer). `_record` and `updateConfig` evict via `removeFirst()` (O(1)) instead of `removeAt(0)` (O(n)). `first`/`last`/`length`/`clear`/iteration are unchanged Queue operations.
  - `queriesPage` backward branch snapshots the queue to a list once (`toList`) for the reverse indexed walk, because `ListQueue` has no `operator[]`. Paging is user-initiated and infrequent, so the one-time copy is acceptable; the per-insert eviction is the path that needed to be O(1).
  - `_parseTableName` flattens newlines, then matches against at most the first 2000 characters. The leading table name always sits near the start, so this preserves correctness while bounding the lazy-quantifier backtracking.
  - `_classifySql` brace-less `if` bodies wrapped in braces (flow-control lint compliance).

### Design notes

- `removeFirst()` returns the evicted element; the two eviction sites carry an `// ignore: avoid_ignoring_return_values` with a rationale, since discarding the oldest entry is the intent.
- The public `toJson` shape (including the `sequence` field that mirrors `id`) is unchanged — the extension/web DVR client depends on it, so no fields were removed.

### Verification

- `dart analyze lib/src/query_recorder.dart` — no issues.
- Existing `test/query_recorder_test.dart` (eviction bounds, `updateConfig` shrink, forward/backward paging, session lookup) passes unchanged, confirming behavior is preserved across the data-structure swap.
- Added a test recording a `SELECT * FROM users WHERE id IN (<50k values>)` and asserting the parsed `table` is `users` and the call returns promptly. Recorder + DVR-bindings suites pass.

### Outstanding

None. The `sequence`/`id` duplication noted in the audit is a separate (API-visible) cleanup, intentionally not bundled here.
