<!--
  Archived 2026-04-30: MVP + integration shipped; unified timeline remains deferred. Stub: ../../../../26-query-replay-dvr.md
-->

# Feature 26: Query Replay DVR

## What It Does

Record every SQL query your app executes during a debug session — with timestamps, bound parameters, execution time, and affected rows. Then scrub through them like a video timeline, stepping forward and back to see the database state at each point. Find "which query corrupted this row?" instantly.

## User Experience

### 1. Recording

1. Start a debug session — recording begins automatically (configurable)
2. A status bar item shows: "DVR: Recording (47 queries)"
3. Click the status bar item → opens the DVR panel

### 2. DVR Panel

```
╔═══════════════════════════════════════════════════════════╗
║  QUERY REPLAY DVR                    [⏸ Pause] [⏹ Stop]  ║
╠═══════════════════════════════════════════════════════════╣
║                                                           ║
║  Timeline: ◀ ││◀ [====|====================] ▶│││ ▶      ║
║            #23 of 147 queries          10:42:31.004       ║
║                                                           ║
║  ┌─ Current Query ──────────────────────────────────────┐║
║  │  #23  10:42:31.004  (2.1ms)  UPDATE                  ║
║  │                                                       ║
║  │  UPDATE "users" SET "name" = 'Alice Smith'            ║
║  │  WHERE "id" = 42                                      ║
║  │                                                       ║
║  │  Affected: 1 row                                      ║
║  └───────────────────────────────────────────────────────┘║
║                                                           ║
║  ┌─ State at this point ────────────────────────────────┐║
║  │  users: 1,250 rows  │  orders: 3,401 rows            ║
║  │                                                       ║
║  │  Changed row (users.id=42):                           ║
║  │    name: "Alice" → "Alice Smith"  ← this query        ║
║  │    email: alice@example.com       (unchanged)         ║
║  └───────────────────────────────────────────────────────┘║
║                                                           ║
║  ┌─ Search ─────────────────────────────────────────────┐║
║  │  [Find query that changed users.id=42.name          ]║
║  └───────────────────────────────────────────────────────┘║
║                                                           ║
║  [Export Recording]  [Open in SQL Notebook]               ║
╚═══════════════════════════════════════════════════════════╝
```

### 3. Navigation

- **Step forward/back**: Arrow keys or `◀ ▶` buttons move one query at a time
- **Jump to start/end**: `Home`/`End` keys
- **Scrub**: Click anywhere on the timeline bar
- **Search**: "Find the query that changed `users.id=42.name`" — jumps to the exact query
- **Filter**: Show only writes (INSERT/UPDATE/DELETE) or only reads, or only specific tables

### 4. State Inspection

At each query position, the panel shows:
- The SQL that was executed
- Execution time
- Number of affected rows
- Before/after state for the affected rows (for writes)
- Table row counts at that point in time

## New Files

### Server-Side (Dart)

```
lib/src/server/
  dvr_handler.dart            # GET /api/dvr/* endpoints
lib/src/
  query_recorder.dart         # Records all queries passing through the callback
```

### Extension-Side (TypeScript)

```
extension/src/
  dvr/
    dvr-panel.ts              # Webview panel with timeline UI
    dvr-html.ts               # HTML/CSS/JS template
    dvr-client.ts             # Fetches recording data from server
    dvr-types.ts              # Shared interfaces
    dvr-search.ts             # Search/filter logic over recorded queries
extension/src/test/
  dvr-search.test.ts
```

## Dependencies

- Server: `server_context.dart` — intercepts `instrumentedQuery` and `writeQuery`
- Extension: `api-client.ts` — new DVR endpoints
- Extension: `generation-watcher.ts` — triggers panel refresh

## Architecture

### Data Model Stability Contract (Non-Negotiable)

Data models in this feature are expected to evolve frequently. The implementation must be resilient to schema drift from day 1.

**Rules:**
- Every DVR payload is versioned with `schemaVersion` (starting at `1`).
- The server only **adds** fields in minor iterations; never rename/remove in-place.
- Unknown fields must be ignored by clients (TypeScript side uses tolerant parsing).
- Missing optional fields must be handled with safe defaults in UI rendering.
- Breaking changes require `schemaVersion` bump and a compatibility adapter in `dvr-client.ts`.
- Recorded entries are immutable event records; derived UI fields are computed client-side.

**Base envelope for all DVR responses:**

```json
{
  "schemaVersion": 1,
  "generatedAt": "2026-04-30T13:42:31.004Z",
  "data": {}
}
```

**RecordedQuery V1 contract (stable core):**
- `id` (number, monotonic session-local)
- `sequence` (number, zero-based timeline position at record time)
- `sessionId` (string, UUID generated at recording start)
- `sql` (string)
- `params` (array/object, normalized bound parameter values when available)
- `type` (`select|insert|update|delete|other`)
- `timestamp` (ISO string)
- `durationMs` (number)
- `affectedRowCount` (number, for writes; `0` for reads)
- `resultRowCount` (number, for reads; `0` for writes)
- `table` (string | null)
- `beforeState` (array of row objects | null)
- `afterState` (array of row objects | null)
- `meta` (object, optional extensibility bucket for future fields)

This split between `affectedRowCount` and `resultRowCount` avoids ambiguous row-count semantics across unstable callback contracts.

**Session identity rule:**
- `id` uniqueness is guaranteed only within one `sessionId`.
- Any cross-session references must use `(sessionId, id)` tuples.

### Implementation-Ready Contract Definitions

These signatures are the source of truth for implementation. No implicit SQL parsing is allowed for bound parameters.

```dart
/// JSON-safe value transported across API boundaries.
typedef DvrJsonValue = Object?; // null, bool, num, String, List, Map

/// Positional or named SQL bindings captured from execution callback.
class DvrBindings {
  final List<DvrJsonValue> positional;
  final Map<String, DvrJsonValue> named;

  const DvrBindings({
    this.positional = const [],
    this.named = const {},
  });

  Map<String, Object?> toJson() => {
    'positional': positional,
    'named': named,
  };
}

/// Read callback contract supplied by server_context.
typedef DriftDebugReadQueryWithBindings = Future<List<Map<String, Object?>>> Function(
  String sql,
  DvrBindings bindings,
);

/// Write callback contract supplied by server_context.
typedef DriftDebugWriteQueryWithBindings = Future<int> Function(
  String sql,
  DvrBindings bindings,
);
```

```typescript
/** Versioned API envelope shared by all DVR endpoints. */
export interface IDvrEnvelope<T> {
  schemaVersion: number;
  generatedAt: string; // ISO-8601
  data: T;
  error?: string;
  message?: string;
}

/** Stable query model used by panel/search/timeline. */
export interface IRecordedQueryV1 {
  sessionId: string;
  id: number;
  sequence: number;
  sql: string;
  params: {
    positional: unknown[];
    named: Record<string, unknown>;
  };
  type: 'select' | 'insert' | 'update' | 'delete' | 'other';
  timestamp: string;
  durationMs: number;
  affectedRowCount: number;
  resultRowCount: number;
  table: string | null;
  beforeState: Array<Record<string, unknown>> | null;
  afterState: Array<Record<string, unknown>> | null;
  meta?: Record<string, unknown>;
}
```

**Binding normalization rules (required):**
- All bindings must be converted to JSON-safe values before serialization.
- Unsupported runtime values are converted to string markers (`"[unsupported:<type>]"`) rather than throwing.
- Binary/blob bindings are represented as `{ "__kind": "blob", "byteLength": N, "previewBase64": "..." }` with preview capped.
- Large strings are truncated for transport (`maxParamStringLength`) with `meta.truncated=true`.
- Parameter capture is never derived by SQL string parsing; only callback-provided bindings are canonical.

### Server-Side: Query Recorder

Wraps both read and write query callbacks to capture every query:

```dart
class QueryRecorder {
  final List<RecordedQuery> _queries = [];
  bool _recording = false;
  int _nextId = 0;
  int _maxQueries;
  bool _captureBeforeAfter;

  QueryRecorder({
    int maxQueries = 5000,
    bool captureBeforeAfter = true,
  })  : _maxQueries = maxQueries,
        _captureBeforeAfter = captureBeforeAfter;

  bool get isRecording => _recording;
  int get queryCount => _queries.length;

  void startRecording() {
    _recording = true;
    _queries.clear();
    _nextId = 0;
    _sessionId = _uuid.v4();
  }

  void stopRecording() {
    _recording = false;
  }

  void updateConfig({
    int? maxQueries,
    bool? captureBeforeAfter,
  }) {
    if (maxQueries != null && maxQueries > 0) {
      _maxQueries = maxQueries;
      // Trim immediately if max reduced mid-session.
      while (_queries.length > _maxQueries) {
        _queries.removeAt(0);
      }
    }
    if (captureBeforeAfter != null) {
      _captureBeforeAfter = captureBeforeAfter;
    }
  }

  /// Wraps a read query to record SQL, bindings, and result metadata.
  Future<List<Map<String, dynamic>>> recordRead(
    String sql,
    DvrBindings bindings,
    DriftDebugReadQueryWithBindings originalQuery,
  ) async {
    final start = DateTime.now();
    final result = await originalQuery(sql);
    final elapsed = DateTime.now().difference(start);

    if (_recording) {
      _record(RecordedQuery(
        id: _nextId++,
        sequence: _nextId - 1,
        sessionId: _sessionId,
        sql: sql,
        params: bindings.toJson(),
        type: _classifySql(sql),
        timestamp: start,
        durationMs: elapsed.inMicroseconds / 1000.0,
        resultRowCount: result.length,
        affectedRowCount: 0,
        resultPreview: result.take(5).toList(),
      ));
    }

    return result;
  }

  /// Wraps a write query to record SQL, bindings, and before/after state.
  Future<int> recordWrite(
    String sql,
    DvrBindings bindings,
    DriftDebugWriteQueryWithBindings originalWrite,
    DriftDebugReadQueryWithBindings readQuery,
  ) async {
    List<Map<String, dynamic>>? beforeState;
    final parsed = _parseMutation(sql);

    // Capture before state
    if (_recording && _captureBeforeAfter && parsed != null && parsed.type != QueryType.insert) {
      try {
        beforeState = await readQuery(
          'SELECT * FROM "${parsed.table}" WHERE ${parsed.whereClause} LIMIT 10',
        );
      } catch (_) {
        // Best effort — don't fail the write
      }
    }

    final start = DateTime.now();
    final affectedRows = await originalWrite(sql);
    final elapsed = DateTime.now().difference(start);

    List<Map<String, dynamic>>? afterState;
    if (_recording && _captureBeforeAfter && parsed != null && parsed.type != QueryType.delete) {
      try {
        if (parsed.type == QueryType.insert) {
          afterState = await readQuery(
            'SELECT * FROM "${parsed.table}" ORDER BY rowid DESC LIMIT 1',
          );
        } else {
          afterState = await readQuery(
            'SELECT * FROM "${parsed.table}" WHERE ${parsed.whereClause} LIMIT 10',
          );
        }
      } catch (_) {}
    }

    if (_recording) {
      _record(RecordedQuery(
        id: _nextId++,
        sequence: _nextId - 1,
        sessionId: _sessionId,
        sql: sql,
        params: bindings.toJson(),
        type: _classifySql(sql),
        timestamp: start,
        durationMs: elapsed.inMicroseconds / 1000.0,
        affectedRowCount: affectedRows,
        resultRowCount: 0,
        beforeState: beforeState,
        afterState: afterState,
        table: parsed?.table,
      ));
    }

    return affectedRows;
  }

  void _record(RecordedQuery query) {
    _queries.add(query);
    if (_queries.length > _maxQueries) {
      _queries.removeAt(0);
    }
  }
}
```

If mutation parsing fails, recording still proceeds with core fields (`sql`, `type`, timing, row counts) and `beforeState/afterState = null`. Parsing failure must never block query execution.
If bindings are unavailable from callback metadata, recorder must store empty bindings (`{ positional: [], named: {} }`) and set `meta.bindingsUnavailable = true`.

### Server-Side: DVR Handler

```dart
class DvrHandler {
  final QueryRecorder _recorder;

  /// GET /api/dvr/status
  /// Returns envelope with recording status and current query window bounds.
  Future<void> handleStatus(HttpRequest request, HttpResponse response) async {
    _ctx.setJsonHeaders(response);
    response.write(jsonEncode({
      'schemaVersion': 1,
      'generatedAt': DateTime.now().toIso8601String(),
      'data': {
        'recording': _recorder.isRecording,
        'queryCount': _recorder.queryCount,
        'minAvailableId': _recorder.minAvailableId,
        'maxAvailableId': _recorder.maxAvailableId,
      }
    }));
    await response.close();
  }

  /// POST /api/dvr/start
  Future<void> handleStart(HttpRequest request, HttpResponse response) async {
    _recorder.startRecording();
    response.statusCode = HttpStatus.ok;
    await response.close();
  }

  /// POST /api/dvr/stop
  Future<void> handleStop(HttpRequest request, HttpResponse response) async {
    _recorder.stopRecording();
    response.statusCode = HttpStatus.ok;
    await response.close();
  }

  /// POST /api/dvr/pause
  /// Stops recording without clearing already captured timeline data.
  Future<void> handlePause(HttpRequest request, HttpResponse response) async {
    _recorder.stopRecording();
    response.statusCode = HttpStatus.ok;
    await response.close();
  }

  /// GET /api/dvr/queries?cursor=<id>&limit=100&direction=forward
  /// Returns a cursor page of recorded queries (stable under ring-buffer eviction).
  Future<void> handleQueries(HttpRequest request, HttpResponse response) async {
    final cursor = int.tryParse(request.uri.queryParameters['cursor'] ?? '-1') ?? -1;
    final limit = int.tryParse(request.uri.queryParameters['limit'] ?? '100') ?? 100;
    final direction = request.uri.queryParameters['direction'] ?? 'forward';
    final page = _recorder.queriesPage(cursor: cursor, limit: limit, direction: direction);
    _ctx.setJsonHeaders(response);
    response.write(jsonEncode({
      'schemaVersion': 1,
      'generatedAt': DateTime.now().toIso8601String(),
      'data': {
        'queries': page.items.map((q) => q.toJson()).toList(),
        'total': _recorder.queryCount,
        'minAvailableId': _recorder.minAvailableId,
        'maxAvailableId': _recorder.maxAvailableId,
        'nextCursor': page.nextCursor,
        'prevCursor': page.prevCursor,
      }
    }));
    await response.close();
  }

  /// GET /api/dvr/query/:sessionId/:id
  /// Returns a single query with full before/after state.
  Future<void> handleQuery(HttpRequest request, HttpResponse response, String sessionId, int id) async {
    final query = _recorder.queryBySessionAndId(sessionId, id);
    if (query == null) {
      response.statusCode = HttpStatus.notFound;
      _ctx.setJsonHeaders(response);
      response.write(jsonEncode({
        'schemaVersion': 1,
        'generatedAt': DateTime.now().toIso8601String(),
        'error': 'QUERY_NOT_AVAILABLE',
        'message': 'Query id is outside current ring buffer window.',
        'data': {
          'sessionId': sessionId,
          'requestedId': id,
          'minAvailableId': _recorder.minAvailableId,
          'maxAvailableId': _recorder.maxAvailableId,
        }
      }));
      await response.close();
      return;
    }
    _ctx.setJsonHeaders(response);
    response.write(jsonEncode({
      'schemaVersion': 1,
      'generatedAt': DateTime.now().toIso8601String(),
      'data': query.toJson(),
    }));
    await response.close();
  }
}
```

### Extension-Side: DVR Search

```typescript
interface IDvrSearchResult {
  queryId: number;
  matchType: 'table' | 'column' | 'value' | 'sql';
  highlight: string;
}

class DvrSearch {
  search(queries: IRecordedQuery[], term: string): IDvrSearchResult[] {
    const results: IDvrSearchResult[] = [];
    const lower = term.toLowerCase().trim();
    if (!lower) {
      return [];
    }

    for (const q of queries) {
      // Match in SQL text
      if (q.sql.toLowerCase().includes(lower)) {
        results.push({ queryId: q.id, matchType: 'sql', highlight: q.sql });
      }

      // Match in table name
      if (q.table?.toLowerCase().includes(lower)) {
        results.push({ queryId: q.id, matchType: 'table', highlight: q.table });
      }

      // Match in before/after state values
      for (const row of [...(q.beforeState ?? []), ...(q.afterState ?? [])]) {
        for (const [col, val] of Object.entries(row)) {
          if (String(val).toLowerCase().includes(lower) || col.toLowerCase().includes(lower)) {
            results.push({ queryId: q.id, matchType: 'value', highlight: `${col}: ${val}` });
            break; // one match per row is enough
          }
        }
      }
    }

    // Deduplicate by query + match type + highlight to keep result list stable.
    return [...new Map(results.map(r => [`${r.queryId}:${r.matchType}:${r.highlight}`, r])).values()];
  }
}
```

### Data Flow

```
App executes SQL query (+ bound params)
    │
    ▼
QueryRecorder.recordRead(sql, bindings, ...) / recordWrite(sql, bindings, ...)
    │
    ├── Capture before state (writes only)
    ├── Execute original query
    ├── Capture after state (writes only)
    ├── Store RecordedQuery in ring buffer
    │
    ▼
GET /api/dvr/queries?cursor=C&limit=L&direction=forward
    │
    ▼
DVR Panel renders timeline
    │
    ├── User scrubs to query #23
    │
    ▼
GET /api/dvr/query/{sessionId}/23
    │
    ▼
Panel shows SQL + before/after state
```

## package.json Contributions

```jsonc
{
  "contributes": {
    "commands": [
      {
        "command": "driftViewer.openDvr",
        "title": "Saropa Drift Advisor: Open Query Replay DVR",
        "icon": "$(record)"
      },
      {
        "command": "driftViewer.dvrStartRecording",
        "title": "Saropa Drift Advisor: Start DVR Recording"
      },
      {
        "command": "driftViewer.dvrStopRecording",
        "title": "Saropa Drift Advisor: Stop DVR Recording"
      }
    ],
    "menus": {
      "view/title": [{
        "command": "driftViewer.openDvr",
        "when": "view == driftViewer.databaseExplorer && driftViewer.serverConnected && inDebugMode",
        "group": "navigation"
      }]
    },
    "configuration": {
      "properties": {
        "driftViewer.dvr.autoRecord": {
          "type": "boolean",
          "default": true,
          "description": "Automatically start recording when a debug session begins."
        },
        "driftViewer.dvr.maxQueries": {
          "type": "number",
          "default": 5000,
          "description": "Maximum number of queries to store in the DVR buffer."
        },
        "driftViewer.dvr.captureBeforeAfter": {
          "type": "boolean",
          "default": true,
          "description": "Capture row state before and after write queries (adds overhead)."
        }
      }
    }
  }
}
```

## Wiring in extension.ts

```typescript
context.subscriptions.push(
  vscode.commands.registerCommand('driftViewer.openDvr', () => {
    DvrPanel.createOrShow(context.extensionUri, client);
  }),

  vscode.commands.registerCommand('driftViewer.dvrStartRecording', async () => {
    await client.dvrStart();
    dvrStatusBarItem.text = '$(record) DVR: Recording';
  }),

  vscode.commands.registerCommand('driftViewer.dvrStopRecording', async () => {
    await client.dvrStop();
    dvrStatusBarItem.text = '$(circle-slash) DVR: Stopped';
  })
);

// Status bar item
const dvrStatusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 50);
dvrStatusBarItem.command = 'driftViewer.openDvr';
context.subscriptions.push(dvrStatusBarItem);

// Auto-record on debug start
if (vscode.workspace.getConfiguration('driftViewer.dvr').get('autoRecord', true)) {
  context.subscriptions.push(
    vscode.debug.onDidStartDebugSession(async (session) => {
      // Only auto-record for supported debug sessions started in this workspace.
      if (session.type !== 'dart') return;
      try {
        await client.dvrStart();
        dvrStatusBarItem.text = '$(record) DVR: Recording';
        dvrStatusBarItem.show();
      } catch { /* server not connected */ }
    }),
    vscode.debug.onDidTerminateDebugSession((session) => {
      if (session.type !== 'dart') return;
      dvrStatusBarItem.hide();
    })
  );
}
```

## Testing

### Dart Tests
- `query_recorder_test.dart`:
  - Read queries are recorded with correct SQL, timestamp, duration
  - Write queries capture before/after state
  - Ring buffer evicts oldest queries at max capacity
  - Recording can be started/stopped independently
  - Queries during non-recording state are not captured
  - SQL classification (SELECT/INSERT/UPDATE/DELETE) is correct

### Extension Tests
- `dvr-search.test.ts`:
  - Search by SQL text
  - Search by table name
  - Search by column value in before/after state
  - No matches returns empty array
  - Case-insensitive matching
  - Duplicate match sources are deduplicated
  - Empty/whitespace query returns empty array

### Compatibility Tests (Required for unstable data models)
- `dvr-client.contract.test.ts`:
  - Accepts envelope with unknown extra fields (forward compatibility)
  - Handles missing optional fields with defaults (backward compatibility)
  - Rejects unsupported `schemaVersion` with actionable error
  - Adapts legacy payload (`rowCount`) into V1 split fields when present
  - Handles `QUERY_NOT_AVAILABLE` gracefully by resyncing to current id window
  - Legacy payload missing `sessionId` is mapped to deterministic fallback (`"legacy-session"`)
  - Legacy payload missing `params` is mapped to empty list/object
  - Unknown parameter value kinds are safely surfaced as marker strings, never crashes
  - Oversized params are truncated with explicit truncation metadata

### Integration Tests
- Recorder + handler:
  - `maxQueries` update trims existing buffer correctly
  - `captureBeforeAfter=false` avoids extra read queries
  - Evicted-id behavior returns structured `QUERY_NOT_AVAILABLE` response
  - Parse failure path records query without before/after state instead of failing
  - Read/write callbacks include bindings and recorder persists them losslessly (within truncation policy)
  - GET `/api/dvr/query/:sessionId/:id` rejects id from wrong session
  - Cursor pagination remains monotonic while ring buffer evicts old entries

## Integration Points

### Shared Services Used

| Service | Usage |
|---------|-------|
| QueryIntelligence | DVR playback data feeds into query pattern analysis |
| SchemaIntelligence | Table/column metadata for displaying recorded query context |

### Consumes From

| Feature | Data/Action |
|---------|-------------|
| Real-time Mutation Stream (22) | Write queries captured by mutation tracker also recorded in DVR |
| Debug Performance (15) | Query execution times included in DVR entries |

### Produces For

| Feature | Data/Action |
|---------|-------------|
| Query Intelligence (1.3) | Full session query patterns for learning |
| Query Perf Regression Detector (63) | DVR panel refresh merges timings into `PerfBaselineStore` when `driftViewer.perfRegression.recordBaselinesFromDvr` is true; optional `warnOnDvrPanelRefresh` runs `detectRegressions` against DVR-built `PerformanceData` |
| Unified Timeline (6.1) | *Deferred:* merged event stream + markers (see **Deferred** section); DVR does not yet emit into a unified timeline API |
| SQL Notebook (3) | "Open in Notebook" for any recorded query |
| Query Cost Analyzer (43) | "Analyze" action on slow queries |

### Cross-Feature Actions

| From | Action | To |
|------|--------|-----|
| DVR Timeline | "View Row at Time" | *Deferred:* Time-Travel Data Slider (60) sync to query point (same **Deferred** section) |
| DVR Query | "Explain This Query" | Query Cost Analyzer |
| DVR Query | "Open in Notebook" | SQL Notebook with query pre-loaded |
| DVR Query | "Find Similar" | Query History Search filtered by pattern |
| DVR Slow Query | "Check for Regression" | Query Perf Regression Detector |

### Health Score Contribution

| Metric | Contribution |
|--------|--------------|
| Query Performance | DVR timing data feeds into "slow query %" metric |

### Unified Timeline Events

| Event Type | Data |
|------------|------|
| `query` | `{ sessionId, id, sql, params, durationMs, affectedRowCount, resultRowCount, type, timestamp }` |

### DVR + Time Travel Sync

When scrubbing the DVR timeline, the Time-Travel Data Slider (Feature 60) can optionally sync to show database state at each query point:

```
DVR Scrub Position → Query #23 (10:42:31)
         │
         ▼
Time-Travel Slider → Snapshot nearest to 10:42:31
         │
         ▼
Table View shows data state at that moment
```

---

## Known Limitations

- Before/after state capture adds 2 extra queries per write — noticeable performance overhead
- Ring buffer means early queries are lost in long sessions (window exposed via min/max ids and cursor API)
- No persistent storage — recording is lost when the server stops
- SQL parsing for table/WHERE extraction is regex-based — may fail on complex queries
- Before/after state is limited to 10 rows per query — bulk operations show partial state
- Internal queries (from the debug server itself) are also recorded — may add noise
- No grouping of related queries (e.g., a transaction's queries aren't linked)
- Timeline scrubbing requires fetching full query details — may lag with slow network
- No "replay" of queries against a fresh database — it's observation only, not execution
- Some drivers/callback paths may not expose full named parameter metadata; these cases are explicitly marked via `meta.bindingsUnavailable`

## Mitigations for Unstable Data Models

Datamodel instability is expected and supported. This feature is designed to absorb schema changes without breaking core workflows.

1. **Versioned envelopes everywhere**
   - All endpoints return `{ schemaVersion, generatedAt, data }`.
   - Client rejects unsupported major versions with a clear upgrade message.
   - Client declares supported range (for example, `X-DVR-Schema-Min`/`X-DVR-Schema-Max`) so server can return an explicit compatibility error.

2. **Compatibility adapters in client**
   - `dvr-client.ts` maps legacy fields (for example, `rowCount`) into current model fields.
   - New optional fields are ignored unless explicitly used.

3. **Strict core + flexible metadata**
   - Keep a small stable core contract for timeline playback.
   - Put experimental/feature-specific attributes into `meta` to prevent churn in top-level schema.

4. **Graceful degradation**
   - If `beforeState/afterState` is absent or unparsable, UI still renders SQL/timing/row counts.
   - If a query id is evicted, UI resyncs to `{minAvailableId,maxAvailableId}` and reloads nearest cursor page instead of hard failing.

5. **Contract tests as release gate**
   - Compatibility tests run in CI for both server and extension.
   - Any schema change must include fixture updates and adapter coverage.

6. **Operational safety switches**
   - `captureBeforeAfter` can be disabled instantly when schema or parser drift causes overhead/noise.
   - `maxQueries` is runtime-configurable to tune memory/performance tradeoffs without code changes.

7. **Deprecation window policy**
   - Deprecated fields remain supported for at least 2 minor releases.
   - Removal requires: schema bump, migration note, adapter coverage, and backward fixtures proving old clients fail loudly (not silently).

8. **Deterministic compatibility fixtures**
   - Maintain golden JSON fixtures for every supported schema variant.
   - CI runs adapter tests against all fixtures to prevent accidental parser drift.

---

## Implementation status (repo, 2026-04-30)

**Shipped (MVP + integration hardening):**

- Versioned envelopes, ring buffer, cursors, `sessionId` + id window, `QUERY_NOT_AVAILABLE`, `POST /api/dvr/config`, DVR handler + `QueryRecorder` tests.
- **Declared bindings (reads):** optional `args` / `namedArgs` on `POST /api/sql` → JSON-safe `params` via `lib/src/dvr_bindings.dart` (not SQL-parsed). Same fields on VM Service `ext.saropa.drift.runSql` as flat JSON strings; extension `apiRunSql`, `DriftApiClient.sql`, and `httpSql` accept optional `args` / `namedArgs`.
- **Host executor (optional):** `DriftDebugQueryWithBindings` + `queryWithBindings` on `DriftDebugServer.start` / `ServerContext` — when set, declared positional/named values are forwarded to the host read path; when omitted, bindings remain **DVR metadata only** (SQL string unchanged for `DriftDebugQuery`).
- **Writes:** `affectedRowCount` via `SELECT changes()` when `writeQuery` + mutation wrapper are used; **before/after** from `MutationRowSnapshots`; helper reads use `queryRaw` to avoid flooding DVR. **`DriftDebugWriteQueryWithBindings`** + optional `writeQueryWithBindings` on `DriftDebugServer.start` — when set (alone or preferred over `writeQuery`), the mutation wrapper invokes it with SQL only until HTTP/VM batch paths grow bound-write metadata.
- Extension: `dvr-client`, `dvr-search`, panel (**timeline** stepping, **detail** fetch, **SQL Notebook**, **Query Cost**, **status bar**, generation refresh, filters/export), **Snapshot diff** → `driftViewer.showSnapshotDiff`, **Schema rollback…** → `driftViewer.generateRollback`.
- **Query Intelligence:** DVR panel refresh calls `recordFromDvrQueries` when the intelligence subsystem is active (batch ingest, single change event).
- **Perf regression baselines:** `recordDvrQueriesIntoPerfBaselines` + `buildPerformanceDataFromDvrQueries` in `perf-regression-detector.ts`; DVR refresh wired to the same `PerfBaselineStore` as debug commands (`recordBaselinesFromDvr` / `warnOnDvrPanelRefresh` settings).
- **Tests:** handler integration + contract/search; golden fixtures for envelope, status, recorded row, `QUERY_NOT_AVAILABLE`, legacy `rowCount`, missing `params`; `dvr-perf-baseline.test.ts`.

**Explicitly deferred** (needs product scope + cross-subsystem APIs — see next section): single merged scrubber / automatic correlation IDs between DVR, schema timeline, snapshots, and Feature 60 time-travel **restore** behavior.

**Remaining optional follow-ups:**

- **Bound write execution:** extend batch/cell/import HTTP bodies to carry `args`/`namedArgs` and invoke `writeQueryWithBindings` with non-null binding maps (typedef + start wiring is in place).
- **More golden fixtures** if new `schemaVersion` or legacy variants appear.

---

## Deferred (product scope): unified timeline, schema-timeline fusion, time-travel

This plan’s UX mockups (§2–3) describe a **single scrubber** where query replay, **schema** history, and **data snapshots** feel like one “time axis.” In the repo today those concerns live in **separate subsystems**:

| Concern | Where it lives today | Typical correlation signal |
|--------|----------------------|----------------------------|
| DVR query stream | Debug server `QueryRecorder` + `/api/dvr/*` | `(sessionId, id)`, monotonic `id`, ISO `timestamp` |
| Data snapshots / diff | Extension snapshot store + `driftViewer.showSnapshotDiff`, timeline settings | Capture time, generation bumps, snapshot ordinal |
| Schema timeline / rollback | Extension schema tracker / rollback flows (separate commands and panels) | File edits, migration events, tracker state — not aligned to DVR ids |

**Why this is not “just wiring”:** there is no stable, documented **join key** between a DVR row and a schema-timeline event or a snapshot row (e.g. “snapshot #7 corresponds to DVR id 42” requires either timestamps with agreed semantics, explicit IDs written at capture time, or a new unified event bus). **Time-travel / Feature 60** (plan §729–741) implies restoring or **viewing** DB state at a scrub position; that is stronger than “show me the SQL and optional before/after rows for this query” and may require snapshot selection policy, read-only restore rules, and UI ownership.

**What a future phase would need (checklist for a follow-on plan):**

1. **Product:** define the primary scrubber (DVR-only vs snapshot-only vs merged); what happens on scrub (open diff, switch table data, both, neither); debug-only vs persisted sessions.
2. **API / data:** choose correlation strategy (e.g. optional `meta.snapshotId` / `meta.generation` on DVR entries; or append DVR events into an existing timeline model; or server-published unified event stream with sort keys).
3. **UI:** one panel or deep-linked panels; accessibility and performance for large buffers.
4. **Engineering:** schema-timeline and snapshot modules agree on types and command contracts; tests that pin ordering and edge cases (eviction, missing snapshot, wrong session).

**Current mitigation (shipped):** the DVR panel **Snapshot diff** button runs **`driftViewer.showSnapshotDiff`**; **Schema rollback…** runs **`driftViewer.generateRollback`** (schema snapshot pairs) — deep links into adjacent workflows without a unified event bus.

---

## Plan closure and release checklist

Use this to **treat plan 26 as closed for the shipped MVP** and to **release** the feature set to users (aligns with `bugs/FINISH_GUIDE.md`).

### 1. Close the plan (documentation / tracking)

- [ ] Confirm **Implementation status** (above) matches what you intend to call “done” for this cycle.
- [ ] If your team archives finished specs: copy or summarize this file under `plans/history/…` and leave a short pointer at the top of `26-query-replay-dvr.md`, **or** keep a single source of truth here and update the date when scope changes.
- [ ] Tick off any internal issue tracker / milestone links (outside the repo).

### 2. Quality gate (before tag or publish)

From repo root:

- [ ] `dart pub get` → `dart analyze` → `dart test`
- [ ] `cd extension` → `npm install` (if needed) → `npm test` (runs `compile` via `pretest`)

Optional: `python scripts/publish.py analyze` for the full publish pipeline dry run.

### 3. User-facing release notes

- [x] **`CHANGELOG.md`:** DVR + related extension/server behavior documented under `## [3.5.0]` with the standard **log** link line.
- [ ] **`README.md` / `extension/README.md`:** update only if install steps, commands, or “how to use DVR / bindings / `queryWithBindings`” changed since the last published README.

### 4. Version alignment (actual publish)

- [ ] Bump **`pubspec.yaml`** (Dart package) and **`extension/package.json`** (extension) to the **same** released version when you cut the release (see `scripts/publish.py` — supports `dart`, `extension`, or `all`).
- [ ] Run **`python scripts/publish.py`** (interactive menu) or the non-interactive targets you use for **pub.dev** and/or **VS Code Marketplace / Open VSX**.

### 5. Git / PR

- [ ] One or more commits with a clear message (scope: Dart DVR + extension DVR + tests + changelog).
- [ ] PR description: shipped vs deferred (point reviewers at **Deferred** section above).

After §2–§5 are green and artifacts are published, **plan 26 is closed for the MVP scope**; the **Deferred** section tracks what a **future plan** would own (unified timeline / time-travel), not blockers for calling the current DVR feature “released.”
