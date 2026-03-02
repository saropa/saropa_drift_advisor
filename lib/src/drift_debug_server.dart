import 'dart:convert';
import 'dart:io';

/// Runs a single SQL query and returns rows as list of maps (column name -> value).
/// Used by [DriftDebugServer] to list tables and fetch table data; implement with
/// your Drift database's [customSelect] or any SQLite executor.
typedef DriftDebugQuery = Future<List<Map<String, dynamic>>> Function(String sql);

/// Optional logging: message only (for startup banner), or error + stack.
typedef DriftDebugOnLog = void Function(String message);
typedef DriftDebugOnError = void Function(Object error, StackTrace stack);

/// Debug-only HTTP server that exposes SQLite/Drift table data as JSON and a minimal web viewer.
/// Works with any database: pass a [query] callback that runs SQL and returns rows as maps.
///
/// Example (Drift):
/// ```dart
/// Future<List<Map<String, dynamic>>> runQuery(String sql) async {
///   final rows = await yourDriftDb.customSelect(sql).get();
///   return rows.map((r) => Map<String, dynamic>.from(r.data)).toList();
/// }
/// DriftDebugServer.start(
///   query: runQuery,
///   enabled: kDebugMode,
///   onLog: DriftDebugErrorLogger.logCallback(),
///   onError: DriftDebugErrorLogger.errorCallback(),
/// );
/// ```
abstract final class DriftDebugServer {
  static HttpServer? _server;
  static DriftDebugQuery? _query;
  static DriftDebugOnLog? _onLog;
  static DriftDebugOnError? _onError;
  static String? _corsOrigin;

  static const int _defaultPort = 8642;
  static const int _maxLimit = 1000;
  static const int _defaultLimit = 200;

  /// Starts the server if [enabled] is true and [query] is provided. No-op otherwise.
  /// Only one server per process; calling [start] when already running is a no-op.
  /// [query] must run the given SQL and return rows as list of maps (e.g. from Drift's customSelect).
  /// [port] defaults to 8642 so the URL stays stable across restarts.
  /// [loopbackOnly] if true, binds to 127.0.0.1 only; if false, binds to 0.0.0.0.
  /// [corsOrigin] sets the Access-Control-Allow-Origin response header: use `'*'` (default),
  /// a specific origin, or `null` to omit the header.
  static Future<void> start({
    required DriftDebugQuery query,
    bool enabled = true,
    int port = _defaultPort,
    bool loopbackOnly = false,
    String? corsOrigin = '*',
    DriftDebugOnLog? onLog,
    DriftDebugOnError? onError,
  }) async {
    if (!enabled) return;
    if (_server != null) return;

    _query = query;
    _onLog = onLog;
    _onError = onError;
    _corsOrigin = corsOrigin;

    try {
      final address = loopbackOnly ? InternetAddress.loopbackIPv4 : InternetAddress.anyIPv4;
      _server = await HttpServer.bind(address, port);
      _server!.listen(_onRequest);

      _log('╔══════════════════════════════════════════════════════════════╗');
      _log('║                   DRIFT DEBUG SERVER                         ║');
      _log('╟──────────────────────────────────────────────────────────────╢');
      _log('║  Open in browser to view SQLite/Drift data as JSON:           ║');
      _log('║  http://127.0.0.1:$port');
      _log('╚══════════════════════════════════════════════════════════════╝');
    } on Object catch (error, stack) {
      _onError?.call(error, stack);
    }
  }

  /// The port the server is bound to, or null if not running. Exposed for tests.
  static int? get port => _server?.port;

  /// Stops the server if running and clears stored state so [start] can be called again.
  /// No-op if the server was not started.
  static Future<void> stop() async {
    final server = _server;
    if (server == null) return;
    _server = null;
    _query = null;
    _onLog = null;
    _onError = null;
    _corsOrigin = null;
    await server.close();
  }

  static void _log(String message) {
    _onLog?.call(message);
  }

  static void _logError(Object error, StackTrace stack) {
    _onError?.call(error, stack);
  }

  static Future<void> _onRequest(HttpRequest request) async {
    final String path = request.uri.path;

    // Health is handled before query check so probes get 200 while server is running.
    try {
      if (request.method == 'GET' && (path == '/api/health' || path == 'api/health')) {
        await _sendHealth(request.response);
        return;
      }
    } on Object catch (error, stack) {
      _logError(error, stack);
      await _sendErrorResponse(request.response, error);
      return;
    }

    final DriftDebugQuery? query = _query;
    if (query == null) {
      request.response.statusCode = HttpStatus.serviceUnavailable;
      await request.response.close();
      return;
    }

    try {
      if (request.method == 'GET' && (path == '/' || path.isEmpty)) {
        await _sendHtml(request.response);
        return;
      }
      if (request.method == 'GET' && (path == '/api/tables' || path == 'api/tables')) {
        await _sendTableList(request.response, query);
        return;
      }
      if (request.method == 'GET' &&
          (path.startsWith('/api/table/') || path.startsWith('api/table/'))) {
        final String suffix =
            path.replaceFirst(RegExp(r'^/?api/table/'), '');
        // GET /api/table/<name>/count returns {"count": N}; limit/offset via query params for table data.
        if (suffix.endsWith('/count')) {
          final String tableName = suffix.replaceFirst(RegExp(r'/count$'), '');
          await _sendTableCount(request.response, query, tableName);
          return;
        }
        final String tableName = suffix;
        final int limit = _parseLimit(request.uri.queryParameters['limit']);
        final int offset = _parseOffset(request.uri.queryParameters['offset']);
        await _sendTableData(request.response, query, tableName, limit, offset);
        return;
      }
      if (request.method == 'GET' && (path == '/api/schema' || path == 'api/schema')) {
        await _sendSchemaDump(request.response, query);
        return;
      }
      if (request.method == 'GET' && (path == '/api/dump' || path == 'api/dump')) {
        await _sendFullDump(request.response, query);
        return;
      }

      request.response.statusCode = HttpStatus.notFound;
      await request.response.close();
    } on Object catch (error, stack) {
      _logError(error, stack);
      await _sendErrorResponse(request.response, error);
    }
  }

  /// Sends a 500 JSON error response and closes the response.
  static Future<void> _sendErrorResponse(HttpResponse response, Object error) async {
    response.statusCode = HttpStatus.internalServerError;
    response.headers.contentType = ContentType.json;
    _setCors(response);
    response.write(jsonEncode(<String, String>{'error': error.toString()}));
    await response.close();
  }

  static int _parseLimit(String? value) {
    if (value == null) return _defaultLimit;
    final int? n = int.tryParse(value);
    if (n == null || n < 1) return _defaultLimit;
    return n.clamp(1, _maxLimit);
  }

  /// Parses offset query param; returns 0 if missing or invalid.
  static int _parseOffset(String? value) {
    if (value == null) return 0;
    final int? n = int.tryParse(value);
    if (n == null || n < 0) return 0;
    return n;
  }

  static Future<List<String>> _getTableNames(DriftDebugQuery query) async {
    const String sql =
        "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name";
    final List<Map<String, dynamic>> rows = await query(sql);
    return rows.map((r) => r['name'] as String? ?? '').where((s) => s.isNotEmpty).toList();
  }

  static Future<void> _sendTableList(HttpResponse response, DriftDebugQuery query) async {
    final List<String> names = await _getTableNames(query);
    _setJsonHeaders(response);
    response.write(jsonEncode(names));
    await response.close();
  }

  /// Returns JSON {"count": N} for GET /api/table/<name>/count.
  static Future<void> _sendTableCount(
    HttpResponse response,
    DriftDebugQuery query,
    String tableName,
  ) async {
    final List<String> allowed = await _getTableNames(query);
    if (!allowed.contains(tableName)) {
      response.statusCode = HttpStatus.badRequest;
      _setJsonHeaders(response);
      response.write(jsonEncode(<String, String>{'error': 'Unknown table: $tableName'}));
      await response.close();
      return;
    }
    final List<Map<String, dynamic>> rows =
        await query('SELECT COUNT(*) AS c FROM "$tableName"');
    final int count = (rows.isNotEmpty && rows.first['c'] != null)
        ? (rows.first['c'] is int
            ? rows.first['c'] as int
            : (rows.first['c'] as num).toInt())
        : 0;
    _setJsonHeaders(response);
    response.write(jsonEncode(<String, int>{'count': count}));
    await response.close();
  }

  static Future<void> _sendTableData(
    HttpResponse response,
    DriftDebugQuery query,
    String tableName,
    int limit,
    int offset,
  ) async {
    final List<String> allowed = await _getTableNames(query);
    if (!allowed.contains(tableName)) {
      response.statusCode = HttpStatus.badRequest;
      _setJsonHeaders(response);
      response.write(jsonEncode(<String, String>{'error': 'Unknown table: $tableName'}));
      await response.close();
      return;
    }

    // Table name came from sqlite_master so safe to interpolate; limit/offset are validated.
    final List<Map<String, dynamic>> data =
        await query('SELECT * FROM "$tableName" LIMIT $limit OFFSET $offset');
    _setJsonHeaders(response);
    response.write(const JsonEncoder.withIndent('  ').convert(data));
    await response.close();
  }

  /// Fetches schema (CREATE statements) from sqlite_master, no data.
  static Future<String> _getSchemaSql(DriftDebugQuery query) async {
    const String sql = "SELECT type, name, sql FROM sqlite_master WHERE sql IS NOT NULL AND name NOT LIKE 'sqlite_%' ORDER BY type, name";
    final List<Map<String, dynamic>> rows = await query(sql);
    final buffer = StringBuffer();
    for (final row in rows) {
      final stmt = row['sql'] as String?;
      if (stmt != null && stmt.isNotEmpty) {
        buffer.writeln(stmt);
        if (!stmt.trimRight().endsWith(';')) buffer.write(';');
        buffer.writeln();
      }
    }
    return buffer.toString();
  }

  static Future<void> _sendHealth(HttpResponse response) async {
    _setJsonHeaders(response);
    response.write(jsonEncode(<String, dynamic>{'ok': true}));
    await response.close();
  }

  /// Sends schema-only SQL dump (CREATE statements from sqlite_master, no data).
  static Future<void> _sendSchemaDump(HttpResponse response, DriftDebugQuery query) async {
    final String schema = await _getSchemaSql(query);
    response.statusCode = HttpStatus.ok;
    _setAttachmentHeaders(response, 'schema.sql');
    response.write(schema);
    await response.close();
  }

  /// Escapes a value for use in a SQL INSERT literal (no quotes for numbers/null).
  static String _sqlLiteral(Object? value) {
    if (value == null) return 'NULL';
    if (value is num) return value.toString();
    if (value is bool) return value ? '1' : '0';
    if (value is String) {
      return "'${value.replaceAll(r'\', r'\\').replaceAll("'", "''")}'";
    }
    if (value is List<int>) {
      return "X'${value.map((b) => b.toRadixString(16).padLeft(2, '0')).join()}'";
    }
    return "'${value.toString().replaceAll(r'\', r'\\').replaceAll("'", "''")}'";
  }

  /// Builds full dump SQL: schema (CREATEs) plus INSERT statements for every table row.
  /// Table names come from allow-list so interpolation is safe.
  static Future<String> _getFullDumpSql(DriftDebugQuery query) async {
    final buffer = StringBuffer();
    buffer.writeln(await _getSchemaSql(query));
    buffer.writeln('-- Data dump');
    final tables = await _getTableNames(query);
    for (final table in tables) {
      final rows = await query('SELECT * FROM "$table"');
      if (rows.isEmpty) continue;
      final keys = rows.first.keys.toList();
      if (keys.isEmpty) continue;
      final colList = keys.map((k) => '"$k"').join(', ');
      for (final row in rows) {
        final values = keys.map((k) => _sqlLiteral(row[k])).join(', ');
        buffer.writeln('INSERT INTO "$table" ($colList) VALUES ($values);');
      }
    }
    return buffer.toString();
  }

  /// Sends full dump (schema + data) as downloadable SQL file. May be slow for large DBs.
  static Future<void> _sendFullDump(HttpResponse response, DriftDebugQuery query) async {
    final String dump = await _getFullDumpSql(query);
    response.statusCode = HttpStatus.ok;
    _setAttachmentHeaders(response, 'dump.sql');
    response.write(dump);
    await response.close();
  }

  static void _setAttachmentHeaders(HttpResponse response, String filename) {
    response.headers.contentType = ContentType('text', 'plain', charset: 'utf-8');
    response.headers.set('Content-Disposition', 'attachment; filename="$filename"');
    _setCors(response);
  }

  static void _setCors(HttpResponse response) {
    final origin = _corsOrigin;
    if (origin != null) {
      response.headers.set('Access-Control-Allow-Origin', origin);
    }
  }

  static void _setJsonHeaders(HttpResponse response) {
    response.headers.contentType = ContentType.json;
    _setCors(response);
  }

  static Future<void> _sendHtml(HttpResponse response) async {
    response.headers.contentType = ContentType.html;
    response.write(_indexHtml);
    await response.close();
  }

  static const String _indexHtml = '''
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Drift DB</title>
  <style>
    * { box-sizing: border-box; }
    body { font-family: system-ui, sans-serif; margin: 1rem; background: var(--bg); color: var(--fg); max-width: 100%; overflow-x: hidden; }
    body.theme-light { --bg: #f5f5f5; --fg: #1a1a1a; --bg-pre: #e8e8e8; --border: #ccc; --muted: #666; --link: #1565c0; --highlight-bg: #fff3cd; --highlight-fg: #856404; }
    body.theme-dark, body { --bg: #1a1a1a; --fg: #e0e0e0; --bg-pre: #252525; --border: #444; --muted: #888; --link: #7eb8da; --highlight-bg: #5a4a32; --highlight-fg: #f0e0c0; }
    h1 { font-size: 1.25rem; }
    ul { list-style: none; padding: 0; }
    li { margin: 0.25rem 0; }
    a { color: var(--link); text-decoration: none; }
    a:hover { text-decoration: underline; }
    .content-wrap { max-width: 100%; min-width: 0; }
    pre { background: var(--bg-pre); padding: 1rem; overflow: auto; font-size: 12px; border-radius: 6px; max-height: 70vh; white-space: pre-wrap; word-break: break-word; margin: 0; color: var(--fg); border: 1px solid var(--border); }
    .meta { color: var(--muted); font-size: 0.875rem; margin-bottom: 0.5rem; }
    .search-bar { display: flex; align-items: center; gap: 0.5rem; margin-bottom: 0.75rem; flex-wrap: wrap; }
    .search-bar input, .search-bar select, .search-bar button { padding: 0.35rem 0.5rem; background: var(--bg-pre); border: 1px solid var(--border); color: var(--fg); border-radius: 4px; }
    .search-bar input { min-width: 12rem; }
    .search-bar label { color: var(--muted); font-size: 0.875rem; }
    .highlight { background: var(--highlight-bg); color: var(--highlight-fg); border-radius: 2px; }
    .search-section { margin-bottom: 1rem; }
    .search-section h2 { font-size: 1rem; color: var(--muted); margin: 0 0 0.25rem 0; }
    .toolbar { display: flex; align-items: center; gap: 0.75rem; flex-wrap: wrap; margin-bottom: 0.5rem; }
    .collapsible-header { cursor: pointer; user-select: none; padding: 0.25rem 0; color: var(--link); }
    .collapsible-header:hover { text-decoration: underline; }
    .collapsible-body { margin-top: 0.25rem; }
    .collapsible-body.collapsed { display: none; }
  </style>
</head>
<body>
  <h1>Drift tables <button type="button" id="theme-toggle" title="Toggle light/dark">Theme</button></h1>
  <div class="search-bar">
    <label for="search-input">Search:</label>
    <input type="text" id="search-input" placeholder="Search…" />
    <label for="search-scope">in</label>
    <select id="search-scope">
      <option value="schema">Schema only</option>
      <option value="data">DB data only</option>
      <option value="both">Both</option>
    </select>
    <label for="row-filter">Filter rows:</label>
    <input type="text" id="row-filter" placeholder="Column value…" title="Client-side filter on current table" />
  </div>
  <div id="pagination-bar" class="toolbar" style="display: none;">
    <label>Limit</label>
    <select id="pagination-limit"></select>
    <label>Offset</label>
    <input type="number" id="pagination-offset" min="0" step="200" style="width: 5rem;" />
    <button type="button" id="pagination-prev">Prev</button>
    <button type="button" id="pagination-next">Next</button>
    <button type="button" id="pagination-apply">Apply</button>
  </div>
  <p id="tables-loading" class="meta">Loading tables…</p>
  <p class="meta"><a href="/api/schema" id="export-schema" download="schema.sql">Export schema (no data)</a> · <a href="#" id="export-dump">Export full dump (schema + data)</a><span id="export-dump-status" class="meta"></span> · <a href="#" id="export-csv">Export table as CSV</a><span id="export-csv-status" class="meta"></span></p>
  <div class="collapsible-header" id="schema-toggle">▼ Schema</div>
  <div id="schema-collapsible" class="collapsible-body collapsed"><pre id="schema-inline-pre" class="meta">Loading…</pre></div>
  <ul id="tables"></ul>
  <div id="content" class="content-wrap"></div>
  <script>
    function esc(s) {
      if (s == null) return '';
      const d = document.createElement('div');
      d.textContent = s;
      return d.innerHTML;
    }
    function escapeRe(s) {
      return s.replace(/[\\\\^\$*+?.()|[\\]{}]/g, '\\\\\$&');
    }
    function highlightText(text, term) {
      if (!term || term.length === 0) return esc(text);
      const re = new RegExp('(' + escapeRe(term) + ')', 'gi');
      var result = '';
      var lastEnd = 0;
      var match;
      while ((match = re.exec(text)) !== null) {
        result += esc(text.slice(lastEnd, match.index)) + '<span class="highlight">' + esc(match[1]) + '</span>';
        lastEnd = re.lastIndex;
      }
      result += esc(text.slice(lastEnd));
      return result;
    }
    const THEME_KEY = 'drift-viewer-theme';
    const LIMIT_OPTIONS = [50, 200, 500, 1000];
    let cachedSchema = null;
    let currentTableName = null;
    let currentTableJson = null;
    let lastRenderedSchema = null;
    let lastRenderedData = null;
    let limit = 200;
    let offset = 0;
    let tableCounts = {};
    let rowFilter = '';

    function initTheme() {
      const saved = localStorage.getItem(THEME_KEY);
      const dark = saved !== 'light';
      document.body.classList.toggle('theme-light', !dark);
      document.body.classList.toggle('theme-dark', dark);
      document.getElementById('theme-toggle').textContent = dark ? 'Dark' : 'Light';
    }
    document.getElementById('theme-toggle').addEventListener('click', function() {
      const isLight = document.body.classList.contains('theme-light');
      document.body.classList.toggle('theme-light', isLight);
      document.body.classList.toggle('theme-dark', !isLight);
      localStorage.setItem(THEME_KEY, isLight ? 'dark' : 'light');
      document.getElementById('theme-toggle').textContent = isLight ? 'Dark' : 'Light';
    });
    initTheme();

    document.getElementById('schema-toggle').addEventListener('click', function() {
      const el = document.getElementById('schema-collapsible');
      const isCollapsed = el.classList.contains('collapsed');
      el.classList.toggle('collapsed', !isCollapsed);
      this.textContent = isCollapsed ? '▲ Schema' : '▼ Schema';
      if (isCollapsed && cachedSchema === null) {
        fetch('/api/schema').then(r => r.text()).then(schema => {
          cachedSchema = schema;
          document.getElementById('schema-inline-pre').textContent = schema;
        }).catch(() => { document.getElementById('schema-inline-pre').textContent = 'Failed to load.'; });
      }
    });

    document.getElementById('export-csv').addEventListener('click', function(e) {
      e.preventDefault();
      if (!currentTableName || !currentTableJson || currentTableJson.length === 0) {
        document.getElementById('export-csv-status').textContent = ' Select a table with data first.';
        return;
      }
      const statusEl = document.getElementById('export-csv-status');
      statusEl.textContent = ' Preparing…';
      try {
        const keys = Object.keys(currentTableJson[0]);
        const rowToCsv = (row) => keys.map(k => {
          const v = row[k];
          if (v == null) return '';
          const s = String(v);
          return s.includes(',') || s.includes('"') || s.includes('\\n') ? '"' + s.replace(/"/g, '""') + '"' : s;
        }).join(',');
        const csv = [keys.join(','), ...currentTableJson.map(rowToCsv)].join('\\n');
        const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = currentTableName + '.csv';
        a.click();
        URL.revokeObjectURL(url);
      } catch (err) {
        statusEl.textContent = ' Failed: ' + err.message;
        return;
      }
      statusEl.textContent = '';
    });

    function getScope() { return document.getElementById('search-scope').value; }
    function getSearchTerm() { return (document.getElementById('search-input').value || '').trim(); }
    function getRowFilter() { return (document.getElementById('row-filter').value || '').trim(); }
    function filterRows(data) {
      const term = getRowFilter();
      if (!term || !data || data.length === 0) return data || [];
      const lower = term.toLowerCase();
      return data.filter(row => Object.values(row).some(v => v != null && String(v).toLowerCase().includes(lower)));
    }

    function applySearch() {
      const term = getSearchTerm();
      const scope = getScope();
      const schemaPre = document.getElementById('schema-pre');
      const dataPre = document.getElementById('data-pre');
      if (schemaPre && lastRenderedSchema !== null && (scope === 'schema' || scope === 'both')) {
        schemaPre.innerHTML = term ? highlightText(lastRenderedSchema, term) : esc(lastRenderedSchema);
      }
      if (dataPre && lastRenderedData !== null && (scope === 'data' || scope === 'both')) {
        dataPre.innerHTML = term ? highlightText(lastRenderedData, term) : esc(lastRenderedData);
      }
      const singlePre = document.getElementById('content-pre');
      if (singlePre && (lastRenderedSchema !== null || lastRenderedData !== null)) {
        const raw = lastRenderedData !== null ? lastRenderedData : lastRenderedSchema;
        singlePre.innerHTML = term ? highlightText(raw, term) : esc(raw);
      }
    }

    document.getElementById('search-input').addEventListener('input', applySearch);
    document.getElementById('search-input').addEventListener('keyup', applySearch);
    document.getElementById('row-filter').addEventListener('input', function() { if (currentTableName && currentTableJson) renderTableView(currentTableName, currentTableJson); });
    document.getElementById('row-filter').addEventListener('keyup', function() { if (currentTableName && currentTableJson) renderTableView(currentTableName, currentTableJson); });
    document.getElementById('search-scope').addEventListener('change', function() {
      const scope = getScope();
      const content = document.getElementById('content');
      const paginationBar = document.getElementById('pagination-bar');
      if (scope === 'both') {
        loadBothView();
        paginationBar.style.display = (currentTableName ? 'flex' : 'none');
      } else if (scope === 'schema') {
        loadSchemaView();
        paginationBar.style.display = 'none';
      } else if (currentTableName) {
        renderTableView(currentTableName, currentTableJson);
        paginationBar.style.display = 'flex';
      } else {
        content.innerHTML = '';
        lastRenderedSchema = null;
        lastRenderedData = null;
        paginationBar.style.display = 'none';
      }
      applySearch();
    });

    document.getElementById('export-dump').addEventListener('click', function(e) {
      e.preventDefault();
      const link = this;
      const statusEl = document.getElementById('export-dump-status');
      const origText = link.textContent;
      link.textContent = 'Preparing dump…';
      statusEl.textContent = '';
      fetch('/api/dump')
        .then(r => { if (!r.ok) throw new Error(r.statusText); return r.blob(); })
        .then(blob => {
          const url = URL.createObjectURL(blob);
          const a = document.createElement('a');
          a.href = url;
          a.download = 'dump.sql';
          a.click();
          URL.revokeObjectURL(url);
        })
        .catch(err => { statusEl.textContent = ' Failed: ' + err.message; })
        .finally(() => { link.textContent = origText; });
    });

    function setupPagination() {
      const bar = document.getElementById('pagination-bar');
      const limitSel = document.getElementById('pagination-limit');
      limitSel.innerHTML = LIMIT_OPTIONS.map(n => '<option value="' + n + '"' + (n === limit ? ' selected' : '') + '>' + n + '</option>').join('');
      document.getElementById('pagination-offset').value = offset;
      bar.style.display = getScope() === 'schema' ? 'none' : 'flex';
    }
    document.getElementById('pagination-limit').addEventListener('change', function() { limit = parseInt(this.value, 10); loadTable(currentTableName); });
    document.getElementById('pagination-offset').addEventListener('change', function() { offset = parseInt(this.value, 10) || 0; });
    document.getElementById('pagination-prev').addEventListener('click', function() { offset = Math.max(0, offset - limit); document.getElementById('pagination-offset').value = offset; loadTable(currentTableName); });
    document.getElementById('pagination-next').addEventListener('click', function() { offset = offset + limit; document.getElementById('pagination-offset').value = offset; loadTable(currentTableName); });
    document.getElementById('pagination-apply').addEventListener('click', function() { offset = parseInt(document.getElementById('pagination-offset').value, 10) || 0; loadTable(currentTableName); });

    function loadSchemaView() {
      const content = document.getElementById('content');
      content.innerHTML = '<p class="meta">Loading schema…</p>';
      if (cachedSchema !== null) {
        renderSchemaContent(content, cachedSchema);
        applySearch();
        return;
      }
      fetch('/api/schema')
        .then(r => r.text())
        .then(schema => {
          cachedSchema = schema;
          renderSchemaContent(content, schema);
          applySearch();
        })
        .catch(e => { content.innerHTML = '<p class="meta">Error</p><pre>' + esc(String(e)) + '</pre>'; });
    }

    function renderSchemaContent(container, schema) {
      lastRenderedData = null;
      lastRenderedSchema = schema;
      const scope = getScope();
      if (scope === 'both') {
        container.innerHTML = '<div class="search-section"><h2>Schema</h2><pre id="schema-pre">' + esc(schema) + '</pre></div><div class="search-section" id="both-data-section"><h2>Table data</h2><p class="meta">Select a table above to load data.</p></div>';
        const dataSection = document.getElementById('both-data-section');
        if (currentTableName && currentTableJson !== null) {
          const filtered = filterRows(currentTableJson);
          const jsonStr = JSON.stringify(filtered, null, 2);
          lastRenderedData = jsonStr;
          const metaText = rowCountText(currentTableName) + (getRowFilter() ? ' (filtered: ' + filtered.length + ' of ' + currentTableJson.length + ')' : '');
          dataSection.innerHTML = '<h2>Table data: ' + esc(currentTableName) + '</h2><p class="meta">' + metaText + '</p><pre id="data-pre">' + esc(jsonStr) + '</pre>';
        }
      } else {
        container.innerHTML = '<p class="meta">Schema</p><pre id="content-pre">' + esc(schema) + '</pre>';
      }
    }

    function loadBothView() {
      const content = document.getElementById('content');
      content.innerHTML = '<p class="meta">Loading…</p>';
      (cachedSchema !== null ? Promise.resolve(cachedSchema) : fetch('/api/schema').then(r => r.text()))
      .then(schema => {
        if (cachedSchema === null) cachedSchema = schema;
        lastRenderedSchema = schema;
        let dataHtml = '';
        if (currentTableName && currentTableJson !== null) {
          const filtered = filterRows(currentTableJson);
          const jsonStr = JSON.stringify(filtered, null, 2);
          lastRenderedData = jsonStr;
          const metaText = rowCountText(currentTableName) + (getRowFilter() ? ' (filtered: ' + filtered.length + ' of ' + currentTableJson.length + ')' : '');
          dataHtml = '<p class="meta">' + metaText + '</p><pre id="data-pre">' + esc(jsonStr) + '</pre>';
        } else {
          lastRenderedData = null;
          dataHtml = '<p class="meta">Select a table above to load data.</p>';
        }
        content.innerHTML = '<div class="search-section"><h2>Schema</h2><pre id="schema-pre">' + esc(schema) + '</pre></div><div class="search-section" id="both-data-section"><h2>Table data</h2>' + dataHtml + '</div>';
        applySearch();
      }).catch(e => { content.innerHTML = '<p class="meta">Error</p><pre>' + esc(String(e)) + '</pre>'; });
    }

    function rowCountText(name) {
      const total = tableCounts[name];
      const len = (currentTableJson && currentTableJson.length) || 0;
      if (total == null) return esc(name) + ' (up to ' + limit + ' rows)';
      const rangeText = len > 0 ? ('showing ' + (offset + 1) + '–' + (offset + len)) : 'no rows in this range';
      return esc(name) + ' (' + total + ' row' + (total !== 1 ? 's' : '') + '; ' + rangeText + ')';
    }
    function renderTableView(name, data) {
      const content = document.getElementById('content');
      const scope = getScope();
      const filtered = filterRows(data);
      const jsonStr = JSON.stringify(filtered, null, 2);
      lastRenderedData = jsonStr;
      const metaText = rowCountText(name) + (getRowFilter() ? ' (filtered: ' + filtered.length + ' of ' + data.length + ')' : '');
      if (scope === 'both') {
        lastRenderedSchema = cachedSchema;
        if (cachedSchema === null) {
          fetch('/api/schema').then(r => r.text()).then(schema => {
            cachedSchema = schema;
            lastRenderedSchema = schema;
            content.innerHTML = '<div class="search-section"><h2>Schema</h2><pre id="schema-pre">' + esc(schema) + '</pre></div><div class="search-section" id="both-data-section"><h2>Table data: ' + esc(name) + '</h2><p class="meta">' + metaText + '</p><pre id="data-pre">' + esc(jsonStr) + '</pre></div>';
            applySearch();
          });
        } else {
          const dataSection = document.getElementById('both-data-section');
          if (dataSection) {
            dataSection.innerHTML = '<h2>Table data: ' + esc(name) + '</h2><p class="meta">' + metaText + '</p><pre id="data-pre">' + esc(jsonStr) + '</pre>';
          }
          applySearch();
        }
      } else {
        lastRenderedSchema = null;
        content.innerHTML = '<p class="meta">' + metaText + '</p><pre id="content-pre">' + esc(jsonStr) + '</pre>';
        applySearch();
      }
    }

    function loadTable(name) {
      currentTableName = name;
      const content = document.getElementById('content');
      const scope = getScope();
      if (scope === 'both' && cachedSchema !== null) {
        content.innerHTML = '<p class="meta">Loading ' + esc(name) + '…</p>';
      } else if (scope !== 'both') {
        content.innerHTML = '<p class="meta">' + esc(name) + '</p><p class="meta">Loading…</p>';
      }
      fetch('/api/table/' + encodeURIComponent(name) + '?limit=' + limit + '&offset=' + offset)
        .then(r => r.json())
        .then(data => {
          if (currentTableName !== name) return;
          currentTableJson = data;
          setupPagination();
          renderTableView(name, data);
          fetch('/api/table/' + encodeURIComponent(name) + '/count')
            .then(r => r.json())
            .then(o => {
              if (currentTableName !== name) return;
              tableCounts[name] = o.count;
              renderTableView(name, data);
            })
            .catch(() => {});
        })
        .catch(e => {
          if (currentTableName !== name) return;
          content.innerHTML = '<p class="meta">Error</p><pre>' + esc(String(e)) + '</pre>';
        });
    }

    function renderTableList(tables) {
      const ul = document.getElementById('tables');
      ul.innerHTML = '';
      tables.forEach(t => {
        const li = document.createElement('li');
        const a = document.createElement('a');
        a.href = '#' + encodeURIComponent(t);
        a.textContent = (tableCounts[t] != null) ? (t + ' (' + tableCounts[t] + ' rows)') : t;
        a.onclick = e => { e.preventDefault(); loadTable(t); };
        li.appendChild(a);
        ul.appendChild(li);
      });
    }
    fetch('/api/tables')
      .then(r => r.json())
      .then(tables => {
        const loadingEl = document.getElementById('tables-loading');
        loadingEl.style.display = 'none';
        renderTableList(tables);
        tables.forEach(t => {
          fetch('/api/table/' + encodeURIComponent(t) + '/count')
            .then(r => r.json())
            .then(o => { tableCounts[t] = o.count; renderTableList(tables); })
            .catch(() => {});
        });
      })
      .catch(e => { document.getElementById('tables-loading').textContent = 'Failed to load tables: ' + e; });
  </script>
</body>
</html>''';
}
