# BUG: Only `/api/sql` enforces `Content-Type: application/json`; every other POST endpoint is cross-site forgeable

**Status: Open**

Created: 2026-09-02
Component: Server
File: `lib/src/server/sql_handler.dart` (line ~274), `lib/src/server/router.dart` (lines ~1000-1035)
Severity: Crash

---

## Summary

`SqlHandler.parseSqlBody` is the only place in the server that rejects a request whose
`Content-Type` is not `application/json`. Every other POST endpoint — `/api/import`,
`/api/cell/update`, `/api/edits/apply`, `/api/indexes/apply`, `/api/snapshot`, `/api/session/share`,
`/api/monitoring`, `/api/change-detection`, `/api/activity/capture` — reads the body with
`ServerUtils.readBodyBytes` and JSON-decodes it regardless of the declared type. A cross-origin HTML
form with `enctype="text/plain"` can therefore deliver a valid JSON body to any of these endpoints
with no CORS preflight, no auth (the documented default is no auth), and no user interaction beyond
loading a page. The browser cannot read the response, but the write already happened.

---

## Attribution Evidence

```bash
# Positive — the ONLY Content-Type check in the whole Dart server
grep -rn "contentType?.mimeType" lib/src/
# lib/src/server/sql_handler.dart:274:    final contentType = request.headers.contentType?.mimeType;

# The unguarded body readers: none of these inspect the request Content-Type
grep -rn "ServerUtils.readBodyBytes" lib/src/server/
# lib/src/server/cell_update_handler.dart:66
# lib/src/server/edits_batch_handler.dart:131
# lib/src/server/import_handler.dart:50
# lib/src/server/index_batch_handler.dart:157
# lib/src/server/router.dart:507   (POST /api/activity/capture)
# lib/src/server/router.dart:1360  (POST /api/monitoring)
# lib/src/server/router.dart:1430  (POST /api/change-detection)
# lib/src/server/snapshot_handler.dart:107
# lib/src/server/sql_handler.dart:315

# No CSRF token / Origin / Sec-Fetch-Site check anywhere
grep -rn "Origin\|Sec-Fetch\|csrf\|CSRF" lib/src/
# (0 matches other than the Access-Control-Allow-Origin response header)
```

**Emit site(s) — list ALL:** listed above.
**Diagnostic `source` / `owner` as seen in Problems panel:** n/a (runtime server behavior).

---

## Environment

- OS:
- VS Code version:
- Extension version:
- Dart SDK version:
- Flutter SDK version (if applicable):
- Database type and version: SQLite (any)
- Connection method: HTTP loopback, default port 8642
- Relevant non-default settings: `writeQuery` supplied (for the destructive variants)
- Other potentially conflicting extensions:

---

## Minimal Reproducible Example

Serve this page from any origin (a local `python -m http.server`, a docs site, a CodePen) and open it
while the debug server is running:

```html
<form id="f" method="POST" enctype="text/plain"
      action="http://127.0.0.1:8642/api/monitoring">
  <input name='{"enabled": false, "_":"' value='"}'>
</form>
<script>f.submit()</script>
```

`enctype="text/plain"` serializes the single field as `name=value`, producing the body
`{"enabled": false, "_":"="}` — valid JSON. `ServerUtils.parseJsonMap` accepts it and
`Router._handleSetMonitoring` flips the kill switch. No preflight is issued because
`text/plain` is a CORS-safelisted request content type.

The same shape reaches `/api/import` (see
`002_infra_import_sql_format_executes_arbitrary_sql.md` — arbitrary DDL), `/api/edits/apply`
(arbitrary `DELETE FROM`), and `/api/cell/update`.

---

## Expected Behavior

Every endpoint that parses a JSON body should reject a request whose `Content-Type` mime type is not
`application/json`, exactly as `SqlHandler.parseSqlBody` already does — that alone forces a CORS
preflight on cross-origin requests, which the server answers with a 404 today, blocking the request.

---

## Actual Behavior

The body is read and JSON-decoded with no type check, so a CORS-safelisted `text/plain` form POST is
processed as if it were a same-origin `fetch` with `application/json`.

---

## Error Output

None — the endpoints return their normal success envelopes.

---

## Duplicate-Emission Check

Dart-only surface. The TypeScript extension always sends `application/json`, so the extension path is
unaffected; the fix must land in `lib/src/`.

---

## What I Already Tried

- [x] Grepped both trees for `Origin` / `Sec-Fetch-Site` / CSRF token handling — none exists
- [x] Confirmed `readBodyBytes` performs no content-type inspection
- [x] Confirmed `parseJsonMap` accepts any body that decodes to a JSON object

---

## Regression Info

- Last working version: n/a — never enforced outside `/api/sql`
- First broken version:
- What changed:

---

## Root Cause

The `Content-Type` check was added to `SqlHandler` in isolation and never lifted to a shared
pre-dispatch guard, so each handler independently omits it.

**Proposed fix sketch:**

1. Add `ServerUtils.requireJsonContentType(HttpRequest) -> bool` (or a `_ctx.rejectNonJson(...)`
   helper) and call it from a single place: in `Router._dispatch`, immediately after the
   rate-limit gate, for `request.method == POST || PUT`. One gate is cheaper to keep correct than
   nine handler-local checks.
2. Additionally reject a request carrying an `Origin` header that does not equal the configured
   `corsOrigin` (and reject any `Origin` at all when `corsOrigin` is null, the secure default) —
   this closes the vector even for a future endpoint that legitimately accepts another mime type.
3. Add a regression test in `test/handler_integration_test.dart` posting `text/plain` to each
   mutating endpoint and asserting `415` / `400` and that no write occurred.

---

## Changes Made

<!-- Fill in when a fix is written. -->

---

## Commits

<!-- Add commit hashes as fixes land. -->

---

## Impact

- Who is affected: every developer running the debug server while also browsing the web — the
  normal state during app development.
- What is blocked: nothing; the risk is silent unwanted mutation.
- Data risk: high when `writeQuery` is wired (arbitrary DDL/DML via `/api/import` and
  `/api/edits/apply`); moderate otherwise (monitoring kill switch flipped, snapshots created,
  sessions minted).
- Frequency: deterministic for any page that chooses to do it; the server has no defense.
