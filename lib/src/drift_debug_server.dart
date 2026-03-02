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
///   onLog: (m) => debugPrint(m),
///   onError: (e, s) => debugPrint('$e\n$s'),
/// );
/// ```
abstract final class DriftDebugServer {
  static HttpServer? _server;
  static DriftDebugQuery? _query;
  static DriftDebugOnLog? _onLog;
  static DriftDebugOnError? _onError;

  static const int _defaultPort = 8642;
  static const int _maxLimit = 1000;
  static const int _defaultLimit = 200;

  /// Starts the server if [enabled] is true and [query] is provided. No-op otherwise.
  /// [query] must run the given SQL and return rows as list of maps (e.g. from Drift's customSelect).
  /// [port] defaults to 8642 so the URL stays stable across restarts.
  static Future<void> start({
    required DriftDebugQuery query,
    bool enabled = true,
    int port = _defaultPort,
    DriftDebugOnLog? onLog,
    DriftDebugOnError? onError,
  }) async {
    if (!enabled) return;
    if (_server != null) return;

    _query = query;
    _onLog = onLog;
    _onError = onError;

    try {
      _server = await HttpServer.bind(InternetAddress.anyIPv4, port);
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

  static void _log(String message) {
    _onLog?.call(message);
  }

  static void _logError(Object error, StackTrace stack) {
    _onError?.call(error, stack);
  }

  static Future<void> _onRequest(HttpRequest request) async {
    final String path = request.uri.path;
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

      request.response.statusCode = HttpStatus.notFound;
      await request.response.close();
    } on Object catch (error, stack) {
      _logError(error, stack);
      request.response.statusCode = HttpStatus.internalServerError;
      request.response.headers.contentType = ContentType.json;
      request.response.write(jsonEncode(<String, String>{'error': error.toString()}));
      await request.response.close();
    }
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

  static void _setJsonHeaders(HttpResponse response) {
    response.headers.contentType = ContentType.json;
    response.headers.set('Access-Control-Allow-Origin', '*');
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
  </style>
</head>
<body>
  <h1>Drift tables</h1>
  <p id="tables-loading" class="meta">Loading tables…</p>
  <ul id="tables"></ul>
  <div id="content" class="content-wrap"></div>
  <script>
    function esc(s) {
      if (s == null) return '';
      const d = document.createElement('div');
      d.textContent = s;
      return d.innerHTML;
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

    function loadTable(name) {
      const limit = 200;
      const content = document.getElementById('content');
      content.innerHTML = '<p class="meta">' + esc(name) + '</p><p class="meta">Loading…</p>';
      fetch('/api/table/' + encodeURIComponent(name) + '?limit=' + limit)
        .then(r => r.json())
        .then(data => {
          const jsonStr = JSON.stringify(data, null, 2);
          content.innerHTML = '<p class="meta">' + esc(name) + ' (up to ' + limit + ' rows)</p><pre>' + esc(jsonStr) + '</pre>';
        })
        .catch(e => { content.innerHTML = '<p class="meta">Error</p><pre>' + esc(String(e)) + '</pre>'; });
    }
  </script>
</body>
</html>''';
}
