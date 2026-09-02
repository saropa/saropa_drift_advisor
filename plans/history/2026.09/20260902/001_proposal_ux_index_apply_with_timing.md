# PROPOSAL: One-Click Index Apply with Before/After Timing (extension currently cannot create any index)

**Status: Fixed**

Created: 2026-09-02
Type: UX improvement
Related diagnostics: `missing_index` / index suggestions (`GET /api/analytics/indexes`)

---

## Summary

`driftViewer.createAllIndexes` sends `CREATE INDEX` statements to `POST /api/sql`, which the server
rejects for all non-`SELECT` SQL — so the extension's headline "one-click fix" for the #1 health issue
can never succeed. The browser UI already uses the correct `POST /api/indexes/preview` +
`POST /api/indexes/apply` endpoints. Wire the extension to those endpoints and add the thing no
competitor ships: a measured before/after for each index.

**Wow: 8/10, Effort: Medium**

---

## Motivation

Index suggestions are the most prominent actionable output of the product. They appear in:

- `extension/src/health/health-metrics.ts:56` — the Health Score panel's primary "fix" action
- `extension/src/health/index-suggestions-panel.ts:143-145` — the Index Suggestions panel's bulk button
- `extension/src/health/health-commands.ts:79` — the `driftViewer.createAllIndexes` command itself

All three funnel into this loop (`extension/src/health/health-commands.ts`, `createAllIndexes`):

```ts
for (const idx of indexes) {
  try { await client.sql(idx.sql); created++; } catch { failed++; }
}
```

`client.sql()` posts to `/api/sql`. That route validates with `SqlValidator.isReadOnlySql`
(`lib/src/server/sql_handler.dart:45`, `:167`, `:347`), which requires a `SELECT`/`WITH` prefix
(`lib/src/server/sql_validator.dart:198`) and returns
`"Only read-only SQL is allowed (SELECT or WITH ... SELECT). INSERT/UPDATE/DELETE and DDL are rejected."`
(`lib/src/server/server_constants.dart:719`).

**Therefore every index fails, on every server, with or without `writeQuery` wired.** The user sees
`Created 0 index(es), 12 failed.` with no reason, because the loop swallows the error with a bare
`catch`.

Meanwhile the correct path already exists and is exercised by the browser:

- `lib/src/server/index_batch_handler.dart` — `handlePreview` (validate, works on read-only servers)
  and apply, gated by `SqlValidator.isSingleCreateIndexSql`, best-effort per index with a
  per-index success/failure array
- `lib/src/server/server_constants.dart:174-179` — `/api/indexes/preview`, `/api/indexes/apply`
- `assets/web/bundle.js:31902`, `:31932` — the browser UI calls both

Grep proof the extension calls neither:

```bash
grep -rn "indexes/preview\|indexes/apply\|indexApply\|indexPreview" extension/src/
# 0 matches
```

This is also a browser-vs-extension parity defect: the same button works in one client and is
inoperable in the other.

---

## Detection / Behavior

### What the user sees today

1. Run **Saropa Drift Advisor: Database Health Score**, click the index fix action.
2. Confirm the modal `Create 12 index(es)? This will modify your database.`
3. Toast: `Created 0 index(es), 12 failed.` No reason, no retry, no undo.

### What the user should see

1. **Preview** — `POST /api/indexes/preview` with all suggested SQL. The panel shows
   accepted vs rejected with `IndexBatchHandler.rejectionReason` text, before anything is written.
   Preview works on read-only servers, so the user learns the plan even without `writeQuery`.
2. **Baseline** — for each suggestion, run the representative query (the one the suggestion was
   derived from) N times via `/api/sql` and record median wall time and the `EXPLAIN QUERY PLAN`
   row, reusing `extension/src/explain/` and `extension/src/query-cost/`.
3. **Apply** — `POST /api/indexes/apply`; render the per-index success/failure array the endpoint
   already returns instead of a swallowed counter.
4. **Verify** — re-run the same query and the same `EXPLAIN QUERY PLAN`. Show a row per index:

```
users_email_idx    142 ms → 3 ms   (47x)   SCAN users → SEARCH users USING INDEX users_email_idx   ✔ kept
orders_ts_idx      88 ms → 86 ms   (1.0x)  SCAN orders → SCAN orders                                ⚠ no gain — Drop
```

5. **Undo** — a `DROP INDEX` action per row, and for the whole batch, generated from the applied
   names. Currently there is no undo path at all.

### Should pass (no regression)

- A server with no `writeQuery` callback: preview still renders the full plan; apply is disabled
  with the reason, not attempted (see `018_proposal_ux_write_capability_gating.md`).
- Zero suggestions: existing `No missing indexes to create.` message is unchanged.

---

## Edge Cases

1. **Server too old to have `/api/indexes/*`** — `GET /api/health` reports `version`; fall back to
   preview-only and say so, rather than silently retrying the broken `/api/sql` path.
2. **Suggestion has no representative query** — apply without timing; show `—` in the before/after
   column rather than fabricating a number.
3. **Timing noise on a small table** — run the query a fixed number of times, report the median,
   and label a change under a threshold as "no measurable gain" instead of a ratio.
4. **`IF NOT EXISTS` already satisfied** — the endpoint is idempotent; report "already present",
   not "created".
5. **Write is enabled but the app holds a write lock** — surface the per-index failure string from
   the apply response verbatim; this is exactly what the swallowed `catch` destroys today.
6. **More than 200 suggestions** — `IndexBatchHandler.maxIndexes` is 200; chunk, do not truncate.

---

## Alternatives Considered

- **Just make `/api/sql` accept `CREATE INDEX`.** Rejected: the read-only validator is a security
  invariant, and the dedicated `isSingleCreateIndexSql` gate exists precisely so index DDL is the
  only DDL that can be batched.
- **Fix the loop to report errors, stop there.** That turns a silent failure into a loud one but
  still cannot create an index, and leaves the extension behind the browser.
- **Timing only, no verification of the plan.** Wall time alone is confounded by page cache;
  pairing it with the `EXPLAIN QUERY PLAN` line is what makes the result defensible.

---

## Decision

Accepted, scoped down. The core bug — the extension cannot create any index — is
fixed by wiring to `POST /api/indexes/preview` and `POST /api/indexes/apply`, exactly
as this proposal specifies. The full "wow" feature set (measured wall-clock
before/after, DROP-INDEX undo, per-index verify against the real representative
query, `/api/health` version gating) is deferred; see Root Cause below for why
wall-clock timing specifically was cut rather than merely postponed.

## Root Cause

`driftViewer.createAllIndexes` (`extension/src/health/health-commands.ts`) called
`client.sql(idx.sql)`, which posts to `POST /api/sql`. That endpoint validates with
`SqlValidator.isReadOnlySql` (`lib/src/server/sql_handler.dart`), which requires a
`SELECT`/`WITH ... SELECT` prefix and rejects all DDL, including `CREATE INDEX`. Every
index statement therefore failed on every server, and the loop's bare `catch { failed++; }`
discarded the rejection reason, surfacing only "Created 0 index(es), N failed." The
correct endpoints (`POST /api/indexes/preview`, `POST /api/indexes/apply`,
`lib/src/server/index_batch_handler.dart`) already existed and were already used by the
browser viewer (`assets/web/bundle.js`) — the extension simply never called them (`grep -rn
"indexes/preview\|indexes/apply" extension/src/` returned zero matches before this fix).

## Changes Made

- Added `extension/src/api-client-http-indexes.ts` — `httpIndexPreview` and
  `httpIndexApply`, calling `POST /api/indexes/preview` / `POST /api/indexes/apply` and
  surfacing the server's `{"error": "..."}` body on failure instead of a bare status code.
- Re-exported both from `extension/src/api-client-http-impl.ts`; added
  `DriftApiClient.indexPreview()` / `.indexApply()` in `extension/src/api-client.ts`
  (HTTP-only — no VM Service RPC exists yet for either endpoint).
- Added `extension/src/health/index-apply.ts` (`createAllIndexesCommand`), which:
  - Previews all suggestions first (chunked at 200 per request, mirroring
    `IndexBatchHandler.maxIndexes`) and shows accepted vs. rejected counts with the
    server's rejection reason in the confirm dialog, before anything is written.
  - Applies only the accepted statements, reads the per-index `{ok, error}` results the
    endpoint already returns instead of a swallowed counter, and always surfaces apply
    failures (e.g. `writeQuery` not configured) rather than reporting them as generic
    "failed."
  - Runs a before/after `EXPLAIN QUERY PLAN` comparison per created index (SCAN vs.
    SEARCH), written to a new "Saropa Drift Advisor: Index Apply" output channel.
    **Deliberately EXPLAIN-only, not wall-clock timing**: the only representative query
    available is `column = 1` on a suggestion that by definition has no index yet, so
    timing it for real would force a potentially full-table scan per suggestion on the
    user's live database — exactly the case where the table is largest. `EXPLAIN QUERY
    PLAN` never executes the query, so it is bounded-cost and safe to run
    unconditionally.
- Updated `driftViewer.createAllIndexes` in `extension/src/health/health-commands.ts`
  to call `createAllIndexesCommand` and wrapped it in a non-bare `catch` that surfaces
  the error message via `showErrorMessage`.

Deferred (not implemented, tracked for a follow-up if the browser-parity gap matters
enough to revisit): wall-clock query timing, per-index/whole-batch `DROP INDEX` undo,
and `/api/health` version-gated fallback for servers too old to have `/api/indexes/*`
(edge case 1) — that fallback did not previously exist either, and the new preview call
now surfaces "Index preview failed: 404" verbatim on such a server rather than silently
retrying the broken path, which is the load-bearing part of the fix.

## Verification

`npx tsc --noEmit -p extension/tsconfig.json` passes with no errors. Not exercised
against a live server in this pass — no VS Code extension test harness was run.

---

## Commits

<!-- Add commit hashes as implementation lands -->
