# BUG: Drift Viewer panel loads the server shell without the auth header and without checking the HTTP status, rendering the 401 body as the UI

**Status: Open**

<!-- Status values: Open → Investigating → Fix Ready → Closed -->

Created: 2026-09-02
Component: Extension
File: `extension/src/panel.ts` (line ~176)
Severity: UX

---

## Summary

`DriftViewerPanel._loadContent` fetches the server's HTML shell with a bare
`fetch(fetchUrl)`: no `Authorization` header, no `resp.ok` check, and no
timeout. When the host app configures `authToken`, the server's router rejects
**every** request including `GET /` — so the panel injects `<base>`/CSP into the
server's `401 Unauthorized` JSON body and assigns that as the webview HTML. The
user sees a blank or garbled panel with no error and no Retry button, while the
sidebar (which does send the header) shows a healthy connection.

---

## Attribution Evidence

Both halves are in this repo — the auth gate is Dart, the omission is TypeScript.

```bash
# Positive — the panel's unauthenticated, unchecked fetch lives here
grep -n "authToken\|Authorization" extension/src/panel.ts
# Expected: 0 matches   <-- the panel never sends the Bearer token

grep -n "await fetch\|resp.ok\|timeoutMs" extension/src/panel.ts
# 196:      const resp = await fetch(fetchUrl);   <-- bare fetch, no init at all

# Positive — the client and the discovery probes DO send it, so the panel is the outlier
grep -n "authToken\|Authorization" extension/src/api-client-base.ts
# 35:  protected _authToken: string | undefined;
# 48:    this._authToken = token || undefined;
# 71:    if (this._authToken && isLoopbackHost(this.host)) {
# 72:      h['Authorization'] = `Bearer ${this._authToken}`;

grep -n "discoveryAuthHeadersFromToken" extension/src/extension-bootstrap.ts
# 25: function discoveryAuthHeadersFromToken(
# 88:    authHeaders: discoveryAuthHeadersFromToken(discoveryToken),

# Positive — the server requires auth on EVERY request, not just /api/*
grep -n "authToken != null" -A 8 lib/src/server/router.dart
# 150:    if (_ctx.authToken != null ||
# 151:        (_ctx.basicAuthUser != null && _ctx.basicAuthPassword != null)) {
# 152:      if (!_auth.isAuthenticated(req)) {
# 153:        await _auth.sendUnauthorized(res);
# 154:        return;
# 155:      }
# 156:    }
```

The auth check at `router.dart:150` sits **before** the route dispatch, so the
SPA shell served by `GET /` is gated identically to `/api/*`.

**Emit site(s) — list ALL:**
- `extension/src/panel.ts:196` (the fetch: no headers, no status check, no timeout)
- `extension/src/panel.ts:198` (`await resp.text()` on a possibly-401 response)
- `extension/src/panel.ts:246` (assigns that body as `webview.html`)

**Diagnostic `source` / `owner` as seen in Problems panel:** n/a — runtime behavior.

---

## Environment

- OS: any
- VS Code version: any
- Extension version: 4.2.5
- Dart SDK version: any
- Flutter SDK version: any
- Database type and version: SQLite (any)
- Connection method: HTTP loopback (`127.0.0.1`) — the only case where the
  extension sends the token at all
- Relevant non-default settings: `"driftViewer.authToken": "<token>"` and a host
  app started with a matching `authToken:`
- Other potentially conflicting extensions: none

---

## Steps to Reproduce

1. Start the host app with an auth token:
   ```dart
   await DriftDebugServer.start(query: db.customSelectQuery, authToken: 's3cret');
   ```
2. In `.vscode/settings.json` set:
   ```jsonc
   { "driftViewer.host": "127.0.0.1", "driftViewer.authToken": "s3cret" }
   ```
3. Reload the window. The sidebar connects normally (the Database tree lists
   tables — `DriftApiClientBase._headers` sends the Bearer header).
4. Run **Drift: Open in Panel** from the command palette (or click the status-bar
   `Drift: :8642` item).

Deterministic — 10 out of 10 attempts whenever a token is configured.

**Second, independent repro (no auth needed):** point `driftViewer.host` at an
address that accepts the TCP connection but never answers (e.g. a stale
`adb forward` to a device that has gone to sleep) and open the panel. Because
step 4's `fetch` has no timeout, the panel sits on "Loading Saropa Drift
Advisor…" indefinitely and never reaches the `catch` that renders the Retry
button.

---

## Expected Behavior

1. The panel fetch carries the same `Authorization: Bearer <token>` header as
   `DriftApiClient` and the discovery probes, under the same loopback-only gate
   (`isLoopbackHost`) documented in `api-client-base.ts:65-70`.
2. A non-2xx response renders the existing "Cannot connect to Drift debug
   server" page with the Retry button — and, for 401/403, says the token is
   missing or wrong and points at `driftViewer.authToken`.
3. The fetch is bounded by a timeout so an unresponsive host reaches the same
   error page instead of hanging on the loading splash.

---

## Actual Behavior

1. `fetch(fetchUrl)` sends no `Authorization` header, so the server's
   pre-dispatch auth check (`router.dart:150`) answers `401` with a JSON body.
2. `resp.ok` is never consulted; `await resp.text()` returns the 401 body.
3. `html.replace('<head>', …)` finds no `<head>` in that body, so **neither the
   `<base href>` nor the CSP meta is injected** — the two `replace` calls
   silently no-op.
4. `this._panel.webview.html = html` assigns the raw error body. The panel shows
   the bare JSON (or nothing, depending on the body shape) with no Retry
   affordance and no toast.
5. Nothing is written to the output channel — the failure is entirely silent.

The contradiction is the worst part: the sidebar says connected (it authenticates
correctly), so the panel looks like a rendering bug rather than an auth problem.

---

## Error Output

### VS Code Developer Tools Console

Possibly a CSP/`<base>`-related resource error from the webview, since neither
meta was injected. No extension-side error.

### Extension Output Channel

Nothing. `_loadContent` logs neither success nor failure.

### Terminal / Command Output

```
$ curl -i http://127.0.0.1:8642/
HTTP/1.1 401 Unauthorized
...
$ curl -i -H "Authorization: Bearer s3cret" http://127.0.0.1:8642/
HTTP/1.1 200 OK
```

The `curl` pair is the shortest proof that `GET /` is auth-gated.

### Stack Traces

None — no exception is thrown, which is precisely why this fails silently.

---

## Duplicate-Emission Check

Two language paths, one fix site:

- Dart (`lib/src/`): `lib/src/server/router.dart:150` — correct as written; the
  server is *supposed* to gate `GET /`.
- TypeScript (`extension/src/`): `extension/src/panel.ts:196` — the only site
  that needs to change. `api-client-base.ts:71` and
  `extension-bootstrap.ts:88` already implement the intended behavior.

---

## Screenshots / Recordings

Not captured. A before/after screenshot of the panel (garbled 401 body vs. the
loaded viewer) would be the useful artifact when this is fixed.

---

## Minimal Reproducible Example

```dart
// main.dart
await DriftDebugServer.start(query: db.customSelectQuery, authToken: 's3cret');
```

```jsonc
// .vscode/settings.json
{ "driftViewer.host": "127.0.0.1", "driftViewer.authToken": "s3cret" }
```

Open the panel. 60 seconds, one setting, one server flag.

---

## What I Already Tried

- [x] Traced `router.dart` `_dispatch` — the auth check precedes routing, so no
      path (including the SPA shell and `/favicon.ico`) is exempt.
- [x] Confirmed `DriftApiClientBase._headers` and the discovery probes both send
      the header, and both gate it on `isLoopbackHost` for the reason documented
      in audit H4 — so the panel must reuse the same gate, not send blindly.
- [x] Read `extension/src/test/panel.test.ts` — 20 cases covering base/CSP
      injection, the `_loadSeq` race, and the unreachable-server path, but
      **none** stubs a non-OK response and none asserts on request headers.

---

## Regression Info

- Last working version: never worked with auth enabled.
- First broken version: whichever release introduced `driftViewer.authToken`
  without extending it to the panel loader.
- What changed: auth support was added to the API client and the discovery
  probes; the panel's independent `fetch` was not updated.

---

## Root Cause

`_loadContent` is the only outbound HTTP call in the extension that does not go
through `DriftApiClient`/`fetchWithTimeout`, so it inherited none of the three
things those paths provide: the auth header, status handling, and a timeout.

Fix sketch:

```ts
private async _loadContent(host: string, port: number): Promise<void> {
  const seq = ++this._loadSeq;
  …
  try {
    // The server gates EVERY request behind auth when authToken is set
    // (router.dart _dispatch runs the auth check before routing), so the shell
    // fetch must carry the same Bearer header the API client sends. Gated on
    // loopback for the same reason as DriftApiClientBase._headers (audit H4):
    // driftViewer.host is free-form workspace config and must never receive
    // credentials for a non-local address.
    const headers: Record<string, string> = { 'X-Drift-Client': 'vscode' };
    const token = vscode.workspace
      .getConfiguration('driftViewer').get<string>('authToken', '');
    if (token && isLoopbackHost(host)) headers['Authorization'] = `Bearer ${token}`;

    // fetchWithTimeout, not bare fetch: an accepting-but-silent host (a stale
    // adb forward to a sleeping device) would otherwise leave the panel on the
    // loading splash forever, with no Retry button to escape it.
    const resp = await fetchWithTimeout(fetchUrl, { headers, timeoutMs: DEFAULT_FETCH_TIMEOUT_MS });
    if (this._disposed || seq !== this._loadSeq) return;

    // A 401 body is not the app shell. Without this check it was injected into
    // the webview as HTML, producing a blank panel with no explanation while
    // the sidebar (which authenticates) still showed "connected".
    if (!resp.ok) {
      this._showLoadError(baseUrl, resp.status);
      return;
    }
    …
```

`_showLoadError` should reuse the existing error page and special-case
401/403 with a line naming `driftViewer.authToken`. Consider also logging one
line to the connection channel on failure so the Output panel tells the story.

---

## Changes Made

<!-- Fill in when a fix is written. -->

---

## Commits

<!-- Add commit hashes as fixes land. -->

---

## Impact

- Who is affected: every user who enables `authToken` (the recommended posture
  when the server is reachable beyond loopback), plus anyone whose host accepts
  connections without answering.
- What is blocked: the entire web viewer panel — the extension's primary data
  surface. The sidebar keeps working, which makes the failure read as a
  rendering bug and sends users down the wrong diagnostic path.
- Data risk: none. Note the fix must NOT send the token to a non-loopback host;
  doing so would reintroduce audit finding H4.
- Frequency: every panel open while a token is configured.
