# Fix 001: Index-apply endpoint wiring

`driftViewer.createAllIndexes` posted `CREATE INDEX` SQL to `POST /api/sql`,
which `SqlValidator.isReadOnlySql` rejects for all non-SELECT SQL — every index
failed silently behind a bare `catch`, reporting "Created 0 index(es), N failed"
with no reason.

## Finish Report (2026-09-02)

### Root Cause

The command called `client.sql(idx.sql)` → `POST /api/sql`, whose server-side
handler (`SqlHandler`) gates through `SqlValidator.isReadOnlySql`, rejecting
everything except `SELECT`/`WITH … SELECT`. The correct endpoints
(`POST /api/indexes/preview`, `POST /api/indexes/apply`, served by
`IndexBatchHandler` in `lib/src/server/index_batch_handler.dart`) already
existed and were already used by the browser viewer — the VS Code extension
simply never called them.

### Changes

- **`extension/src/api-client-http-indexes.ts`** (new): `httpIndexPreview` and
  `httpIndexApply` HTTP functions. `fetchWithRetry` for preview (idempotent),
  `fetchWithTimeout` for apply (non-idempotent). `_readErrorDetail` extracts the
  server's `{"error": "..."}` body on failure.
- **`extension/src/api-client-http-impl.ts`**: Re-exports both new functions.
- **`extension/src/api-client.ts`**: `indexPreview()` and `indexApply()` on
  `DriftApiClient` (HTTP-only; no VM Service RPC yet).
- **`extension/src/health/index-apply.ts`** (new): `createAllIndexesCommand` —
  preview-first flow (chunked at 200, mirroring `IndexBatchHandler.maxIndexes`),
  confirm dialog showing accepted/rejected counts, parallel before/after
  `EXPLAIN QUERY PLAN` comparison per index (no wall-clock timing — see Timing
  note below), results written to a dedicated output channel.
- **`extension/src/health/health-commands.ts`**: Rewired `driftViewer.createAllIndexes`
  to call `createAllIndexesCommand`; top-level catch now surfaces error messages
  instead of swallowing them.
- **`extension/src/test/api-contract.test.ts`**: Contract tests for
  `IIndexPreviewResult` and `IIndexApplyResult` type shapes.
- **`bugs/001_proposal_ux_index_apply_with_timing.md`**: Status → Fix Ready,
  root cause and changes documented.

### Design Decisions

- **EXPLAIN-only, no wall-clock timing**: The only representative query
  available is `column = 1` on a suggestion that has no index yet, so timing it
  would force a potentially full-table scan on the user's live database.
  `EXPLAIN QUERY PLAN` never executes the query, so plan comparison (SCAN vs
  SEARCH) is bounded-cost and safe.
- **Parallel plan probes**: Baseline and post-apply `planLine()` calls run via
  `Promise.all` — each hits a different table/column and already swallows its
  own errors, so concurrent requests are safe and cut N-1 round-trip latencies.
- **INDEX_APPLY_CHUNK_SIZE = 200**: Mirrors `IndexBatchHandler.maxIndexes`
  server-side. Cross-language constant — no automated sync check yet (unlike the
  long-poll timeout pair, which has `check_longpoll_timeout_sync.py`).

### Deferred

- Wall-clock timing, per-index `DROP INDEX` undo, `/api/health` version-gated
  fallback for servers too old to have `/api/indexes/*`.
- `_readErrorDetail()` duplicates error-extraction pattern from
  `api-client-http-edits.ts`; consolidation deferred (would touch files outside
  fix 001 scope).

### Verification

- `npx tsc --noEmit -p extension/tsconfig.json` — clean.
- `npx mocha out/test/api-contract.test.ts` — 3148 passing.
- Not exercised against a live server in this pass.

### Code Review Findings (fix 001-specific)

1. **Sequential planLine calls** — fixed: parallelized with `Promise.all`.
2. **`_readErrorDetail()` duplication** — noted, deferred (cross-file scope).
3. **`chunk()` in feature file** — noted, no other consumer yet.
4. **`INDEX_APPLY_CHUNK_SIZE` cross-language sync** — fixed: added
   `scripts/check_index_batch_size_sync.py` modeled on the long-poll timeout
   sync script; verifies Dart `maxIndexes` == TS `INDEX_APPLY_CHUNK_SIZE`.

### Hardening (post-reflection)

- **Runtime response shape validation**: `httpIndexPreview` and `httpIndexApply`
  now validate the server's JSON response shape at runtime (check for required
  arrays/fields) before returning, throwing a clear error on shape mismatch
  instead of producing undefined-access errors downstream.
- **Cross-language sync script**: `scripts/check_index_batch_size_sync.py`
  parses both `IndexBatchHandler.maxIndexes` (Dart) and
  `INDEX_APPLY_CHUNK_SIZE` (TS) and asserts equality — prevents the client from
  sending oversized batches if the server constant changes.
