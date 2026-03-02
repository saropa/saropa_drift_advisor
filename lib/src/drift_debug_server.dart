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
      if (request.method == 'GET' && (path.startsWith('/api/table/') || path.startsWith('api/table/'))) {
        final String tableName = path.replaceFirst(RegExp(r'^/?api/table/'), '');
        final int limit = _parseLimit(request.uri.queryParameters['limit']);
        await _sendTableData(request.response, query, tableName, limit);
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

  static Future<void> _sendTableData(
    HttpResponse response,
    DriftDebugQuery query,
    String tableName,
    int limit,
  ) async {
    final List<String> allowed = await _getTableNames(query);
    if (!allowed.contains(tableName)) {
      response.statusCode = HttpStatus.badRequest;
      _setJsonHeaders(response);
      response.write(jsonEncode(<String, String>{'error': 'Unknown table: $tableName'}));
      await response.close();
      return;
    }

    // Table name came from sqlite_master so safe to interpolate; limit is clamped.
    final List<Map<String, dynamic>> data = await query('SELECT * FROM "$tableName" LIMIT $limit');
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
    body { font-family: system-ui, sans-serif; margin: 1rem; background: #1a1a1a; color: #e0e0e0; max-width: 100%; overflow-x: hidden; }
    h1 { font-size: 1.25rem; }
    ul { list-style: none; padding: 0; }
    li { margin: 0.25rem 0; }
    a { color: #7eb8da; text-decoration: none; }
    a:hover { text-decoration: underline; }
    .content-wrap { max-width: 100%; min-width: 0; }
    pre { background: #252525; padding: 1rem; overflow: auto; font-size: 12px; border-radius: 6px; max-height: 70vh; white-space: pre-wrap; word-break: break-word; margin: 0; }
    .meta { color: #888; font-size: 0.875rem; margin-bottom: 0.5rem; }
    .search-bar { display: flex; align-items: center; gap: 0.5rem; margin-bottom: 0.75rem; flex-wrap: wrap; }
    .search-bar input { padding: 0.35rem 0.5rem; background: #252525; border: 1px solid #444; color: #e0e0e0; border-radius: 4px; min-width: 12rem; }
    .search-bar select { padding: 0.35rem 0.5rem; background: #252525; border: 1px solid #444; color: #e0e0e0; border-radius: 4px; }
    .search-bar label { color: #888; font-size: 0.875rem; }
    .highlight { background: #5a4a32; color: #f0e0c0; border-radius: 2px; }
    .search-section { margin-bottom: 1rem; }
    .search-section h2 { font-size: 1rem; color: #aaa; margin: 0 0 0.25rem 0; }
  </style>
</head>
<body>
  <h1>Drift tables</h1>
  <div class="search-bar">
    <label for="search-input">Search:</label>
    <input type="text" id="search-input" placeholder="Search…" />
    <label for="search-scope">in</label>
    <select id="search-scope">
      <option value="schema">Schema only</option>
      <option value="data">DB data only</option>
      <option value="both">Both</option>
    </select>
  </div>
  <p id="tables-loading" class="meta">Loading tables…</p>
  <p class="meta"><a href="/api/schema" id="export-schema" download="schema.sql">Export schema (no data)</a> · <a href="/api/dump" id="export-dump" download="dump.sql">Export full dump (schema + data)</a> · <a href="#" id="view-schema">View schema</a></p>
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
    let cachedSchema = null;
    let currentTableName = null;
    let currentTableJson = null;
    let lastRenderedSchema = null;
    let lastRenderedData = null;
    const limit = 200;

    function getScope() { return document.getElementById('search-scope').value; }
    function getSearchTerm() { return (document.getElementById('search-input').value || '').trim(); }

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
    document.getElementById('search-scope').addEventListener('change', function() {
      const scope = getScope();
      const content = document.getElementById('content');
      if (scope === 'both') {
        loadBothView();
      } else if (scope === 'schema') {
        loadSchemaView();
      } else if (currentTableName) {
        renderTableView(currentTableName, currentTableJson);
      } else {
        content.innerHTML = '';
        lastRenderedSchema = null;
        lastRenderedData = null;
      }
      applySearch();
    });

    document.getElementById('view-schema').addEventListener('click', function(e) {
      e.preventDefault();
      getScope() === 'both' ? loadBothView() : loadSchemaView();
    });

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
          const jsonStr = JSON.stringify(currentTableJson, null, 2);
          lastRenderedData = jsonStr;
          dataSection.innerHTML = '<h2>Table data: ' + esc(currentTableName) + '</h2><pre id="data-pre">' + esc(jsonStr) + '</pre>';
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
          const jsonStr = JSON.stringify(currentTableJson, null, 2);
          lastRenderedData = jsonStr;
          dataHtml = '<p class="meta">' + esc(currentTableName) + ' (up to ' + limit + ' rows)</p><pre id="data-pre">' + esc(jsonStr) + '</pre>';
        } else {
          lastRenderedData = null;
          dataHtml = '<p class="meta">Select a table above to load data.</p>';
        }
        content.innerHTML = '<div class="search-section"><h2>Schema</h2><pre id="schema-pre">' + esc(schema) + '</pre></div><div class="search-section" id="both-data-section"><h2>Table data</h2>' + dataHtml + '</div>';
        applySearch();
      }).catch(e => { content.innerHTML = '<p class="meta">Error</p><pre>' + esc(String(e)) + '</pre>'; });
    }

    function renderTableView(name, data) {
      const content = document.getElementById('content');
      const scope = getScope();
      const jsonStr = JSON.stringify(data, null, 2);
      lastRenderedData = jsonStr;
      if (scope === 'both') {
        lastRenderedSchema = cachedSchema;
        if (cachedSchema === null) {
          fetch('/api/schema').then(r => r.text()).then(schema => {
            cachedSchema = schema;
            lastRenderedSchema = schema;
            content.innerHTML = '<div class="search-section"><h2>Schema</h2><pre id="schema-pre">' + esc(schema) + '</pre></div><div class="search-section" id="both-data-section"><h2>Table data: ' + esc(name) + '</h2><p class="meta">' + esc(name) + ' (up to ' + limit + ' rows)</p><pre id="data-pre">' + esc(jsonStr) + '</pre></div>';
            applySearch();
          });
        } else {
          const dataSection = document.getElementById('both-data-section');
          if (dataSection) {
            dataSection.innerHTML = '<h2>Table data: ' + esc(name) + '</h2><p class="meta">' + esc(name) + ' (up to ' + limit + ' rows)</p><pre id="data-pre">' + esc(jsonStr) + '</pre>';
          }
          applySearch();
        }
      } else {
        lastRenderedSchema = null;
        content.innerHTML = '<p class="meta">' + esc(name) + ' (up to ' + limit + ' rows)</p><pre id="content-pre">' + esc(jsonStr) + '</pre>';
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
      fetch('/api/table/' + encodeURIComponent(name) + '?limit=' + limit)
        .then(r => r.json())
        .then(data => {
          currentTableJson = data;
          renderTableView(name, data);
        })
        .catch(e => { content.innerHTML = '<p class="meta">Error</p><pre>' + esc(String(e)) + '</pre>'; });
    }

    fetch('/api/tables')
      .then(r => r.json())
      .then(tables => {
        const loadingEl = document.getElementById('tables-loading');
        loadingEl.style.display = 'none';
        const ul = document.getElementById('tables');
        tables.forEach(t => {
          const li = document.createElement('li');
          const a = document.createElement('a');
          a.href = '#' + encodeURIComponent(t);
          a.textContent = t;
          a.onclick = e => { e.preventDefault(); loadTable(t); };
          li.appendChild(a);
          ul.appendChild(li);
        });
      })
      .catch(e => { document.getElementById('tables-loading').textContent = 'Failed to load tables: ' + e; });
  </script>
</body>
</html>''';
}
