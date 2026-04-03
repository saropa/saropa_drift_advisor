// Anomaly detection extracted from AnalyticsHandler.
// Pure static logic with no instance state dependencies.

import 'server_typedefs.dart';
import 'server_utils.dart';

/// Static data-quality anomaly detection methods.
///
/// All methods are [static] and stateless — they depend
/// only on their parameters, never on instance fields.
/// Extracted from [AnalyticsHandler] so anomaly scanning
/// can be tested and reused without constructing a full
/// handler context.
abstract final class AnomalyDetector {
  /// Scans all tables for data quality anomalies and
  /// returns a map with `anomalies` (list),
  /// `tablesScanned` (count), and `analyzedAt` (ISO 8601).
  ///
  /// Detection pipeline per table:
  /// 1. NOT NULL columns → [_detectNullValues]
  /// 2. Text columns → [_detectEmptyStrings]
  /// 3. Numeric columns → [_detectNumericOutliers]
  /// 4. Foreign keys → [_detectOrphanedForeignKeys]
  /// 5. All rows → [_detectDuplicateRows]
  ///
  /// Pure function: no [ServerContext] dependency.
  /// Callers are responsible for error handling and
  /// logging.
  static Future<Map<String, dynamic>> getAnomaliesResult(
    DriftDebugQuery query,
  ) async {
    final tableNames = await ServerUtils.getTableNames(query);
    final anomalies = <Map<String, dynamic>>[];

    for (final tableName in tableNames) {
      // Fetch column metadata and row count for the
      // current table — shared by multiple detectors.
      final colInfoRows = ServerUtils.normalizeRows(
        await query('PRAGMA table_info("$tableName")'),
      );
      final tableRowCount = ServerUtils.extractCountFromRows(
        ServerUtils.normalizeRows(
          await query('SELECT COUNT(*) AS c FROM "$tableName"'),
        ),
      );

      // Run per-column detectors based on column type
      // and nullability constraints.
      for (final col in colInfoRows) {
        final colName = col['name'] as String?;
        final colType = (col['type'] as String?) ?? '';
        final isNullable = col['notnull'] == 0;
        if (colName != null) {
          // 1. Detect NULL values in NOT NULL columns —
          //    NULLs here indicate constraint violations or
          //    data corruption (e.g. direct SQL inserts,
          //    schema migrations). Nullable columns are
          //    skipped because NULLs are expected by design.
          if (!isNullable) {
            await _detectNullValues(
              query: query,
              tableName: tableName,
              colName: colName,
              tableRowCount: tableRowCount,
              anomalies: anomalies,
            );
          }

          // 2. Detect empty strings in NOT NULL text columns.
          //    Nullable text columns are skipped because the
          //    schema already signals that missing/absent data
          //    is acceptable — empty strings there are a valid
          //    design choice, not anomalies.
          if (ServerUtils.isTextType(colType) && !isNullable) {
            await _detectEmptyStrings(
              query: query,
              tableName: tableName,
              colName: colName,
              anomalies: anomalies,
            );
          }

          // 3. Detect numeric outliers (values > 10×
          //    average) in numeric columns. Boolean
          //    columns are excluded — skewed distributions
          //    (e.g., 9% true) are valid data patterns,
          //    not anomalies.
          if (ServerUtils.isNumericType(colType) &&
              !ServerUtils.isBooleanType(colType)) {
            await _detectNumericOutliers(
              query: query,
              tableName: tableName,
              colName: colName,
              anomalies: anomalies,
            );
          }
        }
      }

      // 4. Detect orphaned foreign key references.
      await _detectOrphanedForeignKeys(
        query: query,
        tableName: tableName,
        tableNames: tableNames,
        anomalies: anomalies,
      );

      // 5. Detect duplicate rows (DISTINCT count vs
      //    total count).
      await _detectDuplicateRows(
        query: query,
        tableName: tableName,
        tableRowCount: tableRowCount,
        anomalies: anomalies,
      );
    }

    // Sort anomalies by severity: error → warning → info.
    ServerUtils.sortAnomaliesBySeverity(anomalies);
    return <String, dynamic>{
      'anomalies': anomalies,
      'tablesScanned': tableNames.length,
      'analyzedAt': DateTime.now().toUtc().toIso8601String(),
    };
  }

  /// Counts NULL values in a NOT NULL [colName] and
  /// appends an anomaly if the count is non-zero.
  ///
  /// This method is only called for columns declared as
  /// NOT NULL — any NULLs found indicate a constraint
  /// violation (data corruption, direct SQL inserts
  /// bypassing constraints, or failed migrations).
  /// Severity is always 'error' because the schema
  /// explicitly forbids NULLs in these columns.
  static Future<void> _detectNullValues({
    required DriftDebugQuery query,
    required String tableName,
    required String colName,
    required int tableRowCount,
    required List<Map<String, dynamic>> anomalies,
  }) async {
    final nullCount = ServerUtils.extractCountFromRows(
      ServerUtils.normalizeRows(
        await query(
          'SELECT COUNT(*) AS c FROM "$tableName" '
          'WHERE "$colName" IS NULL',
        ),
      ),
    );
    if (nullCount == 0) {
      return;
    }

    final pct = tableRowCount > 0 ? (nullCount / tableRowCount * 100) : 0;

    // Always 'error' — NULLs in NOT NULL columns are
    // constraint violations, not warnings.
    anomalies.add(<String, dynamic>{
      'table': tableName,
      'column': colName,
      'type': 'null_values',
      'severity': 'error',
      'count': nullCount,
      'message':
          '$nullCount NULL value(s) in NOT NULL column '
          '$tableName.$colName (${pct.toStringAsFixed(1)}%)',
    });
  }

  /// Counts empty-string values in [colName] and appends
  /// an anomaly if the count is non-zero.
  static Future<void> _detectEmptyStrings({
    required DriftDebugQuery query,
    required String tableName,
    required String colName,
    required List<Map<String, dynamic>> anomalies,
  }) async {
    final emptyCount = ServerUtils.extractCountFromRows(
      ServerUtils.normalizeRows(
        await query(
          'SELECT COUNT(*) AS c FROM "$tableName" '
          "WHERE \"$colName\" = ''",
        ),
      ),
    );
    if (emptyCount == 0) {
      return;
    }

    anomalies.add(<String, dynamic>{
      'table': tableName,
      'column': colName,
      'type': 'empty_strings',
      'severity': 'warning',
      'count': emptyCount,
      'message': '$emptyCount empty string(s) in $tableName.$colName',
    });
  }

  /// Computes AVG/MIN/MAX for [colName] and flags an
  /// outlier anomaly when the min or max exceeds 10×
  /// the average magnitude.
  static Future<void> _detectNumericOutliers({
    required DriftDebugQuery query,
    required String tableName,
    required String colName,
    required List<Map<String, dynamic>> anomalies,
  }) async {
    final statsRows = ServerUtils.normalizeRows(
      await query(
        'SELECT AVG("$colName") AS avg_val, '
        'MIN("$colName") AS min_val, '
        'MAX("$colName") AS max_val '
        'FROM "$tableName" WHERE "$colName" IS NOT NULL',
      ),
    );
    if (statsRows.isEmpty) {
      return;
    }

    final avg = ServerUtils.toDouble(statsRows.first['avg_val']);
    final min = ServerUtils.toDouble(statsRows.first['min_val']);
    final max = ServerUtils.toDouble(statsRows.first['max_val']);
    if (avg == null || min == null || max == null || avg == 0) {
      return;
    }

    // Skip binary-domain columns (range exactly 0–1) —
    // these are typically boolean flags stored as INTEGER.
    // A skewed distribution (e.g., 9% true → avg 0.09) is
    // a valid data pattern, not an outlier.
    if (min == 0 && max == 1) {
      return;
    }

    // Flag when any extreme is more than 10× the average
    // magnitude — a simple but effective heuristic.
    if (max.abs() > avg.abs() * 10 || min.abs() > avg.abs() * 10) {
      anomalies.add(<String, dynamic>{
        'table': tableName,
        'column': colName,
        'type': 'potential_outlier',
        'severity': 'info',
        'message':
            'Potential outlier in $tableName.$colName: '
            'range [$min, $max], avg '
            '${avg.toStringAsFixed(2)}',
      });
    }
  }

  /// Checks foreign keys on [tableName] and flags any
  /// rows where the FK value has no matching row in the
  /// referenced table (orphaned references).
  static Future<void> _detectOrphanedForeignKeys({
    required DriftDebugQuery query,
    required String tableName,
    required List<String> tableNames,
    required List<Map<String, dynamic>> anomalies,
  }) async {
    final fkRows = ServerUtils.normalizeRows(
      await query('PRAGMA foreign_key_list("$tableName")'),
    );

    for (final fk in fkRows) {
      final fromCol = fk['from'] as String?;
      final toTable = fk['table'] as String?;
      final toCol = fk['to'] as String?;
      if (fromCol != null &&
          toTable != null &&
          toCol != null &&
          tableNames.contains(toTable)) {
        // LEFT JOIN to find FK values with no matching
        // row in the referenced table.
        final orphanCount = ServerUtils.extractCountFromRows(
          ServerUtils.normalizeRows(
            await query(
              'SELECT COUNT(*) AS c FROM "$tableName" t '
              'LEFT JOIN "$toTable" r '
              'ON t."$fromCol" = r."$toCol" '
              'WHERE t."$fromCol" IS NOT NULL '
              'AND r."$toCol" IS NULL',
            ),
          ),
        );

        if (orphanCount > 0) {
          anomalies.add(<String, dynamic>{
            'table': tableName,
            'column': fromCol,
            'type': 'orphaned_fk',
            'severity': 'error',
            'count': orphanCount,
            'message':
                '$orphanCount orphaned FK(s): '
                '$tableName.$fromCol -> $toTable.$toCol',
          });
        }
      }
    }
  }

  /// Compares DISTINCT row count against total row count
  /// for [tableName] and flags an anomaly when duplicates
  /// are detected.
  static Future<void> _detectDuplicateRows({
    required DriftDebugQuery query,
    required String tableName,
    required int tableRowCount,
    required List<Map<String, dynamic>> anomalies,
  }) async {
    final distinctCount = ServerUtils.extractCountFromRows(
      ServerUtils.normalizeRows(
        await query(
          'SELECT COUNT(*) AS c FROM '
          '(SELECT DISTINCT * FROM "$tableName")',
        ),
      ),
    );

    if (tableRowCount > distinctCount) {
      anomalies.add(<String, dynamic>{
        'table': tableName,
        'type': 'duplicate_rows',
        'severity': 'warning',
        'count': tableRowCount - distinctCount,
        'message':
            '${tableRowCount - distinctCount} duplicate '
            'row(s) in $tableName',
      });
    }
  }
}
