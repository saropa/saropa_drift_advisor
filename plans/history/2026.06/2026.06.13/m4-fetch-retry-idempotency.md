# fetchWithRetry skips non-idempotent requests (audit M4)

The extension's `fetchWithRetry` retried any request once on a transient error (connection reset, timeout, `fetch failed`, 5xx). It was used for mutating POSTs — data import, session create, session annotate — as well as for reads. A classic transient failure is the connection dropping *after* the server received and applied the request but *before* the response was read; retrying such a POST re-sends it, producing a duplicate import / duplicate session / duplicate annotation. This change gates retry on idempotency.

## Finish Report (2026-06-13)

### Scope

(B) VS Code extension (TypeScript). No Dart, no Flutter, no docs beyond the changelog.

### What changed

- **`extension/src/transport/fetch-utils.ts`** — `FetchWithTimeoutInit` gains an optional `idempotent?: boolean`. `fetchWithRetry` computes `canRetry = init.idempotent ?? methodIsIdempotent(init.method)` and only retries when `canRetry` is true. `methodIsIdempotent` treats GET/HEAD/OPTIONS/PUT/DELETE as safe and POST/PATCH as unsafe. The new field is stripped from the init before it reaches native `fetch` (alongside `timeoutMs`/`signal`).
- **Read/idempotent POSTs flagged `idempotent: true`** to preserve their single-retry resilience: `httpSql` and `httpExplainSql` (`/api/sql`, `/api/sql/explain` — read-only), `httpSetChangeDetection` (`/api/change-detection` — sets a flag to a fixed value), and DVR `stop` / `pause` / `config` (idempotent state/options).
- **Mutating POSTs intentionally left unflagged** so they no longer retry: `/api/import`, `/api/session/share`, `/api/session/annotate`. `/api/dvr/start` is also left unflagged because starting recording resets the session/buffer, so a retry is not a clean no-op.

### Design notes

- Default-deny on retry for POST/PATCH is fail-safe: a caller that forgets to think about idempotency gets the safe behavior (no duplicate write); resilience is the opt-in.
- GET-based reads (analytics, schema, DVR status/queries, health) are unaffected — they remain retried via the method inference.

### Verification

- `tsc --noEmit -p ./` — clean.
- Extended `extension/src/test/fetch-utils.test.ts`: a POST on a transient error is NOT retried (callCount 1) and the error surfaces; a POST flagged `idempotent: true` IS retried (callCount 2); a DELETE is retried by method; `idempotent` is stripped from the native-fetch init. Full extension suite passes (2725).

### Outstanding

None.
