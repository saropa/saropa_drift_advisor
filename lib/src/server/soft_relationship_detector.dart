// Soft-relationship advisory (Feature 77).
//
// Surfaces, as a report-only `info` finding, the case where two tables are
// related by COLUMN-NAMING CONVENTION (a `<noun>_id` reference, or a shared
// `*UUID` identity column) but declare NO SQLite foreign key — so the link is
// invisible to every tool that reads `PRAGMA foreign_key_list` (the ER diagram,
// join-aware queries, the orphan check, the NL wizard's relationship engine).
//
// Motivating case: the Saropa Contacts schema links every table by a shared
// `contactSaropaUUID` column and never calls Drift's `.references()`, so the
// relationships that obviously exist in the app's Dart code are unseen by any
// standard Drift/SQLite surface. This detector is the sibling of
// [OrphanTableDetector]: that one finds a physical table the schema forgot;
// this one finds a relationship the data clearly has but the schema never
// declared.
//
// Honest scope (matches plans/history/2026.06/2026.06.12/77-soft-relationship-advisory.md):
//  * NOT a push to add SQLite `REFERENCES`. The recommended remedy is the
//    host relationship MANIFEST (Feature 78, [DeclaredRelationships]) — zero
//    runtime DB risk, no global `PRAGMA foreign_keys`, no migration. When the
//    manifest declares an edge, the finding disappears (resolved, not
//    suppressed).
//  * NOT an orphan-ROW scanner. In an offline-first app a child whose parent
//    UUID currently resolves to nothing is usually expected (out-of-order sync,
//    soft-deleted parent), so this stops at the SCHEMA level — "the
//    relationship isn't declared" — and never counts or flags rows.
//
// The two inference rules are a deliberate Dart port of `inferForeignKeys`
// (assets/web/nl-to-sql.ts), kept in lockstep with that TypeScript by the
// shared-fixture contract test (test/soft_relationship_detector_test.dart feeds
// the same `contactsApp` / `relational` shapes the web suite uses and asserts
// the same edge set).

import 'server_constants.dart';
import 'server_types.dart';
import 'server_typedefs.dart';
import 'server_utils.dart';

/// One column the inference needs: its [name] and whether it is the table's
/// primary key (so an inferred edge can target the real PK column, not a
/// hard-coded `id`).
class SoftRelColumn {
  const SoftRelColumn(this.name, {this.isPk = false});

  final String name;
  final bool isPk;
}

/// One table reduced to the shape the inference reads: a name and its columns.
class SoftRelTable {
  const SoftRelTable(this.name, this.columns);

  final String name;
  final List<SoftRelColumn> columns;
}

/// An inferred relationship edge `fromTable.fromColumn` → `toTable.toColumn`,
/// tagged with the naming [rule] that produced it so a reader can judge
/// confidence (`noun_id` is stronger than `shared_uuid`).
class SoftRelationshipEdge {
  const SoftRelationshipEdge({
    required this.fromTable,
    required this.fromColumn,
    required this.toTable,
    required this.toColumn,
    required this.rule,
  });

  final String fromTable;
  final String fromColumn;
  final String toTable;
  final String toColumn;

  /// [SoftRelationshipDetector.ruleNounId] or
  /// [SoftRelationshipDetector.ruleSharedUuid].
  final String rule;

  /// Case-insensitive identity used to subtract declared FK / manifest edges.
  /// SQLite identifiers match case-insensitively, and a Drift class name's
  /// casing may differ from the stored table casing, so the key is lowercased.
  String get key => SoftRelationshipDetector.edgeKey(
    fromTable,
    fromColumn,
    toTable,
    toColumn,
  );
}

/// Static, stateless soft-relationship detection. Mirrors [OrphanTableDetector]
/// so the check is unit-testable and reusable without a full handler context.
abstract final class SoftRelationshipDetector {
  /// `<noun>_id` / `<noun>Id` convention — the stronger signal.
  static const String ruleNounId = 'noun_id';

  /// Shared `*UUID` identity column convention.
  static const String ruleSharedUuid = 'shared_uuid';

  /// Diagnostic `type` tag shared by the finding and the merged `/api/issues`
  /// shape, so consumers (Saropa Lints, the Health tab) can filter on a stable
  /// key — same role [OrphanTableDetector.orphanFindingType] plays.
  static const String softRelationshipFindingType = 'soft_relationship';

  /// Severity for every soft-relationship finding: `info`, never `warning`.
  /// An undeclared soft relationship is a VISIBILITY gap, not a defect, in an
  /// app that links by UUID on purpose (contrast the orphan-table finding,
  /// which is `warning` because a stray physical table is usually a mistake).
  static const String severity = 'info';

  /// Matches any column name carrying `uuid` (case-insensitive) for rule 2.
  static final RegExp _uuidPattern = RegExp('uuid', caseSensitive: false);

  /// Strips `<noun>_id` / `<noun>Id` down to `<noun>`; an exact `id` column is
  /// not a reference and returns null. Port of `idTargetNoun` (nl-to-sql.ts).
  static final RegExp _bareId = RegExp(r'^id$', caseSensitive: false);
  static final RegExp _nounIdShape = RegExp(
    r'^(.+?)_?id$',
    caseSensitive: false,
  );
  static final RegExp _trailingUnderscores = RegExp(r'_+$');
  static final RegExp _pluralExceptions = RegExp(r'(ses|xes|zes|ches|shes)$');

  /// Case-insensitive edge identity `from.col->to.col`. Public so tests and the
  /// declared/manifest subtraction build keys the same way.
  static String edgeKey(
    String fromTable,
    String fromColumn,
    String toTable,
    String toColumn,
  ) =>
      '${fromTable.toLowerCase()}.${fromColumn.toLowerCase()}'
      '->${toTable.toLowerCase()}.${toColumn.toLowerCase()}';

  /// Naive singularizer — port of `singularize` (nl-to-sql.ts). Good enough for
  /// the conventional English table names this inference targets; the two
  /// implementations MUST stay identical (the contract test guards this).
  static String singularize(String n) {
    if (n.endsWith('ies')) {
      return '${n.substring(0, n.length - 3)}y';
    }
    if (_pluralExceptions.hasMatch(n)) {
      return n.substring(0, n.length - 2);
    }
    if (n.endsWith('s') && !n.endsWith('ss')) {
      return n.substring(0, n.length - 1);
    }
    return n;
  }

  /// Returns the referenced noun for a `<noun>_id` / `<noun>Id` column, or null
  /// when the column is a bare `id` or not an id-shaped name.
  static String? idTargetNoun(String colName) {
    if (_bareId.hasMatch(colName)) {
      return null;
    }
    final match = _nounIdShape.firstMatch(colName);
    if (match == null) {
      return null;
    }
    final noun = match.group(1);
    if (noun == null || noun.isEmpty) {
      return null;
    }
    final trimmed = noun.replaceAll(_trailingUnderscores, '');
    return trimmed.isEmpty ? null : trimmed;
  }

  /// Pure inference: the soft edges implied by the two naming conventions over
  /// [tables]. Deduped by [SoftRelationshipEdge.key]; self-identity edges (same
  /// table + same column on both sides) are skipped. Declared-FK and manifest
  /// subtraction happens in [getSoftRelationshipsResult]; this returns the full
  /// inferred set so the contract test can compare it against the TS engine.
  static List<SoftRelationshipEdge> inferEdges(List<SoftRelTable> tables) {
    final edges = <SoftRelationshipEdge>[];
    final seen = <String>{};

    void add(
      String fromTable,
      String fromColumn,
      String toTable,
      String toColumn,
      String rule,
    ) {
      // A column referencing itself on the same table is not a relationship.
      if (fromTable == toTable && fromColumn == toColumn) {
        return;
      }
      final edge = SoftRelationshipEdge(
        fromTable: fromTable,
        fromColumn: fromColumn,
        toTable: toTable,
        toColumn: toColumn,
        rule: rule,
      );
      if (seen.add(edge.key)) {
        edges.add(edge);
      }
    }

    String pkOf(SoftRelTable table) {
      for (final col in table.columns) {
        if (col.isPk) {
          return col.name;
        }
      }
      // No declared PK — fall back to the SQLite convention so the edge still
      // names a plausible target column (mirrors the TS `pkOf`).
      return 'id';
    }

    // Rule 1: `<noun>_id` / `<noun>Id` → the table whose (singular) name is
    // <noun>. The strongest signal — an explicit reference column.
    for (final child in tables) {
      for (final col in child.columns) {
        final noun = idTargetNoun(col.name);
        if (noun == null) {
          continue;
        }
        final nounLower = noun.toLowerCase();
        SoftRelTable? parent;
        for (final candidate in tables) {
          final tn = candidate.name.toLowerCase();
          if (tn == nounLower ||
              singularize(tn) == nounLower ||
              tn == '${nounLower}s') {
            parent = candidate;
            break;
          }
        }
        if (parent != null && parent.name != child.name) {
          add(child.name, col.name, parent.name, pkOf(parent), ruleNounId);
        }
      }
    }

    // Rule 2: a shared `*UUID` identity column carried by 2+ tables → the
    // children reference the OWNER table whose singular name is embedded in the
    // column name ("contact_points.contactSaropaUUID" → contacts).
    final carriersByColumn = <String, List<String>>{};
    for (final table in tables) {
      for (final col in table.columns) {
        if (!_uuidPattern.hasMatch(col.name)) {
          continue;
        }
        final carriers = carriersByColumn[col.name];
        if (carriers == null) {
          carriersByColumn[col.name] = <String>[table.name];
        } else {
          carriers.add(table.name);
        }
      }
    }
    carriersByColumn.forEach((column, carriers) {
      // A UUID column unique to one table identifies nothing to link to.
      if (carriers.length < 2) {
        return;
      }
      final columnLower = column.toLowerCase();
      // Owner = the carrier whose singular name is embedded in the column name;
      // the LONGEST such match wins so "contacts"→"contact" beats a stray short
      // substring hit.
      String? owner;
      var ownerLen = 0;
      for (final carrier in carriers) {
        final singular = singularize(carrier.toLowerCase());
        if (columnLower.contains(singular) && singular.length > ownerLen) {
          owner = carrier;
          ownerLen = singular.length;
        }
      }
      final resolvedOwner = owner;
      if (resolvedOwner == null) {
        return;
      }
      // The shared identity column IS the join key on both sides, so the
      // child's from-column and the owner's to-column are the same name. The
      // two locals are intentionally equal — distinct names keep the data flow
      // (child column → owner column) explicit and dodge the same-argument lint.
      final childColumn = column;
      final ownerColumn = column;
      for (final carrier in carriers) {
        if (carrier != resolvedOwner) {
          add(carrier, childColumn, resolvedOwner, ownerColumn, ruleSharedUuid);
        }
      }
    });

    return edges;
  }

  /// Scans the live schema for soft relationships and returns the advisory
  /// payload. Report-only: it reads `PRAGMA table_info` / `foreign_key_list`
  /// and never mutates anything.
  ///
  /// A finding is an inferred edge that is NOT a declared SQLite FK (subtracted
  /// via `PRAGMA foreign_key_list`) and NOT covered by the host [manifest]
  /// (Feature 78). When the manifest declares an inferred edge the finding
  /// disappears — that is the advisory being RESOLVED, the whole point of the
  /// feature, not suppressed.
  ///
  /// [manifest] is the host-declared relationship list, or null when the host
  /// supplied no manifest callback. Null is safe: every inferred edge is then
  /// reported (`info`, opt-in endpoint), and [jsonKeyManifestAvailable] tells
  /// the consumer the call-to-action ("declare it") has no channel yet.
  ///
  /// Returns a map with:
  /// * `softRelationships` — the findings (each carries `fromTable`,
  ///   `fromColumn`, `toTable`, `toColumn`, `rule`, `severity`, `type`,
  ///   `message`); empty when nothing is inferred or everything is declared.
  /// * `manifestAvailable` — whether a manifest was supplied.
  /// * `declaredFkCount` — number of declared SQLite FK edges subtracted.
  /// * `tablesScanned` — count of physical tables enumerated.
  /// * `analyzedAt` — ISO 8601 timestamp.
  ///
  /// Pure of [ServerContext]: callers own error handling and logging.
  static Future<Map<String, dynamic>> getSoftRelationshipsResult(
    DriftDebugQuery query, {
    required DeclaredRelationships? manifest,
  }) async {
    final tableNames = await ServerUtils.getTableNames(query);

    final tables = <SoftRelTable>[];
    final declaredEdgeKeys = <String>{};

    for (final tableName in tableNames) {
      final infoRows = ServerUtils.normalizeRows(
        await query('PRAGMA table_info("$tableName")'),
      );
      final columns = <SoftRelColumn>[];
      for (final row in infoRows) {
        final colName = row[ServerConstants.jsonKeyName] as String?;
        if (colName == null || colName.isEmpty) {
          continue;
        }
        // PRAGMA `pk` is 0 for non-key columns and the 1-based position within
        // a composite key otherwise; any positive value marks a PK column.
        final pkRaw = row[ServerConstants.jsonKeyPk];
        final isPk = pkRaw is num && pkRaw.toInt() > 0;
        columns.add(SoftRelColumn(colName, isPk: isPk));
      }
      tables.add(SoftRelTable(tableName, columns));

      // Declared SQLite FKs to subtract. A schema that DOES declare a link must
      // not also be flagged as a soft (undeclared) one.
      final fkRows = ServerUtils.normalizeRows(
        await query('PRAGMA foreign_key_list("$tableName")'),
      );
      for (final row in fkRows) {
        final toTable = row[ServerConstants.jsonKeyTable] as String?;
        final fromCol = row[ServerConstants.pragmaFrom] as String?;
        final toCol = row[ServerConstants.pragmaTo] as String?;
        if (toTable != null &&
            toTable.isNotEmpty &&
            fromCol != null &&
            toCol != null) {
          declaredEdgeKeys.add(edgeKey(tableName, fromCol, toTable, toCol));
        }
      }
    }

    // Manifest edges to subtract: a host-declared relationship is "known to
    // tooling" already, so the advisory has nothing to push the developer
    // toward — the edge is resolved.
    final manifestEdgeKeys = <String>{};
    if (manifest != null) {
      for (final edge in manifest) {
        manifestEdgeKeys.add(
          edgeKey(edge.fromTable, edge.fromColumn, edge.toTable, edge.toColumn),
        );
      }
    }

    final findings = <Map<String, dynamic>>[];
    for (final edge in inferEdges(tables)) {
      if (declaredEdgeKeys.contains(edge.key) ||
          manifestEdgeKeys.contains(edge.key)) {
        continue;
      }
      findings.add(_findingFor(edge));
    }

    return <String, dynamic>{
      ServerConstants.jsonKeySoftRelationships: findings,
      ServerConstants.jsonKeyManifestAvailable: manifest != null,
      ServerConstants.jsonKeyDeclaredFkCount: declaredEdgeKeys.length,
      ServerConstants.jsonKeyTablesScanned: tableNames.length,
      'analyzedAt': DateTime.now().toUtc().toIso8601String(),
    };
  }

  /// Builds the JSON finding for [edge]. No `suggestedSql`: the remedy is the
  /// manifest, not DDL, so there is no statement to hand the developer.
  static Map<String, dynamic> _findingFor(SoftRelationshipEdge edge) {
    return <String, dynamic>{
      ServerConstants.fkFromTable: edge.fromTable,
      ServerConstants.fkFromColumn: edge.fromColumn,
      ServerConstants.fkToTable: edge.toTable,
      ServerConstants.fkToColumn: edge.toColumn,
      ServerConstants.jsonKeyRule: edge.rule,
      ServerConstants.jsonKeySeverity: severity,
      ServerConstants.jsonKeyType: softRelationshipFindingType,
      ServerConstants.jsonKeyMessage: _messageFor(edge),
    };
  }

  /// Human-readable finding text. Names the convention that fired so the
  /// developer can judge confidence, and points the call-to-action at the
  /// manifest (NOT at adding a SQLite FK — see plan §7).
  static String _messageFor(SoftRelationshipEdge edge) {
    final convention = edge.rule == ruleSharedUuid
        ? 'shared UUID identity column'
        : '${edge.fromColumn} reference convention';
    return '${edge.fromTable}.${edge.fromColumn} looks like a link to '
        '${edge.toTable} ($convention), but no foreign key or relationship is '
        'declared. Tooling (ER diagram, joins, NL queries, orphan checks) '
        'cannot see it. Declare it via a relationship manifest to make it '
        'visible — no schema change or PRAGMA needed.';
  }
}
