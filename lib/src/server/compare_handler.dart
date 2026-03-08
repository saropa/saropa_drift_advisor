// Compare handler extracted from _DriftDebugServerImpl.
// Handles DB diff report and migration preview.

import 'dart:convert';
import 'dart:io';

import 'server_constants.dart';
import 'server_context.dart';

/// Handles compare and migration-related API endpoints.
final class CompareHandler {
  /// Creates a [CompareHandler] with the given [ServerContext].
  CompareHandler(this._ctx);

  final ServerContext _ctx;

  /// Handles GET /api/compare/report: schema and per-table row count
  /// diff between main query and queryCompare.
  Future<void> handleCompareReport(
    HttpResponse response,
    HttpRequest request,
    DriftDebugQuery query,
  ) async {
    final res = response;
    final req = request;
    final queryB = _ctx.queryCompare;

    if (queryB == null) {
      res.statusCode = HttpStatus.notImplemented;
      _ctx.setJsonHeaders(res);
      res.write(jsonEncode(<String, String>{
        ServerConstants.jsonKeyError:
            ServerConstants.errorCompareNotConfigured,
      }));
      await res.close();
      return;
    }

    final path = req.uri.path;

    if (path != ServerConstants.pathApiCompareReport &&
        path != ServerConstants.pathApiCompareReportAlt) {
      res.statusCode = HttpStatus.notFound;
      await res.close();
      return;
    }

    try {
      final schemaA = await ServerContext.getSchemaSql(query);
      final schemaB = await ServerContext.getSchemaSql(queryB);
      final tablesA = await ServerContext.getTableNames(query);
      final tablesB = await ServerContext.getTableNames(queryB);
      final allTables = <String>{...tablesA, ...tablesB}.toList()..sort();
      final schemaSame = schemaA == schemaB;
      final List<Map<String, dynamic>> countDiffs = [];

      for (final table in allTables) {
        final futures = <Future<List<Map<String, dynamic>>>>[];
        if (tablesA.contains(table)) {
          futures.add(query('SELECT COUNT(*) AS c FROM "$table"'));
        }
        if (tablesB.contains(table)) {
          futures.add(queryB('SELECT COUNT(*) AS c FROM "$table"'));
        }

        final results = futures.isEmpty
            ? <List<Map<String, dynamic>>>[]
            : await Future.wait(futures);
        int countA = 0;
        int countB = 0;
        int idx = 0;

        if (tablesA.contains(table)) {
          countA =
              ServerContext.extractCountFromRows(results[idx++]);
        }
        if (tablesB.contains(table)) {
          countB =
              ServerContext.extractCountFromRows(results[idx++]);
        }

        countDiffs.add(<String, dynamic>{
          ServerConstants.jsonKeyTable: table,
          ServerConstants.jsonKeyCountA: countA,
          ServerConstants.jsonKeyCountB: countB,
          ServerConstants.jsonKeyDiff: countA - countB,
          ServerConstants.jsonKeyOnlyInA:
              !tablesB.contains(table),
          ServerConstants.jsonKeyOnlyInB:
              !tablesA.contains(table),
        });
      }

      final report = <String, dynamic>{
        ServerConstants.jsonKeySchemaSame: schemaSame,
        ServerConstants.jsonKeySchemaDiff: schemaSame
            ? null
            : <String, String>{
                ServerConstants.jsonKeyA: schemaA,
                ServerConstants.jsonKeyB: schemaB,
              },
        ServerConstants.jsonKeyTablesOnlyInA:
            tablesA.where((t) => !tablesB.contains(t)).toList(),
        ServerConstants.jsonKeyTablesOnlyInB:
            tablesB.where((t) => !tablesA.contains(t)).toList(),
        ServerConstants.jsonKeyTableCounts: countDiffs,
        ServerConstants.jsonKeyGeneratedAt:
            DateTime.now().toUtc().toIso8601String(),
      };

      final format =
          req.uri.queryParameters[ServerConstants.queryParamFormat];

      if (format == ServerConstants.formatDownload) {
        res.statusCode = HttpStatus.ok;
        res.headers.contentType = ContentType.json;
        res.headers.set(ServerConstants.headerContentDisposition,
            ServerConstants.attachmentDiffReport);
        _ctx.setCors(res);
        res.write(
            const JsonEncoder.withIndent('  ').convert(report));
      } else {
        _ctx.setJsonHeaders(res);
        res.write(
            const JsonEncoder.withIndent('  ').convert(report));
      }
    } on Object catch (error, stack) {
      _ctx.logError(error, stack);
      res.statusCode = HttpStatus.internalServerError;
      res.headers.contentType = ContentType.json;
      _ctx.setCors(res);
      res.write(jsonEncode(<String, String>{
        ServerConstants.jsonKeyError: error.toString(),
      }));
    } finally {
      await res.close();
    }
  }

  /// Handles GET /api/migration/preview: compares main DB schema
  /// against queryCompare and generates DDL statements.
  Future<void> handleMigrationPreview(
    HttpResponse response,
    DriftDebugQuery query,
  ) async {
    final res = response;
    final queryB = _ctx.queryCompare;

    if (queryB == null) {
      res.statusCode = HttpStatus.notImplemented;
      _ctx.setJsonHeaders(res);
      res.write(jsonEncode(<String, String>{
        ServerConstants.jsonKeyError:
            ServerConstants.errorMigrationRequiresCompare,
      }));
      await res.close();
      return;
    }

    try {
      final tablesA = await ServerContext.getTableNames(query);
      final tablesB = await ServerContext.getTableNames(queryB);
      final migrations = <String>[];

      await _migrationNewTables(migrations, tablesA, tablesB, queryB);
      _migrationDroppedTables(migrations, tablesA, tablesB);
      await _migrationModifiedTables(
        migrations, tablesA, tablesB, query, queryB,
      );

      final migrationSql = migrations.join('\n');

      _ctx.setJsonHeaders(res);
      res.write(jsonEncode(<String, dynamic>{
        'migrationSql': migrationSql,
        'changeCount': migrations
            .where((l) => !l.startsWith('--') && l.trim().isNotEmpty)
            .length,
        'hasWarnings': migrations.any((l) => l.contains('WARNING')),
        ServerConstants.jsonKeyGeneratedAt:
            DateTime.now().toUtc().toIso8601String(),
      }));
      await res.close();
    } on Object catch (error, stack) {
      _ctx.logError(error, stack);
      await _ctx.sendErrorResponse(res, error);
    }
  }

  Future<void> _migrationNewTables(
    List<String> migrations,
    List<String> tablesA,
    List<String> tablesB,
    DriftDebugQuery queryB,
  ) async {
    for (final table in tablesB) {
      if (tablesA.contains(table)) continue;

      final schemaRows = ServerContext.normalizeRows(
        await queryB(
          "SELECT sql FROM sqlite_master "
          "WHERE type='table' AND name='$table'",
        ),
      );
      final createStmt = schemaRows.isNotEmpty
          ? schemaRows.first['sql'] as String?
          : null;

      if (createStmt != null) {
        migrations.add('-- NEW TABLE: $table');
        migrations.add('$createStmt;');
        migrations.add('');
      }
    }
  }

  static void _migrationDroppedTables(
    List<String> migrations,
    List<String> tablesA,
    List<String> tablesB,
  ) {
    for (final table in tablesA) {
      if (tablesB.contains(table)) continue;
      migrations.add('-- DROPPED TABLE: $table');
      migrations.add('DROP TABLE IF EXISTS "$table";');
      migrations.add('');
    }
  }

  Future<void> _migrationModifiedTables(
    List<String> migrations,
    List<String> tablesA,
    List<String> tablesB,
    DriftDebugQuery queryA,
    DriftDebugQuery queryB,
  ) async {
    for (final table in tablesA) {
      if (!tablesB.contains(table)) continue;

      final colMapA = await _migrationColumnMap(queryA, table);
      final colMapB = await _migrationColumnMap(queryB, table);
      final tableChanges = <String>[];

      _migrationAddedColumns(tableChanges, table, colMapA, colMapB);
      _migrationRemovedColumns(tableChanges, table, colMapA, colMapB);
      _migrationChangedColumns(tableChanges, table, colMapA, colMapB);
      await _migrationIndexChanges(
        tableChanges, table, queryA, queryB,
      );

      if (tableChanges.isNotEmpty) {
        migrations.add('-- MODIFIED TABLE: $table');
        migrations.addAll(tableChanges);
        migrations.add('');
      }
    }
  }

  Future<Map<String, Map<String, dynamic>>> _migrationColumnMap(
    DriftDebugQuery query,
    String table,
  ) async {
    final cols = ServerContext.normalizeRows(
      await query('PRAGMA table_info("$table")'),
    );
    final map = <String, Map<String, dynamic>>{};

    for (final c in cols) {
      map[c['name'] as String? ?? ''] = c;
    }

    return map;
  }

  static void _migrationAddedColumns(
    List<String> changes,
    String table,
    Map<String, Map<String, dynamic>> colMapA,
    Map<String, Map<String, dynamic>> colMapB,
  ) {
    for (final colName in colMapB.keys) {
      if (colMapA.containsKey(colName)) continue;

      final col = colMapB[colName]!;
      final type = col['type'] ?? 'TEXT';
      final notNull = col['notnull'] == 1;
      final dfltValue = col['dflt_value'];
      final dflt = dfltValue != null
          ? ' DEFAULT $dfltValue'
          : (notNull ? " DEFAULT ''" : '');
      final nn = notNull ? ' NOT NULL' : '';

      changes.add(
        'ALTER TABLE "$table" ADD COLUMN "$colName" $type$nn$dflt;',
      );
    }
  }

  static void _migrationRemovedColumns(
    List<String> changes,
    String table,
    Map<String, Map<String, dynamic>> colMapA,
    Map<String, Map<String, dynamic>> colMapB,
  ) {
    for (final colName in colMapA.keys) {
      if (colMapB.containsKey(colName)) continue;
      changes.add(
        '-- WARNING: Column "$colName" removed from "$table".',
      );
      changes.add(
        '-- SQLite < 3.35.0: Use table recreation '
        '(CREATE new, INSERT...SELECT, DROP old, ALTER...RENAME).',
      );
      changes.add('-- SQLite >= 3.35.0:');
      changes.add(
        'ALTER TABLE "$table" DROP COLUMN "$colName";',
      );
    }
  }

  static void _migrationChangedColumns(
    List<String> changes,
    String table,
    Map<String, Map<String, dynamic>> colMapA,
    Map<String, Map<String, dynamic>> colMapB,
  ) {
    for (final colName in colMapA.keys) {
      if (!colMapB.containsKey(colName)) continue;

      final a = colMapA[colName]!;
      final b = colMapB[colName]!;
      final typeA = a['type']?.toString() ?? '';
      final typeB = b['type']?.toString() ?? '';
      final nnA = a['notnull'] == 1;
      final nnB = b['notnull'] == 1;

      if (typeA != typeB || nnA != nnB) {
        changes.add(
          '-- WARNING: Column "$colName" in "$table" changed:',
        );
        if (typeA != typeB) {
          changes.add('--   Type: $typeA -> $typeB');
        }
        if (nnA != nnB) {
          changes.add(
            "--   Nullable: ${nnA ? 'NOT NULL' : 'nullable'} "
            "-> ${nnB ? 'NOT NULL' : 'nullable'}",
          );
        }
        changes.add(
          '-- SQLite does not support ALTER COLUMN. '
          'Use table recreation pattern.',
        );
      }
    }
  }

  Future<void> _migrationIndexChanges(
    List<String> changes,
    String table,
    DriftDebugQuery queryA,
    DriftDebugQuery queryB,
  ) async {
    final idxA = ServerContext.normalizeRows(
      await queryA('PRAGMA index_list("$table")'),
    );
    final idxB = ServerContext.normalizeRows(
      await queryB('PRAGMA index_list("$table")'),
    );
    final idxNamesA = idxA
        .map((r) => r['name']?.toString() ?? '')
        .where((n) => n.isNotEmpty && !n.startsWith('sqlite_'))
        .toSet();
    final idxNamesB = idxB
        .map((r) => r['name']?.toString() ?? '')
        .where((n) => n.isNotEmpty && !n.startsWith('sqlite_'))
        .toSet();

    for (final idxName in idxNamesB) {
      if (idxNamesA.contains(idxName)) continue;

      final idxSqlRows = ServerContext.normalizeRows(
        await queryB(
          "SELECT sql FROM sqlite_master "
          "WHERE type='index' AND name='$idxName'",
        ),
      );
      final idxSql = idxSqlRows.isNotEmpty
          ? idxSqlRows.first['sql'] as String?
          : null;

      if (idxSql != null) {
        changes.add('$idxSql;');
      }
    }

    for (final idxName in idxNamesA) {
      if (idxNamesB.contains(idxName)) continue;
      changes.add('DROP INDEX IF EXISTS "$idxName";');
    }
  }
}
