# Lint Report Fixes (2026-07-24)

A batch of 21 custom lint warnings from `saropa_lints` was triaged and resolved
across 13 source files. Ten were true positives; eleven were false positives
suppressed with explanatory `// ignore:` directives.

## Finish Report (2026-07-24)

### Changes

**True-positive fixes (10):**

| Rule | File | Fix |
|------|------|-----|
| `avoid_sequential_awaits` | `analytics_handler.dart` | 4 independent PRAGMA queries parallelized via `Future.wait` |
| `avoid_sequential_awaits` | `compare_handler.dart` (2 sites) | Schema/table-name queries and column-map queries parallelized |
| `avoid_sequential_awaits` | `report_handler.dart` | Table info, rows, and count queries parallelized |
| `prefer_asmap_over_indexed_iteration` | `edits_batch_handler.dart` (2 loops) | Manual index variable replaced with `asMap().entries` |
| `prefer_asmap_over_indexed_iteration` | `index_batch_handler.dart` (2 loops) | Manual index variable replaced with `asMap().entries` |
| `prefer_asmap_over_indexed_iteration` | `sql_validator.dart` | Manual index variable replaced with `asMap().entries` |
| `prefer_commenting_future_delayed` | `generation_handler.dart` | Added explanatory comment for long-poll delay |

**False-positive suppressions (11):**

Each suppression has a two-line block: a plain-language explanation of why
sequential execution (or manual indexing) is intentional, followed by the
`// ignore:` directive.

| Rule | File | Reason |
|------|------|--------|
| `prefer_asmap_over_indexed_iteration` | `drift_debug_import.dart` | Loop starts at 1 (skip header); 1-based index in error messages |
| `prefer_asmap_over_indexed_iteration` | `server_context.dart` | Needs index for in-place `snapshots[i] = updated` mutation |
| `avoid_sequential_awaits` | `drift_debug_server_io.dart` | Shutdown steps must cancel subscription before closing server |
| `avoid_sequential_awaits` | `anomaly_detector.dart` | Variance query depends on `avg` computed from first-pass stats |
| `avoid_sequential_awaits` | `compare_handler.dart` | Migration steps append to shared list in presentation order |
| `avoid_sequential_awaits` | `router.dart` | Sequential dispatch: first matching route wins |
| `avoid_sequential_awaits` | `snapshot_store.dart` | File ops: create dir, write, atomic rename must be sequential |
| `avoid_sequential_awaits` | `table_handler.dart` (4 sites) | Guard-then-query: query depends on `requireKnownTable` / `checkDataChange` completing first |

### Verification

- 85 directly affected tests pass (`compare_handler_test`, `sql_validation_test`,
  `table_handler_test`, `index_batch_handler_test`, `report_handler_test`).
- Subagent review confirmed all `Future.wait` conversions are safe (independent
  queries, no shared mutable state, error semantics preserved) and all
  `asMap().entries` conversions are semantically identical.

### Observations

- The `Future.wait` parallelization yields marginal real-world improvement:
  SQLite uses a single connection, so Dart's event loop serializes the actual
  I/O regardless. The value is lint compliance and expressing the independence
  of the queries in the code structure.
- `compare_handler.dart`'s `compareResults` unpacking uses positional casts
  (`as String`, `as List<String>`) that would silently break if the list order
  is changed in the future. Flagged for awareness; no action taken.
