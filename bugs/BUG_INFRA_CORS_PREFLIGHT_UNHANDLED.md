# BUG: No `OPTIONS` handler — configuring `corsOrigin` cannot make any POST endpoint work cross-origin

**Status: Open**

Created: 2026-09-02
Component: Server
File: `lib/src/server/router.dart` (`_dispatch` / `_dispatchRoutes`), `lib/src/server/server_context.dart` (line ~754)
Severity: UX

---

## Summary

`DriftDebugServer.start(corsOrigin: ...)` is documented as the way to let a browser page on another
origin talk to the server, and `ServerContext.setCors` duly sets `Access-Control-Allow-Origin` on
responses. But the router never handles the `OPTIONS` method and never emits
`Access-Control-Allow-Methods` / `Access-Control-Allow-Headers` / `Access-Control-Max-Age`. Every
cross-origin `POST` with `Content-Type: application/json` (which is what `/api/sql` *requires*)
triggers a CORS preflight; that `OPTIONS` request falls through every route group to the final
`res.statusCode = HttpStatus.notFound`, so the browser blocks the real request. `corsOrigin` is
therefore usable only for simple `GET` requests.

---

## Attribution Evidence

```bash
# Positive — CORS response header IS set here
grep -rn "Access-Control" lib/src/
# lib/src/drift_debug_server_io.dart:105:  /// * [corsOrigin] — Value for Access-Control-Allow-Origin.
# lib/src/drift_debug_server_io.dart:160:    // SECURE DEFAULT: no Access-Control-Allow-Origin header. The wildcard '*'
# lib/src/drift_debug_server_io.dart:900:    /// SECURE DEFAULT (null = no header): Access-Control-Allow-Origin value. The
# lib/src/server/server_context.dart:138:  /// Value for Access-Control-Allow-Origin header; null
# lib/src/server/server_context.dart:754:  /// Sets Access-Control-Allow-Origin when a CORS
# lib/src/server/server_context.dart:760:      response.headers.set('Access-Control-Allow-Origin', origin);

# Negative — the preflight method is never handled, and the preflight response
# headers are never emitted, anywhere in the Dart tree
grep -rn "OPTIONS" lib/src/
# (0 matches)
grep -rn "methodOptions\|Allow-Methods\|Allow-Headers\|Max-Age" lib/src/
# (0 matches)

# The declared HTTP method constants stop at PUT — OPTIONS was never added
grep -n "static const String method" lib/src/server/server_constants.dart
# 59:  static const String methodGet = 'GET';
# 60:  static const String methodPost = 'POST';
# 62:  static const String methodDelete = 'DELETE';
# 63:  static const String methodPut = 'PUT';
```

**Emit site(s) — list ALL:** the fall-through 404 at `lib/src/server/router.dart:230-232`; the
one-sided CORS header at `lib/src/server/server_context.dart:760`.
**Diagnostic `source` / `owner` as seen in Problems panel:** n/a (runtime server behavior).

---

## Environment

- OS:
- VS Code version:
- Extension version:
- Dart SDK version:
- Flutter SDK version (if applicable):
- Database type and version: n/a
- Connection method: browser page on an origin other than the server's
- Relevant non-default settings: `corsOrigin: 'https://example.test'`
- Other potentially conflicting extensions:

---

## Steps to Reproduce

1. Start the server with `corsOrigin: 'http://localhost:5173'`.
2. Serve a page from `http://localhost:5173` containing:

```js
fetch('http://127.0.0.1:8642/api/sql', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ sql: 'SELECT 1' }),
});
```

3. Open the browser devtools Network tab.

---

## Expected Behavior

The `OPTIONS` preflight is answered `204` with `Access-Control-Allow-Origin`,
`Access-Control-Allow-Methods: GET, POST, PUT, DELETE, OPTIONS`,
`Access-Control-Allow-Headers: Content-Type, Authorization, X-Drift-Client`, and a
`Access-Control-Max-Age`, after which the `POST` proceeds.

---

## Actual Behavior

The `OPTIONS` request returns `404` with no CORS headers. The browser logs
`Response to preflight request doesn't pass access control check: No 'Access-Control-Allow-Origin'
header is present on the requested resource` and never sends the `POST`. Every POST endpoint —
`/api/sql`, `/api/import`, `/api/cell/update`, `/api/edits/apply`, `/api/indexes/apply`,
`/api/snapshot`, `/api/session/share`, `/api/monitoring`, `/api/change-detection` — is unreachable
cross-origin regardless of how `corsOrigin` is set.

`GET` endpoints do work, because a simple GET needs no preflight — which makes the failure look
selective and confusing rather than obviously "CORS is not implemented".

---

## Error Output

Browser console: preflight access-control-check failure, as quoted above. Nothing is logged
server-side (a 404 is not routed through `logError`).

---

## Duplicate-Emission Check

Dart-only. The VS Code extension talks to the server from the extension host (Node), which does not
enforce CORS, so this is invisible to the extension test suite.

---

## What I Already Tried

- [x] Grepped the entire `lib/` tree for `OPTIONS` and for every preflight response header — zero
      matches
- [x] Traced `OPTIONS /api/sql` through `_dispatch` → `_routePreQuery` (method-gated to GET/POST) →
      `_dispatchRoutes` (every group method-gated) → the terminal 404

---

## Regression Info

- Last working version: n/a — never implemented
- First broken version:
- What changed:

---

## Root Cause

`setCors` was written as a response decorator and the preflight half of the CORS protocol was never
added. The router's method gating means an `OPTIONS` request matches nothing.

**Proposed fix sketch:**

1. Add `ServerConstants.methodOptions = 'OPTIONS'` and, in `Router._dispatch`, immediately after the
   favicon shortcut, answer any `OPTIONS` request with `204` plus the four preflight headers —
   emitted **only when `corsOrigin` is non-null**, preserving the secure default of no CORS at all.
2. Emit `Vary: Origin` alongside `Access-Control-Allow-Origin` in `setCors` so an intermediary
   cache cannot serve one origin's allowed response to another.
3. Keep the preflight ahead of the auth gate (a preflight carries no credentials by design) but
   behind the rate limiter.
4. Add a `test/handler_integration_test.dart` case asserting `OPTIONS /api/sql` returns `204` with
   the expected headers when `corsOrigin` is set, and `404` when it is not.

---

## Changes Made

<!-- Fill in when a fix is written. -->

---

## Commits

<!-- Add commit hashes as fixes land. -->

---

## Impact

- Who is affected: anyone using the documented `corsOrigin` option to drive the server from their
  own web front-end (the stated purpose of the option).
- What is blocked: all cross-origin writes and all cross-origin SQL execution.
- Data risk: none.
- Frequency: 100% — deterministic.
