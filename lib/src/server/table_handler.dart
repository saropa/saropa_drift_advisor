// Table data handler extracted from _DriftDebugServerImpl.
// Handles table list, data, columns, count, and FK metadata.

import 'dart:convert';
import 'dart:io';

import 'server_constants.dart';
import 'server_context.dart';
import 'server_utils.dart';

/// Handles table-related API endpoints.
final class TableHandler {
  /// Creates a [TableHandler] with the given [ServerContext].
  TableHandler(this._ctx);

  final ServerContext _ctx;

  /// GET /api/tables — returns JSON object with table
  /// names and their row counts (when available from
  /// the last change-detection cycle).
  ///
  /// Response shape:
  ///   {"tables": [...], "counts": {"t1": 10, ...}}
  ///
  /// Including counts inline eliminates the need for
  /// the web UI to fire individual /api/table/<name>/count
  /// requests for every table, dramatically reducing
  /// "Drift: Sent" console spam when logStatements is
  /// enabled on the user's database.
  Future<void> sendTableList(
    HttpResponse response,
    DriftDebugQuery query,
  ) async {
    final res = response;
    await _ctx.checkDataChange();

    // Prefer cached table names (populated by
    // checkDataChange) to avoid a redundant
    // sqlite_master query.
    final List<String> names =
        _ctx.cachedTableNames ?? await ServerUtils.getTableNames(query);

    // Include cached row counts so the web UI does
    // not need to fire individual count requests.
    // Empty map when counts are not yet available
    // (before the first checkDataChange cycle).
    final Map<String, int> counts = _ctx.cachedTableCounts ?? <String, int>{};

    _ctx.setJsonHeaders(res);
    res.write(
      jsonEncode(<String, dynamic>{
        ServerConstants.jsonKeyTables: names,
        ServerConstants.jsonKeyCounts: counts,
      }),
    );
    await res.close();
  }

  /// Returns JSON list of column names for
  /// GET `/api/table/<name>/columns`.
  Future<void> sendTableColumns({
    required HttpResponse response,
    required DriftDebugQuery query,
    required String tableName,
  }) async {
    final res = response;
    if (!await _ctx.requireKnownTable(
      response: res,
      queryFn: query,
      tableName: tableName,
    ))
      return;
    final dynamic rawInfo = await query('PRAGMA table_info("$tableName")');
    final List<Map<String, dynamic>> rows = ServerUtils.normalizeRows(rawInfo);
    final List<String> columns = rows
        .map((r) => r[ServerConstants.jsonKeyName] as String? ?? '')
        .where((s) => s.isNotEmpty)
        .toList();
    _ctx.setJsonHeaders(res);
    res.write(jsonEncode(columns));
    await res.close();
  }

  /// Converts normalized `PRAGMA foreign_key_list` rows into the JSON maps
  /// returned by [getTableFkMetaList] and embedded in schema metadata when
  /// `includeForeignKeys` is requested.
  static List<Map<String, dynamic>> fkMetaMapsFromPragmaRows(
    List<Map<String, dynamic>> fkRows,
  ) {
    return fkRows
        .map((r) {
          final fromCol = r[ServerConstants.pragmaFrom] as String?;
          final toTable = r[ServerConstants.jsonKeyTable] as String?;
          final toCol = r[ServerConstants.pragmaTo] as String?;
          if (fromCol == null || toTable == null || toCol == null) {
            return null;
          }
          return <String, dynamic>{
            ServerConstants.fkFromColumn: fromCol,
            ServerConstants.fkToTable: toTable,
            ServerConstants.fkToColumn: toCol,
          };
        })
        .whereType<Map<String, dynamic>>()
        .toList();
  }

  /// Returns FK metadata for a table (for VM service RPC).
  /// Same shape as GET `/api/table/<name>/fk-meta` response body.
  Future<List<Map<String, dynamic>>> getTableFkMetaList({
    required DriftDebugQuery query,
    required String tableName,
  }) async {
    final List<Map<String, dynamic>> fkRows = ServerUtils.normalizeRows(
      await query('PRAGMA foreign_key_list("$tableName")'),
    );
    return fkMetaMapsFromPragmaRows(fkRows);
  }

  /// Returns FK metadata for GET `/api/table/<name>/fk-meta`.
  Future<void> sendTableFkMeta({
    required HttpResponse response,
    required DriftDebugQuery query,
    required String tableName,
  }) async {
    final res = response;
    if (!await _ctx.requireKnownTable(
      response: res,
      queryFn: query,
      tableName: tableName,
    ))
      return;
    try {
      final fks = await getTableFkMetaList(query: query, tableName: tableName);
      _ctx.setJsonHeaders(res);
      res.write(jsonEncode(fks));
      await res.close();
    } on Object catch (error, stack) {
      _ctx.logError(error, stack);
      await _ctx.sendErrorResponse(res, error);
    }
  }

  /// Returns JSON {"count": N} for GET `/api/table/<name>/count`.
  Future<void> sendTableCount({
    required HttpResponse response,
    required DriftDebugQuery query,
    required String tableName,
  }) async {
    final res = response;
    if (!await _ctx.requireKnownTable(
      response: res,
      queryFn: query,
      tableName: tableName,
    ))
      return;
    final dynamic rawCount = await query(
      'SELECT COUNT(*) AS c FROM "$tableName"',
    );
    final List<Map<String, dynamic>> rows = ServerUtils.normalizeRows(rawCount);
    final int count = ServerUtils.extractCountFromRows(rows);
    _ctx.setJsonHeaders(res);
    res.write(jsonEncode(<String, int>{ServerConstants.jsonKeyCount: count}));
    await res.close();
  }

  /// GET `/api/table/<name>?limit=&offset=` — returns JSON array of rows.
  Future<void> sendTableData({
    required HttpResponse response,
    required DriftDebugQuery query,
    required String tableName,
    required int limit,
    required int offset,
  }) async {
    final res = response;
    if (!await _ctx.requireKnownTable(
      response: res,
      queryFn: query,
      tableName: tableName,
    ))
      return;
    final dynamic raw = await query(
      'SELECT * FROM "$tableName" LIMIT $limit OFFSET $offset',
    );
    final List<Map<String, dynamic>> data = ServerUtils.normalizeRows(raw);
    _ctx.setJsonHeaders(res);
    res.write(const JsonEncoder.withIndent('  ').convert(data));
    await res.close();
  }
}
