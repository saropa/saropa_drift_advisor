# Query statistics no longer double-count on refresh (audit M3)

`QueryIntelligence._getPerformance` re-fetches the server's entire rolling performance window each time its cache expires, then folds every returned query into the pattern store via `recordQuery`. Because the window is re-fetched whole, every refresh re-ingested the same queries, so `executionCount` and `totalDurationMs` — the values that drive slow-pattern detection and index suggestions — grew without bound on every TTL expiry. `recordQuery` is also called at execution time (NL-SQL, query builder), making the periodic re-ingest pure duplication.

## Finish Report (2026-06-13)

This work will be reviewed by another AI. — (chat-time note; not part of the durable record.)

### Scope

(B) VS Code extension (TypeScript). No Dart, no Flutter, no docs beyond the changelog.

### What changed

- **`extension/src/engines/query-intelligence.ts`** — added a `_lastIngestedAt` cursor (ISO timestamp of the newest server query already folded in). `_getPerformance` now ingests only queries whose `at` is strictly greater than the cursor and advances the cursor to the newest `at` seen, so each query counts exactly once across refreshes. `clear()` resets the cursor.

### Design notes

- `QueryEntry.at` is an ISO-8601 UTC string (the Dart server stamps timings with `DateTime.now().toUtc().toIso8601String()`), so lexicographic `>`/`<=` comparisons are chronological — no date parsing needed.
- A strict `>` is used so an already-seen `at` is never re-ingested; a second query landing in the same millisecond as the cursor could be missed, an acceptable trade versus unbounded inflation and far cheaper than tracking a per-query id set.

### Verification

- `tsc --noEmit -p ./` — clean.
- New `extension/src/test/query-intelligence-ingest.test.ts` (fake client + fake timers): the same perf window fetched across two TTL-separated refreshes leaves `executionCount` at 1 (was 2 before the cursor); a genuinely newer query added to the window on the second refresh bumps the count to 2. Full extension suite passes (2731).

### Outstanding

None. Execution-time `recordQuery` and the server-perf ingest can still both observe a query the extension itself ran (no shared id to cross-dedup); that residual is far smaller than the per-refresh inflation this fixes and is out of scope here.
