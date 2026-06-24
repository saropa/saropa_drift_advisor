// Constants extracted from _DriftDebugServerImpl to reduce file size
// and improve maintainability. See drift_debug_server_io.dart for usage.

/// Static constants used by the Drift Debug Server.
///
/// Extracted from `_DriftDebugServerImpl` to keep the main server file
/// focused on logic. All route paths, JSON keys, error messages, SQL strings,
/// auth headers, banner strings, and numeric limits live here.
abstract final class ServerConstants {
  /// Ring buffer of recent query timings for the performance monitor (max [maxQueryTimings] entries).
  static const int maxQueryTimings = 500;
  static const int defaultPort = 8_642;
  static const int minPort = 0;
  static const int maxPort = 65_535;
  static const int maxLimit = 1_000;
  static const int defaultLimit = 200;

  static const int maxOffset = 2_000_000;

  /// Maximum accepted POST body size (64 MiB). Every handler buffers the whole
  /// body before validating it, so an uncapped body is an OOM vector — generous
  /// enough for realistic data imports while still bounding memory (audit H3).
  static const int maxRequestBodyBytes = 64 * 1024 * 1024;

  static const Duration longPollTimeout = Duration(seconds: 30);

  /// Wall-clock cap on a single POST /api/sql (and /explain) execution.
  ///
  /// Without this, a query that hangs in the host DB layer (a lock wait, a
  /// stalled VM-service proxy, a pathological full scan) keeps the request
  /// handler awaiting forever, holding its connection open. A pile-up of such
  /// stuck handlers is the leading suspect for the "server stops answering
  /// every endpoint and never recovers" wedge reported by an external agent
  /// (bugs/BUG_loopback_server_wedges_and_hard_to_discover_for_agents.md). On
  /// timeout the handler abandons the await and returns a JSON error so the
  /// connection is released and /api/health keeps responding. The underlying
  /// query is not cancellable from here, but the SERVER stays live. 30s matches
  /// [longPollTimeout] — generous for a real read, short enough to bound a hang.
  static const Duration sqlStatementTimeout = Duration(seconds: 30);

  /// Maximum rows POST /api/sql returns in one response. A query that matches
  /// far more rows is truncated to this many and the JSON envelope carries
  /// `rowCount` (the true match count) and `truncated: true`, so a wide query
  /// degrades to a bounded, well-formed response instead of streaming an
  /// unbounded body that can exhaust memory or stall the socket. Generous
  /// enough that normal inspection queries are never clipped.
  static const int maxSqlResultRows = 10_000;

  /// Poll interval during long-poll wait.
  static const Duration longPollCheckInterval = Duration(milliseconds: 300);

  /// Minimum time between change-detection DB checks. When set on
  /// [ServerContext], [checkDataChange] skips the UNION ALL query if
  /// the last check was more recent, reducing "Drift: Sent SELECT"
  /// log spam when the extension or web UI long-polls frequently.
  static const Duration changeDetectionMinInterval = Duration(seconds: 2);

  /// Route constants (method + path; alt forms allow path without leading slash).
  ///
  static const String methodGet = 'GET';
  static const String methodPost = 'POST';
  static const String methodDelete = 'DELETE';
  static const String methodPut = 'PUT';
  static const String pathApiHealth = '/api/health';
  static const String pathApiHealthAlt = 'api/health';

  /// API index — a self-describing endpoint listing for non-UI clients
  /// (AI coding agents, CLI scripts). Both the trailing-slash and bare forms
  /// are matched. Added so an external client can learn the read API by
  /// fetching one URL instead of grepping the bundled web assets
  /// (bugs/BUG_loopback_server_wedges_and_hard_to_discover_for_agents.md, E1).
  static const String pathApiIndex = '/api/';
  static const String pathApiIndexAlt = 'api/';
  static const String pathApiIndexBare = '/api';
  static const String pathApiIndexBareAlt = 'api';
  static const String pathApiGeneration = '/api/generation';
  static const String pathApiGenerationAlt = 'api/generation';
  static const String pathApiTables = '/api/tables';
  static const String pathApiTablesAlt = 'api/tables';
  static const String pathApiTablePrefix = '/api/table/';
  static const String pathApiTablePrefixAlt = 'api/table/';
  static const String pathSuffixCount = '/count';
  static const String pathSuffixColumns = '/columns';
  static const String pathSuffixFkMeta = '/fk-meta';
  static const String pathApiSql = '/api/sql';
  static const String pathApiSqlAlt = 'api/sql';
  static const String pathApiSqlExplain = '/api/sql/explain';
  static const String pathApiSqlExplainAlt = 'api/sql/explain';
  static const String pathApiSchema = '/api/schema';
  static const String pathApiSchemaAlt = 'api/schema';
  static const String pathApiViews = '/api/views';
  static const String pathApiViewsAlt = 'api/views';
  static const String pathApiSchemaDiagram = '/api/schema/diagram';
  static const String pathApiSchemaDiagramAlt = 'api/schema/diagram';
  static const String pathApiSchemaMetadata = '/api/schema/metadata';
  static const String pathApiSchemaMetadataAlt = 'api/schema/metadata';
  static const String pathApiDump = '/api/dump';
  static const String pathApiDumpAlt = 'api/dump';
  static const String pathApiDatabase = '/api/database';
  static const String pathApiDatabaseAlt = 'api/database';
  static const String pathApiReport = '/api/report';
  static const String pathApiReportAlt = 'api/report';
  static const String pathApiSnapshot = '/api/snapshot';
  static const String pathApiSnapshotAlt = 'api/snapshot';
  static const String pathApiSnapshotCompare = '/api/snapshot/compare';
  static const String pathApiSnapshotCompareAlt = 'api/snapshot/compare';

  /// GET list of all stored snapshots (multi-snapshot support, Feature 72).
  static const String pathApiSnapshots = '/api/snapshots';
  static const String pathApiSnapshotsAlt = 'api/snapshots';

  /// GET the host-declared (code-side) Drift schema (Feature 71).
  static const String pathApiSchemaDeclared = '/api/schema/declared';
  static const String pathApiSchemaDeclaredAlt = 'api/schema/declared';

  /// GET the host-declared relationship manifest (Feature 78).
  static const String pathApiSchemaRelationships = '/api/schema/relationships';
  static const String pathApiSchemaRelationshipsAlt =
      'api/schema/relationships';

  /// GET soft-relationship advisory findings (Feature 77): edges inferred from
  /// column naming that no SQLite FK or manifest declares. A sub-path of
  /// `/api/issues` because the result is an issues list, not a schema surface.
  static const String pathApiIssuesSoftRelationships =
      '/api/issues/soft-relationships';
  static const String pathApiIssuesSoftRelationshipsAlt =
      'api/issues/soft-relationships';

  /// Dynamic prefix for per-snapshot operations: DELETE/PUT /api/snapshot/{id}.
  static const String pathApiSnapshotPrefix = '/api/snapshot/';
  static const String pathApiSnapshotPrefixAlt = 'api/snapshot/';
  static const String pathApiComparePrefix = '/api/compare/';
  static const String pathApiComparePrefixAlt = 'api/compare/';
  static const String pathApiCompareReport = '/api/compare/report';
  static const String pathApiCompareReportAlt = 'api/compare/report';
  static const String pathApiIndexSuggestions = '/api/index-suggestions';
  static const String pathApiIndexSuggestionsAlt = 'api/index-suggestions';
  static const String pathApiIssues = '/api/issues';
  static const String pathApiIssuesAlt = 'api/issues';
  static const String pathApiMigrationPreview = '/api/migration/preview';
  static const String pathApiMigrationPreviewAlt = 'api/migration/preview';
  static const String pathApiAnalyticsPerformance =
      '/api/analytics/performance';
  static const String pathApiAnalyticsPerformanceAlt =
      'api/analytics/performance';
  static const String pathApiAnalyticsAnomalies = '/api/analytics/anomalies';
  static const String pathApiAnalyticsAnomaliesAlt = 'api/analytics/anomalies';
  static const String pathApiAnalyticsSize = '/api/analytics/size';
  static const String pathApiAnalyticsSizeAlt = 'api/analytics/size';
  static const String pathApiAnalyticsOrphanTables =
      '/api/analytics/orphan-tables';
  static const String pathApiAnalyticsOrphanTablesAlt =
      'api/analytics/orphan-tables';
  static const String pathApiSessionShare = '/api/session/share';
  static const String pathApiSessionShareAlt = 'api/session/share';
  static const String pathApiSessionPrefix = '/api/session/';
  static const String pathApiSessionPrefixAlt = 'api/session/';
  static const String pathSuffixAnnotate = '/annotate';

  /// Route suffix for the session extend endpoint (POST /api/session/{id}/extend).
  static const String pathSuffixExtend = '/extend';
  static const String pathApiImport = '/api/import';
  static const String pathApiImportAlt = 'api/import';

  /// POST parameterized single-cell UPDATE (requires [writeQuery]).
  static const String pathApiCellUpdate = '/api/cell/update';
  static const String pathApiCellUpdateAlt = 'api/cell/update';

  /// POST batch of validated UPDATE/INSERT/DELETE statements in one transaction.
  static const String pathApiEditsApply = '/api/edits/apply';
  static const String pathApiEditsApplyAlt = 'api/edits/apply';

  /// POST validate (no write) a list of CREATE INDEX statements for preview.
  static const String pathApiIndexesPreview = '/api/indexes/preview';
  static const String pathApiIndexesPreviewAlt = 'api/indexes/preview';

  /// POST best-effort apply of CREATE INDEX statements (requires [writeQuery]).
  static const String pathApiIndexesApply = '/api/indexes/apply';
  static const String pathApiIndexesApplyAlt = 'api/indexes/apply';
  static const String pathApiHistory = '/api/history';
  static const String pathApiHistoryAlt = 'api/history';
  static const String pathApiChangeDetection = '/api/change-detection';
  static const String pathApiChangeDetectionAlt = 'api/change-detection';
  static const String pathApiMutations = '/api/mutations';
  static const String pathApiMutationsAlt = 'api/mutations';
  static const String pathApiDvrStatus = '/api/dvr/status';
  static const String pathApiDvrStatusAlt = 'api/dvr/status';
  static const String pathApiDvrStart = '/api/dvr/start';
  static const String pathApiDvrStartAlt = 'api/dvr/start';
  static const String pathApiDvrStop = '/api/dvr/stop';
  static const String pathApiDvrStopAlt = 'api/dvr/stop';
  static const String pathApiDvrPause = '/api/dvr/pause';
  static const String pathApiDvrPauseAlt = 'api/dvr/pause';
  static const String pathApiDvrConfig = '/api/dvr/config';
  static const String pathApiDvrConfigAlt = 'api/dvr/config';
  static const String pathApiDvrQueries = '/api/dvr/queries';
  static const String pathApiDvrQueriesAlt = 'api/dvr/queries';
  static const String pathApiDvrQueryPrefix = '/api/dvr/query/';
  static const String pathApiDvrQueryPrefixAlt = 'api/dvr/query/';
  static const String pathFavicon = '/favicon.ico';
  static const String pathFaviconAlt = 'favicon.ico';

  /// Local web UI stylesheet (served from package `assets/web/style.css`).
  static const String pathWebStyle = '/assets/web/style.css';
  static const String pathWebStyleAlt = 'assets/web/style.css';

  /// Local web UI script (served from package `assets/web/bundle.js`).
  static const String pathWebApp = '/assets/web/bundle.js';
  static const String pathWebAppAlt = 'assets/web/bundle.js';

  /// Human-readable product name shown in the web-UI masthead and loading
  /// overlay. Centralised here so every display site stays in sync.
  static const String appDisplayName = 'Saropa Drift Advisor';

  /// Package version displayed in the web UI and health endpoint.
  /// Must match pubspec.yaml: updated on publish version writes, and the Dart
  /// analysis leg of scripts/publish.py reconciles this constant if it drifted.
  static const String packageVersion = '4.1.8';

  /// jsDelivr CDN base URL for serving web assets and images when
  /// local files are unavailable. Append `@v$packageVersion/…` for
  /// version-pinned resources or `@main/…` for the fallback branch.
  // ignore: avoid_hardcoded_config — constants file IS the centralized config
  static const String cdnBaseUrl =
      'https://cdn.jsdelivr.net/gh/saropa/saropa_drift_advisor';
  static const String jsonKeyVersion = 'version';
  static const String queryParamLimit = 'limit';
  static const String queryParamOffset = 'offset';
  static const String queryParamSince = 'since';

  /// When `1` or `true` on GET `/api/schema/metadata`, each table entry
  /// includes [jsonKeyForeignKeys] so clients avoid N per-table fk-meta calls.
  static const String queryParamIncludeForeignKeys = 'includeForeignKeys';
  static const String queryParamCursor = 'cursor';
  static const String queryParamDirection = 'direction';
  static const String queryParamFormat = 'format';
  static const String queryParamDetail = 'detail';

  /// Snapshot pairwise-compare query params: from={id} and to={id}. When `to`
  /// is omitted the compare runs against the live database ("now").
  static const String queryParamFrom = 'from';
  static const String queryParamTo = 'to';
  static const String formatDownload = 'download';
  static const String detailRows = 'rows';

  /// Portable-report (`/api/report`) query params. `tables` is a comma list of
  /// table names (defaults to all), `maxRows` caps embedded rows per table, and
  /// `schema`/`anomalies` set to [valueFalse] omit those sections.
  static const String queryParamTables = 'tables';
  static const String queryParamMaxRows = 'maxRows';
  static const String queryParamSchema = 'schema';
  static const String queryParamAnomalies = 'anomalies';

  /// Literal `'false'` used to switch off optional report sections via the URL.
  static const String valueFalse = 'false';
  static const String jsonKeyEnabled = 'enabled';
  static const String jsonKeyChangeDetection = 'changeDetection';
  static const String jsonKeyError = 'error';
  static const String jsonKeyRows = 'rows';
  static const String jsonKeySql = 'sql';

  /// JSON body field on POST /api/sql (and the VM-service `runSql` params map):
  /// when `true`/`"1"` the request is tagged as an extension-owned diagnostic
  /// probe (e.g. null-count scan, health-metrics aggregate) and its timing
  /// record is stamped with `isInternal: true`. Optional — defaults to false
  /// so the wire format stays identical for clients that predate the flag.
  /// Added to fix the perf-regression-false-positive feedback loop where the
  /// extension's own probes were compared to baselines of themselves.
  static const String jsonKeyInternal = 'internal';

  /// JSON body field: list of single-statement SQL strings (POST /api/edits/apply).
  static const String jsonKeyStatements = 'statements';
  static const String jsonKeyCount = 'count';
  static const String jsonKeyOk = 'ok';

  /// Rows actually changed by a cell update (from SQLite `changes()`), so the
  /// client can warn when a stale primary key matched zero rows (audit H5).
  static const String jsonKeyRowsAffected = 'rowsAffected';
  static const String jsonKeyFailedIndex = 'failedIndex';
  static const String jsonKeyFailedStatement = 'failedStatement';

  /// JSON body field: list of CREATE INDEX SQL strings (POST /api/indexes/*).
  static const String jsonKeyIndexSqls = 'indexSqls';

  /// JSON response fields for index preview/apply.
  static const String jsonKeyValid = 'valid';
  static const String jsonKeyRejected = 'rejected';
  static const String jsonKeyReason = 'reason';
  static const String jsonKeyResults = 'results';
  static const String jsonKeyIndex = 'index';
  static const String jsonKeyApplied = 'applied';

  /// True when HTTP clients may call write endpoints ([writeQuery] configured).
  static const String jsonKeyWriteEnabled = 'writeEnabled';

  /// Health field advertising the server's bind interface. `true` = bound to
  /// loopback (127.0.0.1) only, so the server is reachable from the host that
  /// runs the app — but NOT by the device's LAN IP. A remote probe (Saropa
  /// Lints) reads this to distinguish "up but loopback-only" from "absent": a
  /// connection-refused on the LAN IP with no health response otherwise looks
  /// identical to no server at all. See BUG_drift_server_unreachable_by_lan_ip.
  static const String jsonKeyLoopbackOnly = 'loopbackOnly';

  /// Health + API-index field listing the server's read endpoints so a non-UI
  /// client can discover the API from one response (E1 discoverability).
  static const String jsonKeyEndpoints = 'endpoints';

  /// API-index field: a stable URL to the full REST reference (doc/API.md on
  /// the CDN), so a discovered client can read the contract without the repo.
  static const String jsonKeyDocs = 'docs';

  /// API-index field: short human-readable name of each listed endpoint.
  static const String jsonKeyDescription = 'description';

  /// API-index field: HTTP method for each listed endpoint.
  static const String jsonKeyMethod = 'method';

  /// API-index / discovery-manifest field: a single endpoint path.
  static const String jsonKeyPath = 'path';

  /// Compact endpoint list advertised by GET /api/health and written into the
  /// discovery manifest — just the read paths an external agent most needs.
  /// The richer method+description form is served by GET /api/ ([apiIndex]).
  static const List<String> healthEndpoints = <String>[
    pathApiHealth,
    pathApiIndex,
    pathApiSql,
    pathApiSqlExplain,
    pathApiTables,
    pathApiTablePrefix,
    pathApiSchema,
    pathApiSchemaMetadata,
    pathApiViews,
    pathApiIssues,
    pathApiGeneration,
  ];

  /// Self-describing endpoint catalog served by GET /api/ for non-UI clients.
  /// Each entry is `{method, path, description}`. Kept to the read API an
  /// external agent uses to inspect a live DB; the full contract (write/session/
  /// snapshot endpoints, query params, response shapes) lives in doc/API.md,
  /// linked via [jsonKeyDocs].
  static const List<Map<String, String>>
  apiIndexEndpoints = <Map<String, String>>[
    <String, String>{
      jsonKeyMethod: methodGet,
      jsonKeyPath: pathApiHealth,
      jsonKeyDescription:
          'Liveness probe; reports version, flags, capabilities, endpoints.',
    },
    <String, String>{
      jsonKeyMethod: methodPost,
      jsonKeyPath: pathApiSql,
      jsonKeyDescription:
          'Run read-only SQL. Body {"sql":"SELECT ..."}; returns {"rows":[...]}.',
    },
    <String, String>{
      jsonKeyMethod: methodPost,
      jsonKeyPath: pathApiSqlExplain,
      jsonKeyDescription:
          'EXPLAIN QUERY PLAN for read-only SQL; returns {rows, sql, indexes}.',
    },
    <String, String>{
      jsonKeyMethod: methodGet,
      jsonKeyPath: pathApiTables,
      jsonKeyDescription: 'List all table and view names.',
    },
    <String, String>{
      jsonKeyMethod: methodGet,
      jsonKeyPath: '$pathApiTablePrefix{name}',
      jsonKeyDescription:
          'Rows for one table (?limit=&offset=); also /count, /columns, /fk-meta.',
    },
    <String, String>{
      jsonKeyMethod: methodGet,
      jsonKeyPath: pathApiSchema,
      jsonKeyDescription: 'All CREATE statements as plain-text SQL.',
    },
    <String, String>{
      jsonKeyMethod: methodGet,
      jsonKeyPath: pathApiSchemaMetadata,
      jsonKeyDescription:
          'Per-table columns + row counts (?includeForeignKeys=1).',
    },
    <String, String>{
      jsonKeyMethod: methodGet,
      jsonKeyPath: pathApiViews,
      jsonKeyDescription: 'Structured list of views ({name, sql}).',
    },
    <String, String>{
      jsonKeyMethod: methodGet,
      jsonKeyPath: pathApiIssues,
      jsonKeyDescription:
          'Merged index suggestions, anomalies, and orphan tables.',
    },
    <String, String>{
      jsonKeyMethod: methodGet,
      jsonKeyPath: pathApiGeneration,
      jsonKeyDescription:
          'Data-change generation counter (?since= long-polls for changes).',
    },
  ];

  /// Discovery-manifest fields (E1): a JSON file written to a well-known path on
  /// startup so an external agent can find the running server (host + port +
  /// flags) without being told the URL. See [discoveryDirName].
  static const String jsonKeyHost = 'host';
  static const String jsonKeyPort = 'port';
  static const String jsonKeyPid = 'pid';
  static const String jsonKeyWorkspace = 'workspace';
  static const String jsonKeyStartedAt = 'startedAt';

  /// Loopback host the manifest advertises; the server's secure default binds
  /// 127.0.0.1, and even with `loopbackOnly:false` the host loopback is always
  /// reachable, so this is the address an on-host agent connects to.
  static const String discoveryHost = '127.0.0.1';

  /// Directory (under the user's home) holding the discovery manifest. Resolved
  /// against `USERPROFILE` (Windows) or `HOME` (POSIX); when neither is set
  /// (e.g. a mobile embedder) the manifest is silently skipped — it is a
  /// best-effort desktop convenience, never required for the server to run.
  static const String discoveryDirName = '.saropa_drift_advisor';

  /// Manifest filename inside [discoveryDirName].
  static const String discoveryFileName = 'server.json';

  static const String jsonKeyGeneration = 'generation';
  static const String jsonKeySnapshot = 'snapshot';
  static const String jsonKeySnapshots = 'snapshots';
  static const String jsonKeyLabel = 'label';

  /// Compare response field: the target snapshot id, or null when the diff was
  /// taken against the live database.
  static const String jsonKeyTo = 'to';

  /// Declared-schema (Feature 71) response fields.
  static const String jsonKeyAvailable = 'available';
  static const String jsonKeySqlType = 'sqlType';

  /// Drift semantic column type ('dateTime' | 'bool' | 'int' | 'double' |
  /// 'string' | 'blob') when a declared Drift schema is available. Lets the NL
  /// converter detect dates/bools exactly instead of guessing from the lossy
  /// SQLite storage type (Drift stores DateTime/bool as INTEGER).
  static const String jsonKeyDriftType = 'driftType';
  static const String jsonKeyNullable = 'nullable';
  static const String jsonKeyIsPk = 'isPk';
  static const String jsonKeyIndexes = 'indexes';
  static const String jsonKeyId = 'id';
  static const String jsonKeyCreatedAt = 'createdAt';
  static const String jsonKeyTableCount = 'tableCount';
  static const String jsonKeyTables = 'tables';
  static const String jsonKeyViews = 'views';
  static const String jsonKeyEvents = 'events';
  static const String jsonKeyCursor = 'cursor';
  static const String jsonKeyName = 'name';
  static const String jsonKeyColumns = 'columns';
  static const String jsonKeyTable = 'table';
  static const String jsonKeyCountThen = 'countThen';
  static const String jsonKeyCountNow = 'countNow';
  static const String jsonKeyAdded = 'added';
  static const String jsonKeyRemoved = 'removed';
  static const String jsonKeyUnchanged = 'unchanged';
  static const String jsonKeyCountA = 'countA';
  static const String jsonKeyCountB = 'countB';
  static const String jsonKeyDiff = 'diff';
  static const String jsonKeyOnlyInA = 'onlyInA';
  static const String jsonKeyOnlyInB = 'onlyInB';
  static const String headerDriftClient = 'x-drift-client';
  static const String clientVscode = 'vscode';
  static const String jsonKeyExtensionConnected = 'extensionConnected';
  static const String jsonKeyCapabilities = 'capabilities';
  static const String jsonKeyCompareEnabled = 'compareEnabled';
  static const String capabilityIssues = 'issues';

  /// Advertises POST /api/cell/update for browser inline edits.
  static const String capabilityCellUpdate = 'cellUpdate';

  /// Advertises POST /api/edits/apply for extension bulk data edits.
  static const String capabilityEditsApply = 'editsApply';
  static const String jsonKeyIssues = 'issues';
  static const String jsonKeySource = 'source';
  static const String jsonKeySuggestedSql = 'suggestedSql';
  static const String jsonKeyMessage = 'message';
  static const String jsonKeySeverity = 'severity';
  static const String jsonKeyColumn = 'column';
  static const String jsonKeyAnomalies = 'anomalies';
  static const String jsonKeyPriority = 'priority';

  // --- Saropa Diagnostic Envelope (cross-tool suite protocol, plan 67 §2) ---
  // GET /api/issues wraps its merged list in this envelope so the sibling
  // tools (Saropa Lints, Saropa Log Capture) can consume it with correct
  // attribution and version-gate the shape. The fields below are ADDITIVE:
  // every pre-existing issue field is preserved, so current consumers are
  // unaffected.

  /// Envelope schema version. Bumped only on a breaking change to the issue
  /// shape; consumers ignore unknown fields and refuse a higher major.
  static const int issuesSchemaVersion = 1;

  /// Producer identity carried in the envelope so a merged multi-tool list
  /// (e.g. Saropa Log Capture's combined view) can attribute each issue to
  /// the tool that emitted it.
  static const String productName = 'saropa_drift_advisor';

  static const String jsonKeySchemaVersion = 'schemaVersion';
  static const String jsonKeyProducer = 'producer';
  // `jsonKeyGeneratedAt` ('generatedAt') is already declared below and reused
  // here for the envelope's generation timestamp.

  /// Shared taxonomy bucket for an issue (plan 67 §2.1).
  static const String jsonKeyCategory = 'category';

  /// Localized one-line summary. Emitted alongside (not instead of)
  /// [jsonKeyMessage] during migration so existing `/api/issues` consumers
  /// that read `message` keep working while the suite standardizes on
  /// `title`.
  static const String jsonKeyTitle = 'title';

  /// Diagnostic categories (plan 67 §2.1). A missing index is a
  /// query-performance concern; an anomaly is a data-quality concern; orphan
  /// tables and inferred relationships are schema concerns.
  static const String categoryPerformance = 'performance';
  static const String categoryData = 'data';
  static const String categorySchema = 'schema';
  static const String categoryOther = 'other';

  // --- Diagnostic fix action (plan 67 §2.1 / R1) ---
  // A table-scoped issue carries a `fix` deep-link so a consumer (the Drift
  // Health panel, or a sibling tool rendering Advisor's issues) can jump to the
  // table's Drift class. It targets Advisor's OWN navigation command — NOT a
  // Lints rule: Advisor's runtime detectors (missing index, anomaly, orphan
  // table) have no static Lints counterpart to point at (verified against
  // saropa_lints `drift_rules.dart`), so the cross-tool fix here is navigation,
  // not a static-rule explainer.
  static const String jsonKeyFix = 'fix';
  static const String jsonKeyKind = 'kind';
  static const String jsonKeyCommand = 'command';
  static const String jsonKeyArgs = 'args';
  static const String fixKindCommand = 'command';

  /// VS Code command a table-scoped issue's fix deep-links to (one of the
  /// extension's stable suite command ids, plan 67 §3).
  static const String commandGoToTableDefinition =
      'driftViewer.goToDefinitionForTable';
  static const String headerAuthorization = 'authorization';
  static const String authSchemeBearer = 'Bearer ';
  static const String authSchemeBasic = 'Basic ';
  static const String headerContentDisposition = 'Content-Disposition';
  static const String headerWwwAuthenticate = 'WWW-Authenticate';

  /// HTTP Basic auth realm — reuses [appDisplayName] so the browser prompt
  /// matches the product branding.
  static const String realmDriftDebug = appDisplayName;
  static const String sqlSchemaMaster =
      "SELECT type, name, sql FROM sqlite_master WHERE sql IS NOT NULL AND name NOT LIKE 'sqlite_%' ORDER BY type, name";
  static const String authRequiredMessage =
      'Authentication required. Use Authorization header with Bearer scheme or HTTP Basic.';
  static const String errorInvalidRequestBody = 'Invalid request body';
  static const String errorPayloadTooLarge =
      'Request body too large (limit 64 MiB).';
  static const String errorInvalidJson = 'Invalid JSON';
  static const String errorMissingSql = 'Missing or empty sql';

  /// Returned by POST /api/sql (and /explain) when execution exceeds
  /// [sqlStatementTimeout]. Phrased so a client knows the server is still up and
  /// the query was abandoned, not that the connection died. The exact timeout
  /// duration is deliberately not embedded so this message can never drift from
  /// [sqlStatementTimeout] when that value is retuned.
  static const String errorSqlTimeout =
      'Query exceeded the statement timeout and was abandoned. The server is '
      'still running; narrow the query (add a WHERE/LIMIT) and retry.';

  /// JSON envelope flag on POST /api/sql when the result was clipped to
  /// [maxSqlResultRows]; paired with [jsonKeyRowCount] (the true match count).
  static const String jsonKeyTruncated = 'truncated';
  static const String errorReadOnlyOnly =
      'Only read-only SQL is allowed (SELECT or WITH ... SELECT). INSERT/UPDATE/DELETE and DDL are rejected.';
  static const String errorUnknownTablePrefix = 'Unknown table: ';
  static const String errorNoSnapshot =
      'No snapshot. POST /api/snapshot first to capture state.';
  static const String errorDatabaseDownloadNotConfigured =
      'Database download not configured. Pass getDatabaseBytes to DriftDebugServer.start (e.g. () => File(dbPath).readAsBytes()).';
  static const String errorCompareNotConfigured =
      'Database comparison is not configured. '
      'To enable this feature, pass a queryCompare callback to DriftDebugServer.start().';
  static const String errorMigrationRequiresCompare =
      'Migration preview requires a comparison database. '
      'To enable this feature, pass a queryCompare callback to DriftDebugServer.start().';
  static const String jsonKeyCountColumn = 'c';
  static const String attachmentDatabaseSqlite =
      'attachment; filename="database.sqlite"';
  static const String attachmentSnapshotDiff =
      'attachment; filename="snapshot-diff.json"';
  static const String attachmentDiffReport =
      'attachment; filename="diff-report.json"';
  static const String messageSnapshotCleared = 'Snapshot cleared.';
  // Include views, not just base tables: PowerSync (and any ORM that fronts
  // JSON-backed storage with SELECT views) exposes its real schema through
  // views, so filtering to type='table' hid the user's entire data model from
  // the sidebar, schema metadata, and column pickers. PRAGMA table_info works
  // on views as well as tables, so every downstream consumer keyed off this
  // list resolves view columns the same way. Write paths (foreign_key_list,
  // edits) simply return empty for a view, which is the correct read-only
  // behavior. See GitHub issue #32.
  static const String sqlTableNames =
      "SELECT name FROM sqlite_master WHERE type IN ('table','view') AND name NOT LIKE 'sqlite_%' ORDER BY name";

  // View name + CREATE VIEW DDL, for the dedicated Views screen. Kept separate
  // from sqlSchemaMaster (which dumps every object's DDL as one blob) so the
  // client gets a structured per-view list it can pair with each view's output
  // without parsing the combined dump. See GitHub issue #32.
  static const String sqlViewDefinitions =
      "SELECT name, sql FROM sqlite_master WHERE type='view' AND name NOT LIKE 'sqlite_%' ORDER BY name";

  // Base tables only — the orphan-table check compares physical tables against
  // the declared Drift table set, and a view is never declared there. Feeding
  // it the view-inclusive list above would flag every view as an orphan, a
  // false bug report. See GitHub issue #32.
  static const String sqlBaseTableNames =
      "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name";

  /// Banner box interior width (between the left and right │).
  static const int bannerInnerWidth = 50;

  /// Rounded-corner banner lines (no_magic_string).
  static const String bannerTop =
      '╭──────────────────────────────────────────────────╮';
  static const String bannerDivider =
      '├──────────────────────────────────────────────────┤';
  static const String bannerEmpty =
      '│                                                  │';
  static const String bannerBottom =
      '╰──────────────────────────────────────────────────╯';
  static const String bannerDescription =
      'Open in browser to view your database:';

  /// Banner caveat shown above the host port-forward command. The server
  /// binds inside whatever network namespace the host app runs in; on an
  /// Android emulator or a physical device that is NOT the dev machine's
  /// loopback, so a viewer/browser on the host cannot reach the printed
  /// http://127.0.0.1 URL until the port is forwarded. Stating this in the
  /// banner is the only diagnostic the user sees — without it, "server
  /// started" + "viewer offline" look contradictory. Kept ≤ 50 chars so
  /// _bannerCentered pads (longer text yields a broken, unpadded box line).
  static const String bannerEmulatorHint =
      'On emulator/device, forward to the host first:';

  /// Banner line shown under the default loopback-only bind, stating that the
  /// device's LAN IP route is closed by design. Without it, a developer
  /// debugging over Wi-Fi who tries `http://<device-lan-ip>:<port>` gets a
  /// silent connection-refused indistinguishable from "no server" — the
  /// discoverability gap the loopback-only security default left open. Kept
  /// ≤ [bannerInnerWidth] chars so _bannerCentered pads instead of breaking
  /// the box. See BUG_drift_server_unreachable_by_lan_ip.
  static const String bannerLanDisabledHint =
      'LAN-IP access off (loopbackOnly: true).';

  /// Banner line naming the opt-in that enables LAN-IP access. Paired with
  /// [bannerLanDisabledHint] so the user sees both the constraint and the fix.
  static const String bannerLanEnableHint =
      'Enable: loopbackOnly: false + authToken';

  /// Banner header printed above the reachable LAN URLs when the server is NOT
  /// loopback-only, so a Wi-Fi-by-IP user gets a copy-paste URL beside the
  /// existing adb-forward hint rather than having to guess the device IP.
  static const String bannerLanReachableHeader =
      'Reachable on your network at:';

  /// Banner line shown when loopbackOnly is false but no non-loopback IPv4
  /// interface could be enumerated (NetworkInterface.list returned none), so
  /// the box still explains the bind mode instead of silently omitting it.
  static const String bannerLanNoInterface =
      'LAN access on (no IPv4 interface found).';
  static const String jsonKeyCounts = 'counts';
  static const String jsonKeyType = 'type';
  static const String jsonKeyPk = 'pk';

  /// PRAGMA table_info `notnull` (1 = NOT NULL), exposed as JSON boolean.
  static const String jsonKeyNotNull = 'notnull';
  static const String jsonKeyRowCount = 'rowCount';
  static const String pragmaFrom = 'from';
  static const String pragmaTo = 'to';
  static const String fkFromTable = 'fromTable';
  static const String fkFromColumn = 'fromColumn';
  static const String fkToTable = 'toTable';
  static const String fkToColumn = 'toColumn';
  static const String jsonKeyForeignKeys = 'foreignKeys';

  /// JSON key for the host-declared relationship manifest list (Feature 78),
  /// returned by GET /api/schema/relationships.
  static const String jsonKeyRelationships = 'relationships';

  /// JSON key for [DeclaredRelationship.orphanCheckable]. Emitted on a manifest
  /// edge only when `false` (true is the default and absence means true), so a
  /// reader of GET /api/schema/relationships can tell joinable edges from
  /// list_ref / seed_identity edges the orphan-row check must skip.
  static const String jsonKeyOrphanCheckable = 'orphanCheckable';

  /// JSON key naming which naming convention produced a soft-relationship
  /// finding (Feature 77): `'noun_id'` (stronger) or `'shared_uuid'`. Lets a
  /// consumer filter to the higher-confidence edges.
  static const String jsonKeyRule = 'rule';

  /// Soft-relationship advisory result-envelope keys (Feature 77), mirroring the
  /// orphan check's report shape so consumers read a familiar contract.
  static const String jsonKeySoftRelationships = 'softRelationships';
  static const String jsonKeyManifestAvailable = 'manifestAvailable';
  static const String jsonKeyDeclaredFkCount = 'declaredFkCount';
  static const String jsonKeyTablesScanned = 'tablesScanned';
  static const String jsonKeyHasPk = 'hasPk';
  static const String jsonKeyAddedRows = 'addedRows';
  static const String jsonKeyRemovedRows = 'removedRows';
  static const String jsonKeyChangedRows = 'changedRows';
  static const String jsonKeyChangedColumns = 'changedColumns';
  static const String jsonKeyThen = 'then';
  static const String jsonKeyNow = 'now';
  static const String jsonKeySnapshotId = 'snapshotId';
  static const String jsonKeySnapshotCreatedAt = 'snapshotCreatedAt';
  static const String jsonKeyComparedAt = 'comparedAt';
  static const String jsonKeySchemaSame = 'schemaSame';
  static const String jsonKeySchemaDiff = 'schemaDiff';
  static const String jsonKeyTablesOnlyInA = 'tablesOnlyInA';
  static const String jsonKeyTablesOnlyInB = 'tablesOnlyInB';
  static const String jsonKeyTableCounts = 'tableCounts';
  static const String jsonKeyGeneratedAt = 'generatedAt';
  static const String jsonKeyA = 'a';
  static const String jsonKeyB = 'b';
  static const int indexAfterSemicolon = 1;
  static const int minLimit = 1;

  /// Number of hex digits per byte in SQL X'...' literal (no_magic_number).
  static const int hexBytePadding = 2;

  /// Radix for hex in SQL X'...' literal (no_magic_number).
  static const int hexRadix = 16;
  static const String attachmentSchemaSql = 'schema.sql';
  static const String attachmentDumpSql = 'dump.sql';
  static const String contentTypeApplicationOctetStream = 'application';
  static const String contentTypeOctetStream = 'octet-stream';
  static const String contentTypeTextPlain = 'text';
  static const String charsetUtf8 = 'utf-8';

  /// Patterns for index suggestion heuristics (hoisted to avoid per-column allocation).
  static final RegExp reIdSuffix = RegExp(r'_id$', caseSensitive: false);

  // --- Rate limiting ---

  /// Default per-IP rate limit (requests per second). Applied when
  /// `maxRequestsPerSecond` is passed to `DriftDebugServer.start()`.
  static const int defaultMaxRequestsPerSecond = 100;

  /// HTTP header name for the retry-after interval (seconds) in 429
  /// responses.
  static const String headerRetryAfter = 'Retry-After';

  /// JSON error message returned in the body of HTTP 429 responses.
  static const String errorRateLimited =
      'Rate limit exceeded. Try again shortly.';

  /// When the per-IP rate-limit map grows beyond this many entries,
  /// stale entries (from IPs not seen in the current one-second
  /// window) are pruned to prevent unbounded memory growth.
  static const int rateLimitPruneThreshold = 256;
}
