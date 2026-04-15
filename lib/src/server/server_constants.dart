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
  static const Duration longPollTimeout = Duration(seconds: 30);

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
  static const String pathApiHealth = '/api/health';
  static const String pathApiHealthAlt = 'api/health';
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
  static const String pathApiSchemaDiagram = '/api/schema/diagram';
  static const String pathApiSchemaDiagramAlt = 'api/schema/diagram';
  static const String pathApiSchemaMetadata = '/api/schema/metadata';
  static const String pathApiSchemaMetadataAlt = 'api/schema/metadata';
  static const String pathApiDump = '/api/dump';
  static const String pathApiDumpAlt = 'api/dump';
  static const String pathApiDatabase = '/api/database';
  static const String pathApiDatabaseAlt = 'api/database';
  static const String pathApiSnapshot = '/api/snapshot';
  static const String pathApiSnapshotAlt = 'api/snapshot';
  static const String pathApiSnapshotCompare = '/api/snapshot/compare';
  static const String pathApiSnapshotCompareAlt = 'api/snapshot/compare';
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
  static const String pathApiChangeDetection = '/api/change-detection';
  static const String pathApiChangeDetectionAlt = 'api/change-detection';
  static const String pathApiMutations = '/api/mutations';
  static const String pathApiMutationsAlt = 'api/mutations';
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
  static const String packageVersion = '3.2.1';

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
  static const String queryParamFormat = 'format';
  static const String queryParamDetail = 'detail';
  static const String formatDownload = 'download';
  static const String detailRows = 'rows';
  static const String jsonKeyEnabled = 'enabled';
  static const String jsonKeyChangeDetection = 'changeDetection';
  static const String jsonKeyError = 'error';
  static const String jsonKeyRows = 'rows';
  static const String jsonKeySql = 'sql';

  /// JSON body field: list of single-statement SQL strings (POST /api/edits/apply).
  static const String jsonKeyStatements = 'statements';
  static const String jsonKeyCount = 'count';
  static const String jsonKeyOk = 'ok';

  /// True when HTTP clients may call write endpoints ([writeQuery] configured).
  static const String jsonKeyWriteEnabled = 'writeEnabled';
  static const String jsonKeyGeneration = 'generation';
  static const String jsonKeySnapshot = 'snapshot';
  static const String jsonKeyId = 'id';
  static const String jsonKeyCreatedAt = 'createdAt';
  static const String jsonKeyTableCount = 'tableCount';
  static const String jsonKeyTables = 'tables';
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
  static const String jsonKeyPriority = 'priority';
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
  static const String errorInvalidJson = 'Invalid JSON';
  static const String errorMissingSql = 'Missing or empty sql';
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
  static const String sqlTableNames =
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
