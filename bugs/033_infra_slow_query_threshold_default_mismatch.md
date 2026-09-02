# BUG: `driftViewer.performance.slowThresholdMs` (500) never reaches the server, which uses 100 — three surfaces disagree on what "slow" means

**Status: Open**

Created: 2026-09-02
Component: Extension / Server
File: `extension/src/api-client-http-analytics.ts` (line 64), `lib/src/server/performance_handler.dart` (line 21), `extension/package.json` (`driftViewer.performance.slowThresholdMs`)
Severity: Wrong result / Config mismatch — Medium

---

## Summary

`GET /api/analytics/performance` accepts a `?slowThresholdMs=` query parameter and defaults to **100 ms** when it is absent. The extension's HTTP client never sends the parameter, so every extension surface that reads `perf.slowQueries` gets the server's 100 ms classification — while the user-facing setting `driftViewer.performance.slowThresholdMs` defaults to **500** and is honoured only on two unrelated code paths (the log-capture bridge and the DVR panel). The web viewer sends the parameter, defaulting to 100. Result: the same server data is labelled "slow" by three different rules, and changing the documented setting has no effect on the panel that most obviously shows slow queries.

---

## Attribution Evidence

Positive — every surface lives in this repo.

Server default is 100 ms and the parameter is supported:

```bash
grep -n "slowThresholdMs" lib/src/server/performance_handler.dart
```

```
19:  /// [slowThresholdMs] controls the minimum duration (in ms) for a query
21:  Future<Map<String, dynamic>> getPerformanceData({int slowThresholdMs = 100}) {
53:        userTimings.where((t) => t.durationMs > slowThresholdMs).toList()
87:      'slowThresholdMs': slowThresholdMs,
157:  /// Accepts optional `?slowThresholdMs=<int>` query parameter to
166:      final thresholdParam = requestUri?.queryParameters['slowThresholdMs'];
170:      final data = await getPerformanceData(slowThresholdMs: threshold);
```

The extension's client omits the parameter:

```bash
sed -n '59,69p' extension/src/api-client-http-analytics.ts
```

```
export async function httpPerformance(
  baseUrl: string,
  headers: ApiHeaders,
): Promise<PerformanceData> {
  const resp = await fetchWithRetry(`${baseUrl}/api/analytics/performance`, {
    headers,
  });
  if (!resp.ok) throw new Error(`Performance query failed: ${resp.status}`);
  return resp.json() as Promise<PerformanceData>;
}
```

No caller can supply it either — the signature has no threshold argument, and `api-client.ts:191` forwards only `baseUrl` and headers:

```bash
grep -rn "httpPerformance\|getSlowPatterns" extension/src/ | grep -v test
```

```
extension/src/api-client-http-analytics.ts:60:export async function httpPerformance(
extension/src/api-client-http-impl.ts:17:  httpPerformance,
extension/src/api-client.ts:191:    return http.httpPerformance(this._baseUrl, this._headers());
extension/src/engines/query-intelligence.ts:90:  async getSlowPatterns(thresholdMs = 100): Promise<IQueryPattern[]> {
```

`getSlowPatterns` hardcodes a fourth copy of `100` rather than reading the setting, and has no caller passing a value.

The setting's declared default is 500:

```bash
python -c "import json;p=json.load(open('extension/package.json',encoding='utf8'));c=p['contributes']['configuration'];pr=c['properties'] if isinstance(c,dict) else {k:v for s in c for k,v in s.get('properties',{}).items()};print(pr['driftViewer.performance.slowThresholdMs'])"
```

```
{'type': 'number', 'default': 500, 'description': '%config.performance.slowThresholdMs.description%'}
```

…and it is read on only two paths, neither of which is the performance panel:

```bash
grep -rn "slowThresholdMs" extension/src/ | grep -v test
```

```
extension/src/debug/log-capture-bridge.ts:62:    const slowMs = cfg.get<number>('performance.slowThresholdMs', 500) ?? 500;
extension/src/debug/perf-regression-detector.ts:146:  slowThresholdMs: number,
extension/src/dvr/dvr-panel-actions.ts:76:      vscode.workspace.getConfiguration('driftViewer.performance').get<number>('slowThresholdMs', 500) ??
```

The web viewer *does* send it, with its own default of 100:

```bash
grep -n "slowThresholdMs" assets/web/performance.ts && grep -n "PREF_SLOW_QUERY_THRESHOLD" assets/web/settings.ts
```

```
assets/web/performance.ts:41:    fetch('/api/analytics/performance?slowThresholdMs=' + threshold, S.authOpts())
assets/web/settings.ts:117:export const PREF_SLOW_QUERY_THRESHOLD = 'slowQueryThreshold';
assets/web/settings.ts:142:  [PREF_SLOW_QUERY_THRESHOLD]: 100,
```

Negative attribution — this setting is not defined by a sibling package:

```bash
grep -rn "slowThresholdMs" ../saropa_lints/lib/ ../saropa_dart_utils/lib/
# Expected: 0 matches
```

**Emit site(s):** `lib/src/server/performance_handler.dart:21` (server default 100), `extension/src/api-client-http-analytics.ts:64` (parameter omitted), `extension/src/engines/query-intelligence.ts:90` (hardcoded 100), `extension/package.json` (`driftViewer.performance.slowThresholdMs` default 500), `assets/web/settings.ts:142` (web default 100).

---

## Environment

- OS: any
- VS Code version: `^1.115.0`
- Extension version: 4.2.5
- Dart SDK version: as pinned by `pubspec.yaml`
- Flutter SDK version: any
- Database type and version: SQLite via Drift 2.31
- Connection method: HTTP to `127.0.0.1:8642` (the VM Service path has the same gap — `vm-service-client.ts:272` `getPerformance()` takes no threshold either)
- Relevant non-default settings: `"driftViewer.performance.slowThresholdMs": 2000`
- Other potentially conflicting extensions: none

---

## Steps to Reproduce

1. Start from a clean state; run the example app so the server binds 8642.
2. Set `"driftViewer.performance.slowThresholdMs": 2000` in `settings.json`.
3. Cause queries taking between 100 ms and 2000 ms (e.g. a full scan over a seeded table).
4. Open the Drift Advisor performance surface from the sidebar (mouse click), which reads `perf.slowQueries`.

---

## Expected Behavior

With the threshold at 2000 ms, only queries slower than 2 s are listed as slow — the setting's description says exactly that.

---

## Actual Behavior

Every query over 100 ms is listed. The setting has no effect on this surface at all: the request URL is `/api/analytics/performance` with no query string, and the server applies its own 100 ms default. The `slowThresholdMs` field echoed back in the response body (`performance_handler.dart:87`) reads `100`, contradicting the user's configured 2000.

Meanwhile the DVR panel (`dvr-panel-actions.ts:76`) and the log-capture bridge (`log-capture-bridge.ts:62`) *do* honour 2000 — so two panels in the same window disagree about which queries are slow.

---

## Error Output

### VS Code Developer Tools Console

Nothing — the request succeeds with HTTP 200.

### Extension Output Channel

Nothing.

### Terminal / Command Output

The divergence is directly observable against a running server:

```
curl -s "http://127.0.0.1:8642/api/analytics/performance"                  | grep -o '"slowThresholdMs":[0-9]*'
curl -s "http://127.0.0.1:8642/api/analytics/performance?slowThresholdMs=2000" | grep -o '"slowThresholdMs":[0-9]*'
```

The first echoes `"slowThresholdMs":100`, the second `"slowThresholdMs":2000`, with correspondingly different `slowQueries` arrays.

### Stack Traces

None.

---

## Duplicate-Emission Check

Four independent definitions of "slow" for the same data:

| Surface | Value | Site |
|---|---|---|
| Dart server default | 100 | `lib/src/server/performance_handler.dart:21` |
| Web viewer preference default | 100 | `assets/web/settings.ts:142` (sent as `?slowThresholdMs=`) |
| Extension setting default | 500 | `extension/package.json` `driftViewer.performance.slowThresholdMs` |
| `getSlowPatterns` fallback | 100 | `extension/src/engines/query-intelligence.ts:90` |

---

## Screenshots / Recordings

Not attached — the two `curl` invocations above are reproducible evidence.

---

## Minimal Reproducible Example

```bash
curl -s "http://127.0.0.1:8642/api/analytics/performance" | python -c "import sys,json;d=json.load(sys.stdin);print('server used', d['slowThresholdMs'], 'slowQueries', len(d['slowQueries']))"
```

Prints `server used 100 …` regardless of any value set in `settings.json`.

---

## What I Already Tried

- [x] Traced every caller of `httpPerformance` — no call site can supply a threshold; the signature does not accept one.
- [x] Checked the VM Service path (`extension/src/transport/vm-service-client.ts:272`) — `getPerformance()` likewise takes no threshold, so switching transports does not help.
- [x] Confirmed the setting *is* wired on the DVR and log-capture paths, which is why the mismatch is easy to miss.

---

## Regression Info

- Last working version: unknown; the parameter support in `performance_handler.dart` and the `default: 500` setting appear to have been added independently.
- First broken version: present in 4.2.5.
- What changed: `?slowThresholdMs=` was added for the web viewer; the extension client was never updated, and the setting default was chosen (500) without matching the server default (100).

---

## Root Cause

The threshold is a request-time parameter on the server but a client-side constant on the extension. `httpPerformance` was written before the parameter existed and its signature was never extended, so the setting could not be plumbed through even if a caller wanted to. The default values were then chosen independently on each surface, with no single source of truth.

---

## Changes Made

<!-- Fill in when a fix is written. -->

---

## Commits

<!-- Add commit hashes as fixes land. -->

---

## Impact

- **Who is affected:** every extension user who adjusts `driftViewer.performance.slowThresholdMs`, and every user comparing the extension panel against the browser viewer or the DVR panel.
- **What is blocked:** tuning slow-query noise. The setting is documented and discoverable but inert on its most obvious surface.
- **Data risk:** none. Misclassification only.
- **Frequency:** every performance fetch.

---

## Fix Sketch

1. Extend the client signature and pass the value through:

   ```ts
   // The server treats slowThresholdMs as a request parameter (default 100 ms).
   // Omitting it made the user's driftViewer.performance.slowThresholdMs setting
   // inert on this path, so the panel and the DVR panel disagreed about "slow".
   export async function httpPerformance(
     baseUrl: string,
     headers: ApiHeaders,
     slowThresholdMs?: number,
   ): Promise<PerformanceData> {
     const q = slowThresholdMs ? `?slowThresholdMs=${slowThresholdMs}` : '';
     const resp = await fetchWithRetry(`${baseUrl}/api/analytics/performance${q}`, { headers });
     ...
   }
   ```

   and read the setting once in `api-client.ts:190-191`, covering both the HTTP and VM Service branches.
2. Add the same parameter to `VmServiceClient.getPerformance()` so transport choice does not change results.
3. Reconcile the defaults to one number. `ServerConstants` is the established home for shared thresholds; publish it in the `/api/health` payload or hardcode the same value in `extension/package.json`, `assets/web/settings.ts:142` and `query-intelligence.ts:90`, with a comment naming the canonical source.
4. Document the parameter in `doc/API.md` — it is currently undocumented; see `bugs/064_infra_api_md_undocumented_endpoints_and_params.md`.
