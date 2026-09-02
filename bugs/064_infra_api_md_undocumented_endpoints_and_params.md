# BUG: `doc/API.md` omits `GET /api/compare/{id}`, the `?slowThresholdMs=` parameter, and points at a file that no longer holds the code

**Status: Open**

Created: 2026-09-02
Component: Documentation / Server
File: `doc/API.md` (lines 567, 1525-1575), `lib/src/server/router.dart` (line 895), `lib/src/server/performance_handler.dart` (line 157)
Severity: Wrong documentation — Medium

---

## Summary

`doc/API.md` is the published HTTP contract (it even carries `**API version:** 4.2.5 (synced with ServerConstants.packageVersion)`), but three things are wrong or missing: `GET /api/compare/{id}` is routed and undocumented; `GET /api/analytics/performance` supports a `?slowThresholdMs=` query parameter and returns a `slowThresholdMs` field, neither of which appears in the endpoint's docs — while the field table hardcodes "Queries exceeding 100 ms" as if the threshold were fixed; and an implementation pointer names `assets/web/app.js` for code that lives in `assets/web/sql-runner.ts`.

---

## Attribution Evidence

Positive — the endpoints and the doc both live in this repo.

Endpoint constants versus documented endpoints. Extracting both sets:

```bash
grep -o "'/api/[a-z0-9/_-]*'" lib/src/server/server_constants.dart | tr -d "'" | sort -u > /tmp/ep_code.txt
grep -oE '^### `(GET|POST|PUT|DELETE) /api/[^`]*`' doc/API.md | sed -E 's/^### `[A-Z]+ //; s/`$//' | sed 's/{[^}]*}/X/g' | sort -u > /tmp/ep_doc.txt
comm -23 /tmp/ep_code.txt /tmp/ep_doc.txt
```

```
/api/compare/
/api/dvr/pause
/api/session/
/api/snapshot/
/api/table/
```

Of these, `/api/dvr/pause` is documented inline (`doc/API.md:1703`), and `/api/session/`, `/api/snapshot/`, `/api/table/` are prefix constants whose parameterised forms *are* documented (`/api/session/{id}`, `/api/snapshot/{id}`, `/api/table/{name}`). `/api/compare/` is the genuine omission — its parameterised form is routed:

```bash
sed -n '892,902p' lib/src/server/router.dart
```

```
    // GET /api/compare/{id} — compare report for a
    // specific snapshot ID (dynamic path prefix match).
    if (path.startsWith(ServerConstants.pathApiComparePrefix) ||
        path.startsWith(ServerConstants.pathApiComparePrefixAlt)) {
      await _compare.handleCompareReport(
        response: response,
        request: request,
        query: query,
      );
      return true;
    }
```

but only `/api/compare/report` appears in the doc:

```bash
grep -n "api/compare" doc/API.md
```

```
184:| `format` | `GET /api/snapshot/compare`, `GET /api/compare/report` | string | — | `download` | Return as downloadable JSON attachment |
1136:### `GET /api/compare/report`
```

The undocumented performance parameter:

```bash
grep -n "slowThresholdMs" lib/src/server/performance_handler.dart
```

```
21:  Future<Map<String, dynamic>> getPerformanceData({int slowThresholdMs = 100}) {
87:      'slowThresholdMs': slowThresholdMs,
157:  /// Accepts optional `?slowThresholdMs=<int>` query parameter to
166:      final thresholdParam = requestUri?.queryParameters['slowThresholdMs'];
170:      final data = await getPerformanceData(slowThresholdMs: threshold);
```

```bash
grep -n "slowThresholdMs" doc/API.md
# Expected: 0 matches
```

Zero matches, while the field table asserts a fixed threshold:

```bash
grep -n "Queries exceeding" doc/API.md
```

```
| `slowQueries` | array | Queries exceeding 100 ms, sorted by duration desc (max 20) |
```

The stale implementation pointer:

```bash
sed -n '567p' doc/API.md && grep -rn "applySqlFromQueryString" assets/web/*.ts
```

```
**Implementation:** `assets/web/app.js` (`applySqlFromQueryString` inside `initSqlRunner`).
assets/web/sql-runner.ts:621:  (function applySqlFromQueryString(): void {
```

Also note a dead constant surfaced by the same audit — `pathApiCompareReport` is defined but never referenced by the router, because `/api/compare/report` is absorbed by the `/api/compare/` prefix branch:

```bash
grep -n "pathApiCompareReport" lib/src/server/server_constants.dart lib/src/server/router.dart
```

```
lib/src/server/server_constants.dart:134:  static const String pathApiCompareReport = '/api/compare/report';
lib/src/server/server_constants.dart:135:  static const String pathApiCompareReportAlt = 'api/compare/report';
```

No `router.dart` match — the constant is unused.

Negative attribution — this API doc belongs to `saropa_drift_advisor`:

```bash
grep -rn "api/compare" ../saropa_lints/ ../saropa_dart_utils/
# Expected: 0 matches
```

**Emit site(s):** `doc/API.md:567` (stale pointer), `doc/API.md:1525-1575` (missing parameter + wrong fixed-threshold claim), `doc/API.md` (missing `GET /api/compare/{id}` section), `lib/src/server/server_constants.dart:134-135` (unused constant).

---

## Environment

- OS: any
- VS Code version: n/a
- Extension version: 4.2.5
- Dart SDK version: as pinned by `pubspec.yaml`
- Flutter SDK version: any
- Database type and version: SQLite via Drift 2.31
- Connection method: HTTP to `127.0.0.1:8642`
- Relevant non-default settings: none
- Other potentially conflicting extensions: none

---

## Steps to Reproduce

1. Open `doc/API.md` and search for `slowThresholdMs`. Note zero occurrences.
2. Read the `slowQueries` row of the `GET /api/analytics/performance` field table: "Queries exceeding 100 ms".
3. Against a running server, request the endpoint with a threshold and compare.

---

## Expected Behavior

The doc lists `?slowThresholdMs=<int>` under the endpoint's parameters, documents the `slowThresholdMs` echo field, describes `slowQueries` as "queries exceeding the requested threshold (default 100 ms)", carries a section for `GET /api/compare/{id}`, and points at the file that actually contains `applySqlFromQueryString`.

---

## Actual Behavior

An integrator reading `doc/API.md` cannot discover the threshold parameter at all, and is told the cutoff is a fixed 100 ms. They also cannot discover `GET /api/compare/{id}`, and following the `assets/web/app.js` pointer finds nothing (the symbol moved to `sql-runner.ts` in the esbuild migration).

---

## Error Output

### Terminal / Command Output

```
curl -s "http://127.0.0.1:8642/api/analytics/performance?slowThresholdMs=2000" | grep -o '"slowThresholdMs":[0-9]*'
```

Returns `"slowThresholdMs":2000` — a documented-nowhere parameter that demonstrably changes the response.

### VS Code Developer Tools Console

n/a.

### Extension Output Channel

n/a.

### Stack Traces

None.

---

## Duplicate-Emission Check

n/a — documentation gap, not a diagnostic. The endpoint-set comparison above enumerates every routed path against every documented path, so the omission list is complete rather than anecdotal.

---

## Screenshots / Recordings

Not attached — the `comm` diff and greps above are the evidence.

---

## Minimal Reproducible Example

```bash
grep -c "slowThresholdMs" doc/API.md          # 0
grep -c "slowThresholdMs" lib/src/server/performance_handler.dart   # 5
```

---

## What I Already Tried

- [x] Enumerated all `/api/...` constants and all `### \`METHOD /api/...\`` headings and diffed them, rather than spot-checking.
- [x] Verified each apparent omission individually: `/api/dvr/pause` is documented inline at line 1703; the `/api/session/`, `/api/snapshot/`, `/api/table/` prefixes have documented parameterised forms; `/api/compare/` does not.
- [x] Confirmed `applySqlFromQueryString` exists at exactly one site, `assets/web/sql-runner.ts:621`.

---

## Regression Info

- Last working version: the `app.js` pointer was correct before the esbuild/TypeScript migration split `app.js` into modules.
- First broken version: present in 4.2.5.
- What changed: `?slowThresholdMs=` was added for the web viewer's performance panel without a doc update; the compare-by-id route was added as a prefix branch without a doc section; the viewer was modularised without repointing doc references.

---

## Root Cause

`scripts/modules/target_config.py` syncs only the **version string** inside `doc/API.md` (`sync_api_md_version`). Nothing verifies that the set of documented endpoints matches the set of routed endpoints, or that implementation pointers resolve, so additions and refactors drift the doc silently.

---

## Changes Made

<!-- Fill in when a fix is written. -->

---

## Commits

<!-- Add commit hashes as fixes land. -->

---

## Impact

- **Who is affected:** third-party integrators and the sibling-extension consumers the README points at `doc/API.md`.
- **What is blocked:** discovering the threshold parameter (which is the fix path for `bugs/033_infra_slow_query_threshold_default_mismatch.md`) and the per-snapshot compare route.
- **Data risk:** none.
- **Frequency:** continuous.

---

## Fix Sketch

1. Add a `### GET /api/compare/{id}` section to `doc/API.md` next to `/api/compare/report`, noting that `report` is served by the same prefix handler.
2. In the `GET /api/analytics/performance` section, add a parameters table row for `slowThresholdMs` (int, optional, default 100), add `slowThresholdMs` to the response field table, and change the `slowQueries` description from "Queries exceeding 100 ms" to "Queries exceeding the requested `slowThresholdMs` (default 100)".
3. Repoint `doc/API.md:567` to `assets/web/sql-runner.ts` (`applySqlFromQueryString`).
4. Either wire `ServerConstants.pathApiCompareReport` into an explicit router branch ahead of the prefix match, or delete the unused constant pair — a constant no code reads is a trap for the next reader.
5. Add a cheap doc gate to `scripts/publish.py`: extract routed `/api/...` constants and documented `### \`METHOD /api/...\`` headings and fail on any routed path with no documentation entry. The extraction is two greps, as shown above.
