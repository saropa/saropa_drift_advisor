# BUG: Auth-protected servers are invisible to the Saropa Lints integration — health has no auth exemption and no `authRequired` signal

**Status: Open**

Created: 2026-09-02
Component: Server
File: `lib/src/server/router.dart` (line ~149), `lib/src/server/generation_handler.dart` (line ~91)
Severity: High (integration silently reports "no server" in the exact configuration this repo tells users to adopt)

---

## Summary

When `authToken` (or basic auth) is configured, `_dispatch` requires credentials on **every** request, `/api/health` included. The Saropa Lints extension discovers an Advisor server by calling `GET /api/health` with no credentials and treats any non-2xx as "not a server". So the moment a user follows this repo's own guidance — bind off-loopback **and set an auth token** — the sibling integration goes permanently dark, with no way to distinguish "server present but locked" from "no server here".

---

## Attribution Evidence

The enforcement and the health payload both live in this repo.

```bash
# Positive — auth is enforced before routing, in this repo
$ sed -n '147,156p' lib/src/server/router.dart
    // When auth is configured, require it on every request.
    if (_ctx.authToken != null ||
        (_ctx.basicAuthUser != null && _ctx.basicAuthPassword != null)) {
      if (!_auth.isAuthenticated(req)) {
        await _auth.sendUnauthorized(res);

        return;
      }
    }

$ grep -rn "authToken" lib/src/server/
lib/src/server/auth_handler.dart:25:    final expectedToken = _ctx.authToken;
lib/src/server/router.dart:150:    if (_ctx.authToken != null ||
lib/src/server/server_constants.dart:803:      'Enable: loopbackOnly: false + authToken';
lib/src/server/server_context.dart:49:    this.authToken,
lib/src/server/server_context.dart:156:  final String? authToken;

$ grep -rn "authToken\|authRequired" extension/src/suite/
# 0 matches — nothing on the extension side advertises or negotiates auth for siblings
```

**Emit site(s) — list ALL:** `lib/src/server/router.dart:150` (the gate) and `lib/src/server/generation_handler.dart:91-129` (`sendHealth`, the payload that could carry the signal but does not).

### The health payload has room for this and does not use it

```bash
$ sed -n '109,121p' lib/src/server/generation_handler.dart
        // Advertise the bind interface so a remote probe (Saropa Lints) can
        // distinguish "up but loopback-only" from "absent": a LAN-IP scan that
        // gets connection-refused otherwise looks identical to no server.
        // See BUG_drift_server_unreachable_by_lan_ip.
        ServerConstants.jsonKeyLoopbackOnly: _ctx.loopbackOnly,
        ServerConstants.jsonKeyCapabilities: _ctx.writeQuery != null
            ? <String>[
                ServerConstants.capabilityIssues,
                ServerConstants.capabilityCellUpdate,
                ServerConstants.capabilityEditsApply,
              ]
            : <String>[ServerConstants.capabilityIssues],
```

`loopbackOnly` was added for the structurally identical problem — "up but unreachable looks identical to absent" — and the same reasoning was not applied to auth. Worse, `loopbackOnly` is itself unreachable in the auth case: a probe that receives 401 never parses the body, so the field it was added for is never seen.

Health is already treated as special one layer down — it is exempt from rate limiting so "monitoring tools are never blocked":

```bash
$ sed -n '160,172p' lib/src/server/router.dart
    // Per-IP rate limiting: check before any handler work. Exempt the
    // long-poll generation endpoint (holds connections by design) and
    // the lightweight health probe so monitoring tools are never blocked.
    final limiter = _rateLimiter;
    if (limiter != null) {
      final bool isExempt =
          path == ServerConstants.pathApiGeneration ||
          path == ServerConstants.pathApiGenerationAlt ||
          path == ServerConstants.pathApiMutations ||
          path == ServerConstants.pathApiMutationsAlt ||
          path == ServerConstants.pathApiHealth ||
          path == ServerConstants.pathApiHealthAlt;
```

The rate limiter exempts health; the auth gate, which runs *before* it, does not.

### Cross-repo proof that the consumer cannot comply

The Saropa Lints discovery probe sends no credentials and bails on any non-OK response:

```bash
$ sed -n '82,94p' D:/src/saropa_lints/extension/src/driftAdvisor/discovery.ts
export async function tryHealth(
  port: number,
  timeoutMs = DEFAULT_TIMEOUT_MS,
  host = '127.0.0.1',
): Promise<DriftServerInfo | null> {
  const baseUrl = `http://${host}:${port}`;
  const url = `${baseUrl}/api/health`;
  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, { signal: controller.signal });
    if (!res.ok) return null;
```

`fetch(url, { signal })` — no `headers`, no `Authorization`. A 401 returns `null`, which `discoverServer` reports as "no server found".

The issues client is the same:

```bash
$ grep -n "fetch(" D:/src/saropa_lints/extension/src/driftAdvisor/client.ts
64:  const res = await fetch(`${baseUrl}${ISSUES_ENDPOINT}`);
76:    fetch(`${baseUrl}${INDEX_SUGGESTIONS_ENDPOINT}`),
77:    fetch(`${baseUrl}${ANOMALIES_ENDPOINT}`),
```

And there is no setting through which a user could supply a token — the integration contributes exactly five keys, none of them credentials:

```bash
$ grep -n "saropaLints.driftAdvisor\." D:/src/saropa_lints/extension/package.json
1509:          "saropaLints.driftAdvisor.integration": {
1514:          "saropaLints.driftAdvisor.hosts": {
1524:          "saropaLints.driftAdvisor.portRange": {
1535:          "saropaLints.driftAdvisor.pollIntervalMs": {
1541:          "saropaLints.driftAdvisor.showInProblems": {
```

So the consumer cannot be fixed from its own side without a protocol change here.

### The configuration this repo recommends is precisely the broken one

```bash
$ sed -n '803,803p' lib/src/server/server_constants.dart
      'Enable: loopbackOnly: false + authToken';

$ sed -n '303,307p' lib/src/start_drift_viewer_extension.dart
    // SECURE DEFAULT: loopback-only bind + no wildcard CORS. This server exposes
    // the whole database; the old `false`/`'*'` defaults made it reachable by any
    // host on the network and readable cross-origin by any website. Opt into a
    // non-loopback bind explicitly (and set authToken) only when needed.
```

The Lints discovery feature exists specifically to reach off-box servers — its own header says so:

```bash
$ sed -n '9,13p' D:/src/saropa_lints/extension/src/driftAdvisor/discovery.ts
 * Hosts are configurable so a Drift Advisor server running off-box — e.g. on a
 * phone reached over the LAN via Wi-Fi debugging, or several devices at once —
 * can be probed directly by IP, not just localhost. A host entry may pin an exact
 * port as "host:port" (probed alone); a bare host is scanned across the range.
```

The one scenario the feature was built for is the one scenario this repo insists must carry an auth token.

---

## Environment

- OS: Windows 11 Pro 10.0.22631
- VS Code version: 1.x (any)
- Extension version: 4.2.5
- Dart package version: `saropa_drift_advisor` 4.2.5
- Saropa Lints extension version: 15.2.8
- Database type and version: any SQLite/Drift database
- Connection method: LAN IP (`loopbackOnly: false`) with `authToken` set
- Relevant non-default settings: `saropaLints.driftAdvisor.integration: true`, `saropaLints.driftAdvisor.hosts: ["<device-ip>"]`
- Other potentially conflicting extensions: none

---

## Steps to Reproduce

1. In the host app, start the server with a token:

   ```dart
   await db.startDriftViewer(
     enabled: true,
     loopbackOnly: false,
     authToken: 'devtoken123',
   );
   ```

2. Confirm the server is genuinely up and the token works:

   ```bash
   curl -s -o /dev/null -w '%{http_code}\n' http://<device-ip>:8642/api/health
   # 401
   curl -s -H 'Authorization: Bearer devtoken123' http://<device-ip>:8642/api/health
   # {"ok":true,...}
   ```

3. In VS Code, set `saropaLints.driftAdvisor.integration` to `true` and `saropaLints.driftAdvisor.hosts` to `["<device-ip>"]`.
4. Run the command **Saropa Lints: Drift Advisor — Refresh** (`saropaLints.driftAdvisor.refresh`) from the Command Palette.

---

## Expected Behavior

Either the probe succeeds — health is a liveness endpoint and can be exempted from auth the way it already is from rate limiting — or the response carries enough information (an `authRequired` flag, or a `WWW-Authenticate` header) that the consumer can report "Drift Advisor found at `<ip>:8642`, requires a token" instead of "no server".

---

## Actual Behavior

The Lints Drift Advisor tree shows its "no server found" placeholder. The user has a healthy, correctly configured, deliberately secured server on the exact host and port they typed in, and the tool reports it does not exist.

---

## Error Output

Nothing is surfaced anywhere.

### VS Code Developer Tools Console

Empty — `tryHealth` swallows everything (`catch { return null; }`).

### Extension Output Channel

No entry on either side. The 401 is discarded before the body is read, so nothing is logged.

### Terminal / Command Output

```bash
$ curl -i -s http://127.0.0.1:8642/api/health | head -3
HTTP/1.1 401 Unauthorized
```

### Stack Traces

None — this is not an exception path.

---

## Duplicate-Emission Check

Not a diagnostic. Single enforcement site (`lib/src/server/router.dart:150`); no TypeScript counterpart (`grep -rn "authToken" extension/src/suite/` → 0 matches).

---

## Screenshots / Recordings

Not applicable — the observable symptom is an empty tree with a placeholder node.

---

## Minimal Reproducible Example

```dart
// Host app — the entire difference between working and broken:
await db.startDriftViewer(enabled: true, authToken: 'x');
```

```bash
# What the Lints probe effectively does:
curl -s -o /dev/null -w '%{http_code}\n' http://127.0.0.1:8642/api/health   # 401 -> "no server"
```

Remove `authToken:` and the same probe returns 200 and the integration lights up.

---

## What I Already Tried

- [x] Confirmed the auth gate runs before the rate-limit exemption block, so health's existing special-casing does not help.
- [x] Confirmed `loopbackOnly` — added for the structurally identical "up but unreachable looks like absent" problem — is unreadable under auth because the probe never parses a 401 body.
- [x] Confirmed the Lints side sends no credentials in `tryHealth` or in any of the three `fetch` calls in `client.ts`, and contributes no setting through which a token could be supplied.
- [x] Confirmed `doc/API.md` documents `capabilities` and `schemaVersion` on health but carries no auth signal.

---

## Regression Info

- Last working version: never worked with auth enabled.
- First broken version: the release that introduced the blanket auth gate in `_dispatch`.
- What changed: auth was applied uniformly to "every request" for safety; discovery was later built on the assumption that health is always answerable. Neither decision is wrong in isolation — the contract between them was never written down.

---

## Root Cause

<!-- Fill in during investigation. -->

Two defensible decisions that were never reconciled: (1) `_dispatch` treats auth as unconditional across all paths, and (2) `/api/health` is the suite's designated liveness and capability-negotiation endpoint, which by definition must be answerable *before* a client knows what credentials to present. There is no `authRequired` field in the health contract, so a client cannot distinguish the three states — absent, present-and-open, present-and-locked — that it must distinguish to behave sensibly.

---

## Changes Made

<!-- Fill in when a fix is written. -->

Suggested shape. This is security-relevant and needs the owner's decision before implementation:

1. Make `/api/health` answer a **reduced** payload without credentials when auth is configured: `{ok, version, schemaVersion, authRequired: true}` and nothing more. Withhold `capabilities`, `endpoints`, `writeEnabled`, `compareEnabled`, `extensionConnected`, and `loopbackOnly` until authenticated, so the unauthenticated response leaks strictly less than the current 401 already reveals by existing. This mirrors the rate-limit exemption rather than inventing a new concept.
2. Document `authRequired` in `doc/API.md` under `GET /api/health`, alongside `capabilities`.
3. Then file a companion issue in `D:/src/saropa_lints/bugs/` requesting a `saropaLints.driftAdvisor.authToken` setting and an `Authorization` header on the four `fetch` calls. That half cannot be done in this repo and must not be attempted here.

Narrower fallback if exempting health is judged unacceptable: keep the 401 but add `WWW-Authenticate: Bearer realm="saropa-drift-advisor"` to the response, which is enough for a consumer to report "found, needs auth", and document that header in `doc/API.md`.

---

## Commits

<!-- Add commit hashes as fixes land. -->

---

## Impact

- Who is affected: every user running an authenticated Advisor server — which is every user following this repo's documented guidance for non-loopback binds, i.e. all physical-device and emulator-over-LAN debugging.
- What is blocked: the entire Saropa Lints → Drift Advisor integration (tree view, Problems publish, refresh, open-in-browser) for those users.
- Data risk: none directly. Indirectly the failure mode pressures users toward the insecure configuration — drop the token so the tooling works — which is the opposite of the intent.
- Frequency: 100% of authenticated servers.
