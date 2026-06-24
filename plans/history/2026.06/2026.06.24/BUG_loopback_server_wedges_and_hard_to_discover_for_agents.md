# Bug + Enhancement Report

**Status:** Fixed

Two related problems found while an AI coding agent (Claude Code) tried to use
the Drift Advisor loopback server (`http://127.0.0.1:8642`) as a live-DB research
tool during a Saropa Contacts debugging session on 2026-06-24:

1. **Robustness bug** — after a short series of `/api/sql` POSTs, the server
   stopped responding to **every** endpoint (including the trivial
   `/api/health`) and did **not** self-recover.
2. **Discoverability / API-contract gap** — there is no documented way for an
   external (non-VS-Code-UI) client to discover the port or learn the read API;
   the agent had to grep the project's `assets/web/*.js` to find that
   `POST /api/sql {"sql": ...}` returns `{"rows": [...]}`.

The user's explicit ask: make **server discovery** and **SQL execution** easier
for an external agent, and harden the server so one bad request can't take it
down.

---

## Title

Loopback `/api/sql` server becomes fully unresponsive (all endpoints, no
self-recovery) after a sequence of queries, and exposes no documented discovery
or API contract for non-UI (agent / CLI) clients.

---

## Environment

| Field | Value |
|---|---|
| OS | Windows 11 Pro 10.0.22631 x64 |
| Client | Claude Code agent via `curl` (Git Bash) — **headless HTTP**, not the VS Code webview UI |
| Drift Advisor server version | 4.1.8 (from `/api/health` and the web shell title) |
| schemaVersion | 1 |
| Server flags (from `/api/health`) | `writeEnabled:false`, `compareEnabled:false`, `loopbackOnly:true`, `capabilities:["issues"]`, `extensionConnected:true` |
| VS Code version | Unknown (not captured — access was headless) |
| Database | SQLite (Drift) — the **live** Saropa Contacts app DB, proxied via the Dart VM service |
| Connection method | Loopback HTTP `127.0.0.1:8642`, no auth (loopback-only) |
| App under inspection | Saropa Contacts (Flutter), 351 contacts |

---

## Steps to Reproduce

From a clean state, with the Drift Advisor server running and an app connected
(`extensionConnected:true`), issue these HTTP requests in order from an external
client (curl):

```
1. GET  /                                          -> 200 (HTML shell)
2. GET  /api/health                                -> 200 (JSON, see below)
3. POST /api/sql  {"sql":"SELECT COUNT(*) AS n FROM contacts"}   -> 200 {"rows":[{"n":351}]}
4. POST /api/sql  {"sql":"SELECT name FROM pragma_table_info('contacts')"}  -> 200 with EMPTY body (no rows, no error)
5. POST /api/sql  {"sql":"SELECT * FROM contacts LIMIT 1"}       -> empty body, then connection fails
6. POST /api/sql  {"sql":"SELECT sql FROM sqlite_master WHERE name='contacts'"}  -> HTTP 000 (connection failed)
7. GET  /api/health                                -> HTTP 000 (connection failed)
8. (repeat /api/health ~10x over several minutes, incl. `curl --retry 8`)  -> HTTP 000 every time
```

Notes on the curl invocations (they may matter for the wedge):
- Each request used a client-side timeout (`curl -m 6..20`).
- Requests were sequential, one at a time (no concurrency).
- Step 5's first attempt was piped to `head -c` (client closed the socket
  early after reading some bytes); a single-connection server that doesn't
  tolerate a client-aborted read is a candidate cause.

---

## Expected Behavior

1. Every `/api/sql` query returns either a JSON result (`{"rows":[...]}`) or a
   JSON error (`{"error":"..."}`). An empty 200 body (steps 4–5) is never a
   valid response.
2. A single failed, slow, or client-aborted `/api/sql` request must not affect
   any subsequent request. `/api/health` in particular must keep responding —
   it is the liveness probe.
3. The server self-recovers (or at minimum keeps serving `/api/health`) without
   a manual restart.

---

## Actual Behavior

1. Two queries (steps 4 and 5) returned **empty** HTTP bodies — no JSON, no
   error text.
2. From step 6 onward, **every** request (including `GET /api/health`) returned
   `HTTP 000` (TCP connect/response failure at the curl layer).
3. The server **did not recover** across ~10 retries over several minutes,
   including `curl --retry 8 --retry-delay 3 --retry-all-errors`. It required
   the user to be told it needs a manual restart.

The earlier successful `COUNT(*)` (step 3) proves the server, the VM-service
proxy, and the SQL path were all healthy immediately before the wedge.

---

## Error Output

No server-side logs were capturable from the headless client. At the HTTP layer,
all post-wedge requests reported curl `HTTP 000` with empty bodies. The
pre-wedge `/api/health` payload was:

```json
{"ok":true,"extensionConnected":true,"version":"4.1.8","schemaVersion":1,"writeEnabled":false,"compareEnabled":false,"loopbackOnly":true,"capabilities":["issues"]}
```

(The VS Code Output channel and Developer Tools console were not accessible to
the headless agent — see the discoverability enhancement below; an agent has no
path to those logs.)

---

## Root Cause — what is RULED OUT vs. what needs investigation

**Ruled out (with evidence): BLOB serialization.** A first hypothesis was that
`SELECT * FROM contacts` pulled avatar **blob** bytes and overran a buffer. This
is **false** — the `contacts` Drift table has **no BLOB columns**. Verified in
the Saropa Contacts repo:

```
$ grep -nE "BlobColumn|Uint8List|blob" lib/database/drift/tables/user_data/contact_table.dart
(no matches)
```

`avatarUrl` and `avatarStringSVG` are `TextColumn`; avatar bytes live in a
separate table. So `SELECT * FROM contacts LIMIT 1` returns one all-text row —
not a large/binary payload. The blob theory is not the cause.

**Needs investigation (NOT asserted):** the two leading candidates, neither yet
proven, are:
- A `/api/sql` query that yields an **empty body** (the `pragma_table_info(...)`
  table-valued-function query at step 4, and the `SELECT *` at step 5) leaves
  the request handler in a state that wedges the single loopback connection.
- A **client-aborted read** (step 5 was piped to `head -c`, closing the socket
  mid-response) is not tolerated by a single-connection server, leaving it
  unable to accept further connections.

Whoever fixes this should reproduce with (a) a table-valued-function query and
(b) a deliberately client-aborted read, and watch the server's connection/handler
state.

---

## Minimal Reproducible Example

```bash
# Healthy:
curl -s http://127.0.0.1:8642/api/health
curl -s -X POST http://127.0.0.1:8642/api/sql \
  -H 'Content-Type: application/json' \
  -d '{"sql":"SELECT COUNT(*) AS n FROM contacts"}'

# Suspected wedge triggers (run against any DB with a `contacts`-like table):
curl -s -X POST http://127.0.0.1:8642/api/sql \
  -H 'Content-Type: application/json' \
  -d "{\"sql\":\"SELECT name FROM pragma_table_info('contacts')\"}"   # empty body?
curl -s -X POST http://127.0.0.1:8642/api/sql \
  -H 'Content-Type: application/json' \
  -d '{"sql":"SELECT * FROM contacts LIMIT 1"}' | head -c 100         # client aborts read

# After the above, this should still work but returns HTTP 000:
curl -s http://127.0.0.1:8642/api/health
```

---

## What I Already Tried

- Re-probed `/api/health` ~10 times over several minutes — `HTTP 000` every time.
- `curl --retry 8 --retry-delay 3 --retry-all-errors -m 15` — `HTTP 000`.
- Retried the narrow `COUNT(*)` that worked before the wedge — `HTTP 000`.
- Did NOT restart the server (headless agent cannot; left for the user).

---

## Impact

- **Who:** any external/automated client (AI coding agent, CLI script, CI check)
  using the loopback server as a live-DB query tool. Also affects a human if a
  single query wedges their session.
- **What is blocked:** all further queries until manual restart. In this session
  it blocked a real debugging task (inspecting two specific contact rows to
  diagnose a duplicate-contact bug) — the agent had to stop and ask the user to
  restart.
- **Data risk:** none directly (server was `writeEnabled:false`, read-only). The
  risk is to workflow continuity and to trust in the tool's reliability.
- **Frequency:** the wedge reproduced once this session and did not recover;
  the empty-body responses reproduced on 2 distinct queries.

---

## Enhancement requests (the user's primary ask)

### E1 — Server **discovery** for non-UI clients

Today an external agent cannot find the server without being told the URL, and
cannot learn the API without grepping `assets/web/app.js`. Make it discoverable:

1. **Write a discovery manifest to a well-known path** when the server starts —
   e.g. `~/.saropa_drift_advisor/server.json` (and/or a per-workspace
   `.drift_advisor/server.json`) containing:
   ```json
   {"host":"127.0.0.1","port":8642,"version":"4.1.8","writeEnabled":false,
    "loopbackOnly":true,"pid":12345,"workspace":"d:/src/contacts",
    "startedAt":"2026-06-24T...","endpoints":["/api/health","/api/sql","/api/tables","/api/schema"]}
   ```
   An agent can then read one predictable file instead of guessing a port.
2. **Document the read API contract** in the project README (or serve it at a
   `GET /api/` index): the request/response shape of `/api/sql`, `/api/health`,
   `/api/tables`, `/api/table/:name`, `/api/schema`. The contract exists in
   `assets/web/` but is not discoverable as documentation.
3. Have `/api/health` advertise the endpoint list (it already advertises
   `version`, `capabilities`, `writeEnabled`, `loopbackOnly` — add `endpoints`).

### E2 — Easier / safer **SQL execution** for agents

1. Never return an empty 200. `/api/sql` must always return `{"rows":[...]}` or
   `{"error":"..."}` so a client can tell success from failure (steps 4–5
   returned neither).
2. Isolate request handling so one slow / failed / client-aborted query cannot
   wedge the whole server — at minimum keep `/api/health` answering.
3. Consider a documented row/column cap and a server-side statement timeout for
   `/api/sql`, returned in the JSON envelope, so a wide or slow query degrades
   gracefully instead of hanging.

---

## Cross-repo note

This report is filed in `saropa_drift_advisor/bugs/` (the server's own repo).
The Saropa Contacts repo only consumed the server as an HTTP client; the
evidence used from it (the `contacts` table having no BLOB columns) is quoted
above with the exact grep. No diagnostic `(owner, code)` pair is involved — this
is a runtime server bug, not an analyzer/linter diagnostic, so the Emitter
Attribution section of the guide does not apply.

---

## Finish Report (2026-06-24)

### Scope

Dart package server (`lib/src/server/`, `lib/src/drift_debug_server_io.dart`),
package tests (`test/`), and docs (`doc/API.md`, `CHANGELOG.md`). No VS Code
extension and no Flutter UI code. No new dependencies.

### Resolution summary

Both reported problems were addressed by hardening the loopback HTTP server
against a single bad request and by making the server self-describing to non-UI
clients. The two empty-body / wedge root causes were never reproduced (the
report flagged them as unproven candidates), so every fixable failure path was
closed rather than one cause asserted.

### E2 — robustness (the wedge + empty bodies)

1. **Per-statement timeout.** `POST /api/sql` and `POST /api/sql/explain`
   execution is now bounded by `ServerConstants.sqlStatementTimeout` (30s,
   surfaced as `ServerContext.sqlStatementTimeout` so tests can inject a short
   value). A query that hangs in the host DB layer previously kept its request
   handler awaiting forever, holding the connection open; a pile-up of such
   stuck handlers is the leading suspect for the "every endpoint dies, no
   recovery" wedge. On timeout the handler abandons the await (the underlying
   query is not cancellable from Dart) and returns `ServerConstants.errorSqlTimeout`,
   freeing the connection so `/api/health` keeps answering.
2. **Always well-formed JSON.** SQL responses now go through
   `ServerContext.writeJsonResponse`, which encodes with
   `ServerUtils.jsonEncodeFallback` as the `toEncodable` callback. A query result
   carrying a value `jsonEncode` cannot encode directly (most commonly a
   `DateTime`) previously made the encode throw *after* headers were committed,
   producing the reported "empty 200, no rows, no error" body; the fallback
   converts such a value to a string (ISO-8601 for `DateTime`) so the body is
   always either `{"rows":[...]}` or `{"error":"..."}`.
3. **Bounded result.** A result wider than `ServerConstants.maxSqlResultRows`
   (10,000) is clipped, and the envelope carries `rowCount` (the true match
   count) and `truncated: true`, so a wide query degrades to a bounded body
   instead of streaming an unbounded one.
4. **Crash-proof dispatch.** `Router.onRequest` now wraps the whole request —
   including the pre-dispatch auth, rate-limit, and favicon checks that sat
   outside the existing inner try/catch — so no handler error escapes as an
   unhandled async error (which could fault the HttpServer subscription) or
   leaks an open response. On any escaped error it logs and best-effort sends a
   500 + close, contained to that one request.

### E1 — discoverability

1. **`GET /api/health` and the VM-service health JSON** now include an
   `endpoints` array (`ServerConstants.healthEndpoints`).
2. **New `GET /api/` (and `GET /api`)** serves a self-describing index:
   product name, version, flags, a `{method, path, description}` catalog
   (`ServerConstants.apiIndexEndpoints`), and a CDN link to `doc/API.md`. A
   headless client no longer has to grep the bundled web assets to learn the
   `/api/sql` contract.
3. **Discovery manifest.** On startup the server writes
   `~/.saropa_drift_advisor/server.json` (host, port, version, flags, pid,
   workspace, startedAt, endpoints) via best-effort, fully guarded I/O — skipped
   silently when no home directory resolves (e.g. a mobile embedder). It is
   removed on `stop()` only when the file's pid matches the stopping process, so
   a second server in another process keeps its own manifest.

### Tests

New `test/server_robustness_test.dart` (9 tests, all passing): statement-timeout
recovery and the fast-path; `DateTime` encode-safety; row-cap truncation; a
failing query returning JSON error while `/api/health` stays live; `endpoints`
in health; the `GET /api/` and `GET /api` index; and the discovery-manifest
write/remove lifecycle (guarded for hosts without a home dir). The existing
`handler_integration_test.dart` (health-shape) and `sql_validation_test.dart`
suites remain green — the new health field is additive and those assertions are
field-wise, not exact-match.

### Notes for maintainers

- Every `DriftDebugServer.start()` now writes the discovery manifest to the
  user's home directory (cleaned up on `stop()`), which also occurs during the
  test suite. The write is guarded and non-fatal.
- The statement timeout abandons but does not cancel a hung query; the host
  query continues in the background until it completes or the isolate exits.
