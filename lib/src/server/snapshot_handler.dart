// Snapshot handler extracted from _DriftDebugServerImpl.
// Handles snapshot create/get/compare/delete.

import 'dart:convert';
import 'dart:io';

import 'server_constants.dart';
import 'server_context.dart';
import 'server_utils.dart';
import 'server_types.dart';

/// Handles snapshot-related API endpoints.
///
/// The server retains several snapshots (see [ServerContext.snapshots]); the
/// single-snapshot endpoints stay back-compatible by operating on the most
/// recent one (GET /api/snapshot, default compare), while /api/snapshots and
/// the per-id DELETE/PUT routes expose the multi-snapshot surface.
final class SnapshotHandler {
  /// Creates a [SnapshotHandler] with the given [ServerContext].
  SnapshotHandler(this._ctx);

  final ServerContext _ctx;

  /// Handles POST /api/snapshot: captures full table data and **appends** it to
  /// the snapshot list. Accepts an optional `{ "label": "..." }` body; an empty
  /// body is valid (unlabeled snapshot) for back-compat with older clients.
  Future<void> handleSnapshotCreate(
    HttpRequest request,
    HttpResponse response,
    DriftDebugQuery query,
  ) async {
    final res = response;
    try {
      final label = await _readOptionalLabel(request);

      final tables = await ServerUtils.getTableNames(query);
      final Map<String, List<Map<String, dynamic>>> data = {};
      for (final table in tables) {
        final List<Map<String, dynamic>> rows = await query(
          'SELECT * FROM "$table"',
        );
        data[table] = rows.map((r) => Map<String, dynamic>.from(r)).toList();
      }

      final id = DateTime.now().toUtc().toIso8601String();
      final createdAt = DateTime.now().toUtc();
      final created = Snapshot(
        id: id,
        createdAt: createdAt,
        tables: data,
        label: label,
      );
      _ctx.addSnapshot(created);
      _ctx.setJsonHeaders(res);
      res.write(
        jsonEncode(<String, dynamic>{
          ServerConstants.jsonKeyId: created.id,
          ServerConstants.jsonKeyCreatedAt: created.createdAt
              .toUtc()
              .toIso8601String(),
          if (created.label != null)
            ServerConstants.jsonKeyLabel: created.label,
          ServerConstants.jsonKeyTableCount: created.tables.length,
          ServerConstants.jsonKeyTables: created.tables.keys.toList(),
        }),
      );
    } on Object catch (error, stack) {
      _ctx.logError(error, stack);
      res.statusCode = HttpStatus.internalServerError;
      res.headers.contentType = ContentType.json;
      _ctx.setCors(res);
      res.write(
        jsonEncode(<String, String>{
          ServerConstants.jsonKeyError: error.toString(),
        }),
      );
    } finally {
      await res.close();
    }
  }

  /// Handles GET /api/snapshots: lists all stored snapshots (oldest first) with
  /// id, createdAt, label, and table count — the picker source for the web UI.
  Future<void> handleSnapshotList(HttpResponse response) async {
    final res = response;
    final list = _ctx.snapshots
        .map(
          (s) => <String, dynamic>{
            ServerConstants.jsonKeyId: s.id,
            ServerConstants.jsonKeyCreatedAt: s.createdAt
                .toUtc()
                .toIso8601String(),
            ServerConstants.jsonKeyLabel: s.label,
            ServerConstants.jsonKeyTableCount: s.tables.length,
          },
        )
        .toList();
    _ctx.setJsonHeaders(res);
    res.write(
      jsonEncode(<String, dynamic>{ServerConstants.jsonKeySnapshots: list}),
    );
    await res.close();
  }

  /// Reads an optional `{ "label": "..." }` from [request]; null on empty body,
  /// non-JSON, or a missing/blank label (a label is never required).
  Future<String?> _readOptionalLabel(HttpRequest request) async {
    final body = await utf8.decoder.bind(request).join();
    if (body.trim().isEmpty) return null;
    final decoded = ServerUtils.parseJsonMap(body);
    final raw = decoded?[ServerConstants.jsonKeyLabel];
    if (raw is String && raw.trim().isNotEmpty) return raw.trim();
    return null;
  }

  /// Handles GET /api/snapshot: returns the most recent snapshot or null.
  Future<void> handleSnapshotGet(HttpResponse response) async {
    final res = response;
    final snap = _ctx.latestSnapshot;
    if (snap == null) {
      res.statusCode = HttpStatus.ok;
      _ctx.setJsonHeaders(res);
      res.write(
        jsonEncode(<String, dynamic>{ServerConstants.jsonKeySnapshot: null}),
      );
      await res.close();

      return;
    }
    final tableCounts = <String, int>{};
    for (final e in snap.tables.entries) {
      tableCounts[e.key] = e.value.length;
    }

    _ctx.setJsonHeaders(res);
    res.write(
      jsonEncode(<String, dynamic>{
        ServerConstants.jsonKeySnapshot: <String, dynamic>{
          ServerConstants.jsonKeyId: snap.id,
          ServerConstants.jsonKeyCreatedAt: snap.createdAt
              .toUtc()
              .toIso8601String(),
          ServerConstants.jsonKeyTables: snap.tables.keys.toList(),
          ServerConstants.jsonKeyCounts: tableCounts,
        },
      }),
    );
    await res.close();
  }

  /// Handles GET /api/snapshot/compare: diffs one snapshot against another, or
  /// against the live database.
  ///
  /// Query params (all optional, back-compatible):
  /// - `from={id}` — base snapshot; defaults to the most recent snapshot.
  /// - `to={id}` — target snapshot; when omitted the comparison runs against
  ///   the live database ("now"), matching the original single-snapshot
  ///   behavior.
  ///
  /// Responds 400 when no `from` can be resolved (no snapshots, or a bad id).
  Future<void> handleSnapshotCompare({
    required HttpResponse response,
    required HttpRequest request,
    required DriftDebugQuery query,
  }) async {
    final res = response;
    final req = request;

    final fromId = req.uri.queryParameters[ServerConstants.queryParamFrom];
    final toId = req.uri.queryParameters[ServerConstants.queryParamTo];

    final fromSnap = (fromId != null && fromId.isNotEmpty)
        ? _ctx.snapshotById(fromId)
        : _ctx.latestSnapshot;
    if (fromSnap == null) {
      res.statusCode = HttpStatus.badRequest;
      _ctx.setJsonHeaders(res);
      res.write(
        jsonEncode(<String, String>{
          ServerConstants.jsonKeyError: ServerConstants.errorNoSnapshot,
        }),
      );
      await res.close();

      return;
    }

    // A `to` id is only valid if it resolves to a stored snapshot. When absent,
    // compare against the live database; when present-but-unknown, 400 rather
    // than silently falling back to "now" (which would mislead the user).
    Snapshot? toSnap;
    if (toId != null && toId.isNotEmpty) {
      toSnap = _ctx.snapshotById(toId);
      if (toSnap == null) {
        res.statusCode = HttpStatus.badRequest;
        _ctx.setJsonHeaders(res);
        res.write(
          jsonEncode(<String, String>{
            ServerConstants.jsonKeyError: ServerConstants.errorNoSnapshot,
          }),
        );
        await res.close();

        return;
      }
    }

    try {
      // "now" target reads the live DB; a snapshot target reads stored rows.
      final tablesNow = toSnap == null
          ? await ServerUtils.getTableNames(query)
          : toSnap.tables.keys.toList();
      final allTables = <String>{...fromSnap.tables.keys, ...tablesNow};
      final detailed =
          req.uri.queryParameters[ServerConstants.queryParamDetail] ==
          ServerConstants.detailRows;
      final List<Map<String, dynamic>> tableDiffs = [];
      for (final table in allTables.toList()..sort()) {
        final rowsThen = fromSnap.tables[table] ?? [];
        final rowsNowList = toSnap == null
            ? (tablesNow.contains(table)
                  ? ServerUtils.normalizeRows(
                      await query('SELECT * FROM "$table"'),
                    )
                  : <Map<String, dynamic>>[])
            : (toSnap.tables[table] ?? <Map<String, dynamic>>[]);
        final setThen = rowsThen.map(ServerUtils.rowSignature).toSet();
        final setNow = rowsNowList.map(ServerUtils.rowSignature).toSet();
        final added = setNow.difference(setThen).length;
        final removed = setThen.difference(setNow).length;
        final inBoth = setThen.intersection(setNow).length;
        final tableDiff = <String, dynamic>{
          ServerConstants.jsonKeyTable: table,
          ServerConstants.jsonKeyCountThen: rowsThen.length,
          ServerConstants.jsonKeyCountNow: rowsNowList.length,
          ServerConstants.jsonKeyAdded: added,
          ServerConstants.jsonKeyRemoved: removed,
          ServerConstants.jsonKeyUnchanged: inBoth,
        };
        if (detailed) {
          await _addRowLevelDiff(
            tableDiff: tableDiff,
            table: table,
            rowsThen: rowsThen,
            rowsNow: rowsNowList,
            query: query,
          );
        }
        tableDiffs.add(tableDiff);
      }

      final body = <String, dynamic>{
        ServerConstants.jsonKeySnapshotId: fromSnap.id,
        ServerConstants.jsonKeySnapshotCreatedAt: fromSnap.createdAt
            .toUtc()
            .toIso8601String(),
        // `to` is the stored target snapshot id, or null when comparing to live.
        ServerConstants.jsonKeyTo: toSnap?.id,
        ServerConstants.jsonKeyComparedAt: DateTime.now()
            .toUtc()
            .toIso8601String(),
        ServerConstants.jsonKeyTables: tableDiffs,
      };

      if (req.uri.queryParameters[ServerConstants.queryParamFormat] ==
          ServerConstants.formatDownload) {
        res.statusCode = HttpStatus.ok;
        res.headers.contentType = ContentType.json;
        res.headers.set(
          ServerConstants.headerContentDisposition,
          ServerConstants.attachmentSnapshotDiff,
        );
        _ctx.setCors(res);
        res.write(const JsonEncoder.withIndent('  ').convert(body));
      } else {
        _ctx.setJsonHeaders(res);
        res.write(const JsonEncoder.withIndent('  ').convert(body));
      }
    } on Object catch (error, stack) {
      _ctx.logError(error, stack);
      res.statusCode = HttpStatus.internalServerError;
      res.headers.contentType = ContentType.json;
      _ctx.setCors(res);
      res.write(
        jsonEncode(<String, String>{
          ServerConstants.jsonKeyError: error.toString(),
        }),
      );
    } finally {
      await res.close();
    }
  }

  /// Adds row-level diff fields to [tableDiff] by comparing
  /// [rowsThen] (snapshot) with [rowsNow] (current) using primary keys.
  Future<void> _addRowLevelDiff({
    required Map<String, dynamic> tableDiff,
    required String table,
    required List<Map<String, dynamic>> rowsThen,
    required List<Map<String, dynamic>> rowsNow,
    required DriftDebugQuery query,
  }) async {
    final pkInfoRows = ServerUtils.normalizeRows(
      await query('PRAGMA table_info("$table")'),
    );

    final pkColumns = <String>[];

    for (final r in pkInfoRows) {
      final pk = r[ServerConstants.jsonKeyPk];

      if (pk is int && pk > 0) {
        final name = r[ServerConstants.jsonKeyName];

        if (name is String) {
          pkColumns.add(name);
        }
      }
    }

    if (pkColumns.isEmpty) {
      tableDiff[ServerConstants.jsonKeyHasPk] = false;
      tableDiff[ServerConstants.jsonKeyAddedRows] = <Map<String, dynamic>>[];
      tableDiff[ServerConstants.jsonKeyRemovedRows] = <Map<String, dynamic>>[];
      tableDiff[ServerConstants.jsonKeyChangedRows] = <Map<String, dynamic>>[];

      return;
    }

    final thenByPk = <String, Map<String, dynamic>>{};

    for (final r in rowsThen) {
      thenByPk[ServerUtils.compositePkKey(pkColumns, r)] = r;
    }

    final nowByPk = <String, Map<String, dynamic>>{};

    for (final r in rowsNow) {
      nowByPk[ServerUtils.compositePkKey(pkColumns, r)] = r;
    }

    final addedRows = rowsNow.where((r) {
      final key = ServerUtils.compositePkKey(pkColumns, r);

      return !thenByPk.containsKey(key);
    }).toList();

    final removedRows = rowsThen.where((r) {
      final key = ServerUtils.compositePkKey(pkColumns, r);

      return !nowByPk.containsKey(key);
    }).toList();

    final changedRows = <Map<String, dynamic>>[];

    for (final entry in thenByPk.entries) {
      final nowRow = nowByPk[entry.key];

      if (nowRow != null) {
        final thenRow = entry.value;
        final changedCols = <String>[];

        for (final col in thenRow.keys) {
          final thenVal = thenRow[col]?.toString() ?? '';
          final nowVal = nowRow[col]?.toString() ?? '';

          if (thenVal != nowVal) {
            changedCols.add(col);
          }
        }

        if (changedCols.isNotEmpty) {
          changedRows.add(<String, dynamic>{
            ServerConstants.jsonKeyPk: entry.key,
            ServerConstants.jsonKeyThen: thenRow,
            ServerConstants.jsonKeyNow: nowRow,
            ServerConstants.jsonKeyChangedColumns: changedCols,
          });
        }
      }
    }

    tableDiff[ServerConstants.jsonKeyHasPk] = true;
    tableDiff[ServerConstants.jsonKeyAddedRows] = addedRows;
    tableDiff[ServerConstants.jsonKeyRemovedRows] = removedRows;
    tableDiff[ServerConstants.jsonKeyChangedRows] = changedRows;
  }

  /// Handles DELETE /api/snapshot: clears ALL stored snapshots (back-compat —
  /// the bare path still means "clear everything").
  Future<void> handleSnapshotDelete(HttpResponse response) async {
    final res = response;
    _ctx.clearSnapshots();
    _ctx.setJsonHeaders(res);
    res.write(
      jsonEncode(<String, String>{
        ServerConstants.jsonKeyOk: ServerConstants.messageSnapshotCleared,
      }),
    );
    await res.close();
  }

  /// Handles DELETE /api/snapshot/{id}: removes a single snapshot. Responds 404
  /// when no snapshot with [id] exists, so the UI can report a stale selection.
  Future<void> handleSnapshotDeleteOne(HttpResponse response, String id) async {
    final res = response;
    final removed = _ctx.removeSnapshot(id);
    if (!removed) {
      res.statusCode = HttpStatus.notFound;
      _ctx.setJsonHeaders(res);
      res.write(
        jsonEncode(<String, String>{
          ServerConstants.jsonKeyError: ServerConstants.errorNoSnapshot,
        }),
      );
      await res.close();
      return;
    }
    _ctx.setJsonHeaders(res);
    res.write(
      jsonEncode(<String, dynamic>{
        ServerConstants.jsonKeyOk: true,
        ServerConstants.jsonKeyId: id,
      }),
    );
    await res.close();
  }

  /// Handles PUT /api/snapshot/{id}: renames a snapshot's label from a
  /// `{ "label": "..." }` body (empty/blank clears it). 404 on unknown id.
  Future<void> handleSnapshotRename(
    HttpRequest request,
    HttpResponse response,
    String id,
  ) async {
    final res = response;
    final existing = _ctx.snapshotById(id);
    if (existing == null) {
      res.statusCode = HttpStatus.notFound;
      _ctx.setJsonHeaders(res);
      res.write(
        jsonEncode(<String, String>{
          ServerConstants.jsonKeyError: ServerConstants.errorNoSnapshot,
        }),
      );
      await res.close();
      return;
    }
    final label = await _readOptionalLabel(request);
    _ctx.replaceSnapshot(id, existing.withLabel(label));
    _ctx.setJsonHeaders(res);
    res.write(
      jsonEncode(<String, dynamic>{
        ServerConstants.jsonKeyOk: true,
        ServerConstants.jsonKeyId: id,
        ServerConstants.jsonKeyLabel: label,
      }),
    );
    await res.close();
  }
}
