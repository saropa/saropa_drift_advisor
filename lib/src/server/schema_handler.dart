// Schema handler extracted from _DriftDebugServerImpl.
// Handles schema dump, diagram, metadata, full dump, and database download.

import 'dart:convert';
import 'dart:io';

import 'server_constants.dart';
import 'server_context.dart';
import 'server_types.dart';
import 'server_utils.dart';
import 'soft_relationship_detector.dart';
import 'table_handler.dart';

/// Handles schema-related API endpoints.
final class SchemaHandler {
  /// Creates a [SchemaHandler] with the given [ServerContext].
  SchemaHandler(this._ctx);

  final ServerContext _ctx;

  /// Reads primary-key flag from a PRAGMA table_info row (handles pk or PK key).
  static bool _pragmaPkBool(Map<String, dynamic> r) {
    final v = r[ServerConstants.jsonKeyPk] ?? r['PK'];
    return v is int ? v != 0 : false;
  }

  /// Reads NOT NULL from PRAGMA table_info (`notnull` is 0 or 1).
  static bool _pragmaNotNullBool(Map<String, dynamic> r) {
    final v = r[ServerConstants.jsonKeyNotNull] ?? r['NOTNULL'];
    if (v is int) {
      return v != 0;
    }
    if (v is bool) {
      return v;
    }
    return false;
  }

  /// Converts PRAGMA table_info rows to normalized column maps (name, type, pk).
  /// Handles both lowercase and uppercase keys (NAME/TYPE/PK) from different drivers.
  static List<Map<String, dynamic>> _pragmaTableInfoToColumns(
    List<Map<String, dynamic>> infoRows,
  ) {
    return infoRows
        .map(
          (r) => <String, dynamic>{
            ServerConstants.jsonKeyName:
                r[ServerConstants.jsonKeyName]?.toString() ??
                r['NAME']?.toString() ??
                '',
            ServerConstants.jsonKeyType:
                r[ServerConstants.jsonKeyType]?.toString() ??
                r['TYPE']?.toString() ??
                '',
            ServerConstants.jsonKeyPk: _pragmaPkBool(r),
            ServerConstants.jsonKeyNotNull: _pragmaNotNullBool(r),
          },
        )
        .toList();
  }

  /// Sends schema-only SQL dump (CREATE statements, no data).
  Future<void> sendSchemaDump(
    HttpResponse response,
    DriftDebugQuery query,
  ) async {
    final res = response;
    final String schema = await ServerUtils.getSchemaSql(query);

    res.statusCode = HttpStatus.ok;
    _ctx.setAttachmentHeaders(res, ServerConstants.attachmentSchemaSql);
    res.write(schema);
    await res.close();
  }

  /// Returns diagram data: tables with columns and foreign keys.
  Future<Map<String, dynamic>> getDiagramData(DriftDebugQuery query) async {
    final List<String> tableNames = await ServerUtils.getTableNames(query);
    final List<Map<String, dynamic>> tables = [];
    final List<Map<String, dynamic>> foreignKeys = [];

    for (final tableName in tableNames) {
      final List<Map<String, dynamic>> infoRows = ServerUtils.normalizeRows(
        await query('PRAGMA table_info("$tableName")'),
      );
      final List<Map<String, dynamic>> columns = _pragmaTableInfoToColumns(
        infoRows,
      );

      tables.add(<String, dynamic>{
        ServerConstants.jsonKeyName: tableName,
        ServerConstants.jsonKeyColumns: columns,
      });

      try {
        final dynamic rawFk = await query(
          'PRAGMA foreign_key_list("$tableName")',
        );
        final List<Map<String, dynamic>> fkRows = ServerUtils.normalizeRows(
          rawFk,
        );

        for (final r in fkRows) {
          final toTable = r[ServerConstants.jsonKeyTable] as String?;
          final fromCol = r[ServerConstants.pragmaFrom] as String?;
          final toCol = r[ServerConstants.pragmaTo] as String?;

          if (toTable != null &&
              toTable.isNotEmpty &&
              fromCol != null &&
              toCol != null) {
            foreignKeys.add(<String, dynamic>{
              ServerConstants.fkFromTable: tableName,
              ServerConstants.fkFromColumn: fromCol,
              ServerConstants.fkToTable: toTable,
              ServerConstants.fkToColumn: toCol,
            });
          }
        }
      } on Object catch (error, stack) {
        _ctx.logError(error, stack);
      }
    }

    // Soft (inferred, undeclared) relationships for dashed rendering
    // (Feature 77 Phase 3): edges implied by column naming (`<noun>_id`, shared
    // `*UUID`) that no SQLite FK and no host manifest declares. Drawing them
    // dashed makes a convention-linked schema's relationships visible in the ER
    // diagram even before the developer declares them. Computed from the
    // columns + declared FKs ALREADY gathered above — no extra PRAGMA reads, so
    // the per-table FK round-trip stays single. A failure here must not break
    // the diagram (the declared-FK view is the primary payload), so it degrades
    // to an empty list.
    final softRelationships = <Map<String, dynamic>>[];
    try {
      // Reduce the gathered table maps to the inference input shape.
      final softTables = <SoftRelTable>[];
      for (final t in tables) {
        final rawCols = t[ServerConstants.jsonKeyColumns];
        final cols = <SoftRelColumn>[];
        if (rawCols is List) {
          for (final c in rawCols) {
            if (c is Map) {
              cols.add(
                SoftRelColumn(
                  c[ServerConstants.jsonKeyName] as String? ?? '',
                  isPk: c[ServerConstants.jsonKeyPk] == true,
                ),
              );
            }
          }
        }
        softTables.add(
          SoftRelTable(t[ServerConstants.jsonKeyName] as String? ?? '', cols),
        );
      }

      // Declared SQLite FK edges to subtract (already built above).
      final declaredKeys = <String>{
        for (final fk in foreignKeys)
          SoftRelationshipDetector.edgeKey(
            fk[ServerConstants.fkFromTable] as String? ?? '',
            fk[ServerConstants.fkFromColumn] as String? ?? '',
            fk[ServerConstants.fkToTable] as String? ?? '',
            fk[ServerConstants.fkToColumn] as String? ?? '',
          ),
      };

      // Host manifest edges to subtract — a manifested link is declared, so it
      // is solid-or-absent, never dashed.
      final manifest = _resolveManifest();
      final manifestKeys = <String>{
        if (manifest != null)
          for (final e in manifest)
            SoftRelationshipDetector.edgeKey(
              e.fromTable,
              e.fromColumn,
              e.toTable,
              e.toColumn,
            ),
      };

      for (final edge in SoftRelationshipDetector.inferEdges(softTables)) {
        if (declaredKeys.contains(edge.key) ||
            manifestKeys.contains(edge.key)) {
          continue;
        }
        softRelationships.add(<String, dynamic>{
          ServerConstants.fkFromTable: edge.fromTable,
          ServerConstants.fkFromColumn: edge.fromColumn,
          ServerConstants.fkToTable: edge.toTable,
          ServerConstants.fkToColumn: edge.toColumn,
          ServerConstants.jsonKeyRule: edge.rule,
        });
      }
    } on Object catch (error, stack) {
      _ctx.logError(error, stack);
    }

    return <String, dynamic>{
      ServerConstants.jsonKeyTables: tables,
      ServerConstants.jsonKeyForeignKeys: foreignKeys,
      ServerConstants.jsonKeySoftRelationships: softRelationships,
    };
  }

  /// Resolves the host relationship manifest (Feature 78) for soft-edge
  /// subtraction. Null when no callback was supplied (so every inferred edge is
  /// shown dashed); an empty list when a callback exists but threw (a faulty
  /// host callback must not break the diagram).
  DeclaredRelationships? _resolveManifest() {
    final callback = _ctx.declaredRelationships;
    if (callback == null) {
      return null;
    }
    try {
      return callback();
    } on Object catch (error, stack) {
      _ctx.logError(error, stack);
      return const <DeclaredRelationship>[];
    }
  }

  /// Sends JSON diagram data for GET /api/schema/diagram.
  Future<void> sendSchemaDiagram(
    HttpResponse response,
    DriftDebugQuery query,
  ) async {
    final res = response;

    try {
      final Map<String, dynamic> data = await getDiagramData(query);

      _ctx.setJsonHeaders(res);
      res.write(const JsonEncoder.withIndent('  ').convert(data));
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

  /// Returns schema metadata as a list of table maps (for VM service RPC).
  /// Same shape as GET /api/schema/metadata response body.
  ///
  /// Uses cached row counts from [ServerContext.cachedTableCounts]
  /// when available, eliminating N individual COUNT(*) queries.
  /// Falls back to per-table COUNT(*) when no cached counts
  /// exist (before the first checkDataChange cycle).
  ///
  /// When [includeForeignKeys] is true, runs `PRAGMA foreign_key_list` once
  /// per table in this loop so clients avoid N separate `/api/table/.../fk-meta`
  /// HTTP round-trips.
  Future<List<Map<String, dynamic>>> getSchemaMetadataList(
    DriftDebugQuery query, {
    bool includeForeignKeys = false,
  }) async {
    // Prefer cached table names to avoid a redundant
    // sqlite_master query.
    final tableNames =
        _ctx.cachedTableNames ?? await ServerUtils.getTableNames(query);

    // Use cached counts from the last checkDataChange
    // cycle to avoid N individual COUNT(*) queries.
    final cachedCounts = _ctx.cachedTableCounts;

    // When the host supplied a declared Drift schema, build a
    // table → column → driftType lookup once so PRAGMA columns (which only
    // carry the lossy SQLite storage type) can be enriched with the Drift
    // SEMANTIC type. This lets the NL converter detect dates/bools exactly.
    // A throwing host callback must not break metadata — it just skips enrichment.
    final Map<String, Map<String, String>> driftTypes =
        <String, Map<String, String>>{};
    final declaredCallback = _ctx.declaredSchema;
    if (declaredCallback != null) {
      try {
        for (final table in declaredCallback()) {
          final cols = <String, String>{};
          for (final col in table.columns) {
            final dt = col.driftType;
            if (dt != null) cols[col.name] = dt;
          }
          if (cols.isNotEmpty) driftTypes[table.name] = cols;
        }
      } on Object catch (error, stack) {
        _ctx.logError(error, stack);
      }
    }

    // When the host supplied a relationship manifest (Feature 78) AND the
    // caller wants foreign keys, group its edges by `fromTable` once so each
    // table's `foreignKeys` list can be seeded with the authoritative manifest
    // links before falling back to PRAGMA FKs. Edges are stored in the same
    // per-table fk-meta shape (fromColumn/toTable/toColumn, plus optional
    // label) the web flatten step expects, so the wizard picks them up with no
    // client change. A throwing callback must not break metadata — skip the fold.
    final Map<String, List<Map<String, dynamic>>> manifestByTable =
        <String, List<Map<String, dynamic>>>{};
    if (includeForeignKeys) {
      final relationshipsCallback = _ctx.declaredRelationships;
      if (relationshipsCallback != null) {
        try {
          for (final edge in relationshipsCallback()) {
            final bucket = manifestByTable.putIfAbsent(
              edge.fromTable,
              () => <Map<String, dynamic>>[],
            );
            bucket.add(<String, dynamic>{
              ServerConstants.fkFromColumn: edge.fromColumn,
              ServerConstants.fkToTable: edge.toTable,
              ServerConstants.fkToColumn: edge.toColumn,
              if (edge.label != null) ServerConstants.jsonKeyLabel: edge.label,
            });
          }
        } on Object catch (error, stack) {
          _ctx.logError(error, stack);
        }
      }
    }

    final tables = <Map<String, dynamic>>[];

    for (final tableName in tableNames) {
      final infoRows = ServerUtils.normalizeRows(
        await query('PRAGMA table_info("$tableName")'),
      );
      final columns = _pragmaTableInfoToColumns(infoRows);

      // Attach the Drift semantic type to each column when one is known.
      final tableDriftTypes = driftTypes[tableName];
      if (tableDriftTypes != null) {
        for (final col in columns) {
          final dt = tableDriftTypes[col[ServerConstants.jsonKeyName]];
          if (dt != null) col[ServerConstants.jsonKeyDriftType] = dt;
        }
      }

      // Use cached count if available; otherwise fall
      // back to a per-table COUNT(*) query.
      final int count;
      final cachedCount = cachedCounts?[tableName];
      if (cachedCount != null) {
        count = cachedCount;
      } else {
        final countRows = ServerUtils.normalizeRows(
          await query(
            'SELECT COUNT(*) AS '
            '${ServerConstants.jsonKeyCountColumn} '
            'FROM "$tableName"',
          ),
        );
        count = ServerUtils.extractCountFromRows(countRows);
      }

      final tableEntry = <String, dynamic>{
        ServerConstants.jsonKeyName: tableName,
        ServerConstants.jsonKeyColumns: columns,
        ServerConstants.jsonKeyRowCount: count,
      };

      if (includeForeignKeys) {
        // Seed with manifest edges (authoritative) so a host that links by
        // convention is treated as ground truth, then merge real SQLite FKs.
        final merged = <Map<String, dynamic>>[...?manifestByTable[tableName]];

        // Dedupe by edge identity (fromColumn → toTable.toColumn). Manifest
        // entries are added first, so a PRAGMA row for the same edge is dropped
        // and the manifest's version (including its optional label) wins — the
        // resolved precedence for duplicate edges (plan §10.2).
        final seen = <String>{
          for (final e in merged)
            '${e[ServerConstants.fkFromColumn]} '
                '${e[ServerConstants.fkToTable]} '
                '${e[ServerConstants.fkToColumn]}',
        };

        try {
          final dynamic rawFk = await query(
            'PRAGMA foreign_key_list("$tableName")',
          );
          final fkRows = ServerUtils.normalizeRows(rawFk);
          for (final fk in TableHandler.fkMetaMapsFromPragmaRows(fkRows)) {
            final key =
                '${fk[ServerConstants.fkFromColumn]} '
                '${fk[ServerConstants.fkToTable]} '
                '${fk[ServerConstants.fkToColumn]}';
            if (seen.add(key)) merged.add(fk);
          }
        } on Object catch (error, stack) {
          // A PRAGMA failure must not drop the manifest edges already seeded.
          _ctx.logError(error, stack);
        }

        tableEntry[ServerConstants.jsonKeyForeignKeys] = merged;
      }

      tables.add(tableEntry);
    }
    return tables;
  }

  /// Sends schema metadata for GET /api/schema/metadata.
  Future<void> sendSchemaMetadata(
    HttpRequest request,
    HttpResponse response,
    DriftDebugQuery query,
  ) async {
    final res = response;

    try {
      final params = request.uri.queryParameters;
      final rawInc = params[ServerConstants.queryParamIncludeForeignKeys]
          ?.toLowerCase();
      final includeForeignKeys =
          rawInc == '1' || rawInc == 'true' || rawInc == 'yes';
      final tables = await getSchemaMetadataList(
        query,
        includeForeignKeys: includeForeignKeys,
      );
      _ctx.setJsonHeaders(res);
      res.write(
        jsonEncode(<String, dynamic>{ServerConstants.jsonKeyTables: tables}),
      );
      await res.close();
    } on Object catch (error, stack) {
      _ctx.logError(error, stack);
      await _ctx.sendErrorResponse(res, error);
    }
  }

  /// Builds full dump SQL: schema + INSERT statements for every row.
  Future<String> getFullDumpSql(DriftDebugQuery query) async {
    final buffer = StringBuffer();
    final schema = await ServerUtils.getSchemaSql(query);

    buffer.writeln(schema);
    buffer.writeln('-- Data dump');
    final tables = await ServerUtils.getTableNames(query);

    for (final table in tables) {
      final dynamic raw = await query('SELECT * FROM "$table"');
      final List<Map<String, dynamic>> rows = ServerUtils.normalizeRows(raw);

      if (rows.isNotEmpty) {
        final firstRow = rows.firstOrNull;

        if (firstRow != null) {
          final keys = firstRow.keys.toList();

          if (keys.isNotEmpty) {
            final colList = keys.map((k) => '"$k"').join(', ');

            for (final row in rows) {
              final values = keys
                  .map((k) => ServerUtils.sqlLiteral(row[k]))
                  .join(', ');

              buffer.writeln(
                'INSERT INTO "$table" '
                '($colList) VALUES ($values);',
              );
            }
          }
        }
      }
    }

    return buffer.toString();
  }

  /// Sends full dump (schema + data) as downloadable SQL file.
  Future<void> sendFullDump(
    HttpResponse response,
    DriftDebugQuery query,
  ) async {
    final res = response;
    final String dump = await getFullDumpSql(query);

    res.statusCode = HttpStatus.ok;
    _ctx.setAttachmentHeaders(res, ServerConstants.attachmentDumpSql);
    res.write(dump);
    await res.close();
  }

  /// Sends the raw SQLite database file when getDatabaseBytes is
  /// configured.
  Future<void> sendDatabaseFile(HttpResponse response) async {
    final res = response;
    final getBytes = _ctx.getDatabaseBytes;

    if (getBytes == null) {
      res.statusCode = HttpStatus.notImplemented;
      _ctx.setJsonHeaders(res);
      res.write(
        jsonEncode(<String, String>{
          ServerConstants.jsonKeyError:
              ServerConstants.errorDatabaseDownloadNotConfigured,
        }),
      );
      await res.close();

      return;
    }
    try {
      final bytes = await getBytes();

      res.statusCode = HttpStatus.ok;
      res.headers.contentType = ContentType(
        ServerConstants.contentTypeApplicationOctetStream,
        ServerConstants.contentTypeOctetStream,
      );
      res.headers.set(
        ServerConstants.headerContentDisposition,
        ServerConstants.attachmentDatabaseSqlite,
      );
      _ctx.setCors(res);
      res.add(bytes);
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

  /// Handles GET /api/schema/declared: returns the host-declared (code-side)
  /// Drift schema when a [ServerContext.declaredSchema] callback was supplied,
  /// or `{ "available": false, "tables": [] }` when it was not — so the web tab
  /// can stay empty without error (same opt-in posture as the orphan check).
  Future<void> sendDeclaredSchema(HttpResponse response) async {
    final res = response;
    try {
      final callback = _ctx.declaredSchema;
      if (callback == null) {
        _ctx.setJsonHeaders(res);
        res.write(
          jsonEncode(<String, dynamic>{
            ServerConstants.jsonKeyAvailable: false,
            ServerConstants.jsonKeyTables: <Map<String, dynamic>>[],
          }),
        );
        return;
      }

      final schema = callback();
      final tables = <Map<String, dynamic>>[
        for (final table in schema)
          <String, dynamic>{
            ServerConstants.jsonKeyName: table.name,
            ServerConstants.jsonKeyColumns: <Map<String, dynamic>>[
              for (final col in table.columns)
                <String, dynamic>{
                  ServerConstants.jsonKeyName: col.name,
                  ServerConstants.jsonKeySqlType: col.sqlType,
                  if (col.driftType != null)
                    ServerConstants.jsonKeyDriftType: col.driftType,
                  ServerConstants.jsonKeyNullable: col.nullable,
                  ServerConstants.jsonKeyIsPk: col.isPk,
                },
            ],
            ServerConstants.jsonKeyIndexes: table.indexes,
          },
      ];

      _ctx.setJsonHeaders(res);
      res.write(
        jsonEncode(<String, dynamic>{
          ServerConstants.jsonKeyAvailable: true,
          ServerConstants.jsonKeyTables: tables,
        }),
      );
    } on Object catch (error, stack) {
      // A throwing host callback must not crash the endpoint — report it as a
      // server error with the message, like the other schema endpoints.
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

  /// Handles GET /api/schema/relationships (Feature 78): returns the
  /// host-declared relationship manifest when a
  /// [ServerContext.declaredRelationships] callback was supplied, or
  /// `{ "available": false, "relationships": [] }` when it was not — so a host
  /// that links by SQLite FKs (or neither) gets an empty, non-error response
  /// (same opt-in posture as [sendDeclaredSchema]). The manifest is descriptive
  /// only; this endpoint reads the in-memory callback and issues no DB queries.
  Future<void> sendDeclaredRelationships(HttpResponse response) async {
    final res = response;
    try {
      final callback = _ctx.declaredRelationships;
      if (callback == null) {
        _ctx.setJsonHeaders(res);
        res.write(
          jsonEncode(<String, dynamic>{
            ServerConstants.jsonKeyAvailable: false,
            ServerConstants.jsonKeyRelationships: <Map<String, dynamic>>[],
          }),
        );
        return;
      }

      final relationships = <Map<String, dynamic>>[
        for (final edge in callback())
          <String, dynamic>{
            ServerConstants.fkFromTable: edge.fromTable,
            ServerConstants.fkFromColumn: edge.fromColumn,
            ServerConstants.fkToTable: edge.toTable,
            ServerConstants.fkToColumn: edge.toColumn,
            // Omit label when null so the JSON stays minimal (no field for
            // documentation only — it's only carried when the host set it).
            if (edge.label != null) ServerConstants.jsonKeyLabel: edge.label,
            // Carry orphanCheckable only when the host turned it off (true is
            // the default; absence means true). Lets a reader of this endpoint
            // tell joinable edges from list_ref / seed_identity edges the
            // orphan-row check must skip — no host information is lost.
            if (!edge.orphanCheckable)
              ServerConstants.jsonKeyOrphanCheckable: false,
          },
      ];

      _ctx.setJsonHeaders(res);
      res.write(
        jsonEncode(<String, dynamic>{
          ServerConstants.jsonKeyAvailable: true,
          ServerConstants.jsonKeyRelationships: relationships,
        }),
      );
    } on Object catch (error, stack) {
      // A throwing host callback must not crash the endpoint — report it as a
      // server error with the message, like the other schema endpoints.
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
}
