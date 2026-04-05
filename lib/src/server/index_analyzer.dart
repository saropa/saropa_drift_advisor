// Index suggestion analysis extracted from AnalyticsHandler.
// Pure static logic with no instance state dependencies.

import 'server_constants.dart';
import 'server_typedefs.dart';
import 'server_utils.dart';

/// Static index analysis methods.
///
/// All methods are [static] and stateless — they depend
/// only on their parameters, never on instance fields.
/// Extracted from [AnalyticsHandler] so index analysis
/// can be tested and reused without constructing a full
/// handler context.
abstract final class IndexAnalyzer {
  /// Analyzes all tables for missing indexes and returns
  /// a map with `suggestions` (list) and `tablesAnalyzed`
  /// (count).
  ///
  /// Detection heuristics:
  /// 1. Foreign key columns without a covering index
  ///    (priority: high).
  /// 2. Columns ending in `_id` that are not already
  ///    indexed or primary-keyed (priority: medium).
  /// 3. Date/time columns that are not already indexed
  ///    (priority: low).
  ///
  /// Pure function: no [ServerContext] dependency.
  static Future<Map<String, dynamic>> getIndexSuggestionsList(
    DriftDebugQuery query,
  ) async {
    final tableNames = await ServerUtils.getTableNames(query);
    final suggestions = <Map<String, dynamic>>[];

    // Build a lowercase set of all table names so the _id
    // heuristic can check whether a matching target table
    // actually exists (e.g. user_id → "users" or "user").
    final tableNamesLower = tableNames.map((t) => t.toLowerCase()).toSet();

    for (final tableName in tableNames) {
      // Collect existing indexed columns for this table
      // so we can skip columns that already have coverage.
      final existingIndexRows = ServerUtils.normalizeRows(
        await query('PRAGMA index_list("$tableName")'),
      );
      final indexedColumns = <String>{};

      for (final idx in existingIndexRows) {
        final idxName = idx['name'] as String?;
        if (idxName != null) {
          final idxInfoRows = ServerUtils.normalizeRows(
            await query('PRAGMA index_info("$idxName")'),
          );

          for (final col in idxInfoRows) {
            final colName = col['name'] as String?;
            if (colName != null) indexedColumns.add(colName);
          }
        }
      }

      // 1. Check foreign keys — un-indexed FK columns
      //    cause slow JOINs and cascaded deletes.
      final fkRows = ServerUtils.normalizeRows(
        await query('PRAGMA foreign_key_list("$tableName")'),
      );

      for (final fk in fkRows) {
        final fromCol = fk['from'] as String?;

        if (fromCol != null && !indexedColumns.contains(fromCol)) {
          suggestions.add(<String, dynamic>{
            'table': tableName,
            'column': fromCol,
            'reason':
                'Foreign key without index '
                '(references ${fk['table']}.${fk['to']})',
            'sql':
                'CREATE INDEX idx_${tableName}_$fromCol '
                'ON "$tableName"("$fromCol");',
            'priority': 'high',
          });
        }
      }

      // 2–3. Check column naming patterns for _id suffix
      //      and date/time suffix heuristics.
      final colInfoRows = ServerUtils.normalizeRows(
        await query('PRAGMA table_info("$tableName")'),
      );

      for (final col in colInfoRows) {
        final colName = col['name'] as String?;
        final pk = col['pk'];
        if (colName != null &&
            !(pk is int && pk > 0) &&
            !indexedColumns.contains(colName)) {
          final alreadySuggested = suggestions.any(
            (s) => s['table'] == tableName && s['column'] == colName,
          );

          // 2. Columns ending in _id — only suggest when
          //    the prefix matches an existing table name,
          //    which strongly implies a foreign-key-like
          //    relationship (e.g. user_id → table "users").
          //    External reference IDs like api_id, swapi_id,
          //    wikidata_id are skipped because no matching
          //    table exists.
          if (!alreadySuggested &&
              ServerConstants.reIdSuffix.hasMatch(colName) &&
              _hasMatchingTable(colName, tableNamesLower)) {
            suggestions.add(<String, dynamic>{
              'table': tableName,
              'column': colName,
              'reason':
                  'Column ending in _id \u2014 likely used in '
                  'JOINs/WHERE',
              'sql':
                  'CREATE INDEX idx_${tableName}_$colName '
                  'ON "$tableName"("$colName");',
              'priority': 'medium',
            });
          }

          // 3. Date/time columns — often used in ORDER BY
          //    or range queries.
          if (!alreadySuggested &&
              ServerConstants.reDateTimeSuffix.hasMatch(colName)) {
            suggestions.add(<String, dynamic>{
              'table': tableName,
              'column': colName,
              'reason':
                  'Date/time column \u2014 often used in '
                  'ORDER BY or range queries',
              'sql':
                  'CREATE INDEX idx_${tableName}_$colName '
                  'ON "$tableName"("$colName");',
              'priority': 'low',
            });
          }
        }
      }
    }

    // Sort suggestions by priority: high → medium → low.
    const priorityOrder = <String, int>{'high': 0, 'medium': 1, 'low': 2};

    suggestions.sort(
      (a, b) => (priorityOrder[a['priority']] ?? 3).compareTo(
        priorityOrder[b['priority']] ?? 3,
      ),
    );

    return <String, dynamic>{
      'suggestions': suggestions,
      'tablesAnalyzed': tableNames.length,
    };
  }

  /// Returns `true` when the prefix before `_id` in [colName]
  /// matches an existing table name (singular or plural).
  ///
  /// For example, `user_id` matches if table `user` or `users`
  /// exists. `api_id` returns `false` when no `api`/`apis`
  /// table is present — it is likely an external reference ID,
  /// not a foreign key.
  static bool _hasMatchingTable(String colName, Set<String> tableNamesLower) {
    // Strip the trailing _id to get the prefix
    // (e.g. "category_id" → "category").
    final prefix = colName.substring(0, colName.length - 3).toLowerCase();

    if (prefix.isEmpty) return false;

    // Check exact match and common English plural forms:
    //   +s        (user   → users)
    //   +es       (address → addresses)
    //   y → ies   (category → categories)
    if (tableNamesLower.contains(prefix) ||
        tableNamesLower.contains('${prefix}s') ||
        tableNamesLower.contains('${prefix}es')) {
      return true;
    }

    // Handle y → ies (e.g. category_id → "categories").
    if (prefix.endsWith('y')) {
      final iesForm = '${prefix.substring(0, prefix.length - 1)}ies';
      if (tableNamesLower.contains(iesForm)) return true;
    }

    return false;
  }
}
