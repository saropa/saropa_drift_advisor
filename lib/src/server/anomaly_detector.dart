// Anomaly detection extracted from AnalyticsHandler.
// Pure static logic with no instance state dependencies.

import 'dart:math' show log, sqrt;

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
          //    Columns whose declared default is '' are also
          //    skipped — empty strings are the designed "no
          //    value" sentinel and flagging them is a false
          //    positive (see bugs/empty_string_default_false_positive.md).
          if (ServerUtils.isTextType(colType) && !isNullable) {
            // SQLite PRAGMA table_info returns the default
            // expression as-is, so an empty-string default
            // appears as the two-character string ''.
            final dfltValue = col['dflt_value'];
            final hasEmptyDefault =
                dfltValue == "''" || dfltValue == '""';
            if (!hasEmptyDefault) {
              await _detectEmptyStrings(
                query: query,
                tableName: tableName,
                colName: colName,
                anomalies: anomalies,
              );
            }
          }

          // 3. Detect numeric outliers (values > 3σ from
          //    the mean) in numeric columns. Boolean
          //    columns are excluded — skewed distributions
          //    (e.g., 9% true) are valid data patterns,
          //    not anomalies. Domain-specific columns
          //    (coordinates, timestamps, sort order,
          //    year/founded, versions, identifiers) and
          //    primary key columns are also skipped.
          if (ServerUtils.isNumericType(colType) &&
              !ServerUtils.isBooleanType(colType)) {
            final isPrimaryKey = col['pk'] != null && col['pk'] != 0;
            await _detectNumericOutliers(
              query: query,
              tableName: tableName,
              colName: colName,
              isPrimaryKey: isPrimaryKey,
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

  /// Column name patterns for identifier/key columns —
  /// external IDs (API identifiers, foreign system keys)
  /// are opaque identifiers, not measurements. Statistical
  /// outlier detection is meaningless because IDs are not
  /// drawn from a normal distribution and the local dataset
  /// is a sparse, non-random sample of the external ID space.
  /// See bugs/outlier_on_external_id_false_positive.md.
  static final _identifierPattern = RegExp(
    r'(^id$|_id$|Id$|_key$|Key$|_code$|Code$)',
    caseSensitive: true,
  );

  /// Minimum number of non-null values required before
  /// running sigma-based outlier detection. With fewer than
  /// 30 data points, the sample mean and standard deviation
  /// are unreliable estimators — the central limit theorem
  /// does not hold, and a single extreme value can dominate
  /// the statistics, producing false positives.
  static const _minSampleSizeForOutliers = 30;

  /// Column name patterns for geographic coordinate
  /// columns — these naturally span wide ranges
  /// (lat: -90..90, lon: -180..180) by definition.
  static final _coordinatePattern = RegExp(
    r'^(lat|lng|lon|latitude|longitude)$',
    caseSensitive: false,
  );

  /// Column name patterns for version/revision columns —
  /// these often use date-encoded integers (e.g. YYYYMMDD)
  /// that create legitimately large values.
  static final _versionPattern = RegExp(
    r'^(version|revision|rev)$',
    caseSensitive: false,
  );

  /// Column name patterns for timestamp columns — Unix
  /// epoch integers or ISO date values that span narrow
  /// real-world time windows but look like huge numeric
  /// ranges (e.g., 1735691375–1767237956 ≈ one year).
  static final _timestampPattern = RegExp(
    r'(^created|^updated|^deleted|^modified|_at$|_date$|_time$|_timestamp$|^timestamp$)',
    caseSensitive: false,
  );

  /// Column name patterns for sort/display ordering —
  /// these routinely use large gaps (e.g., 0–1251) to
  /// allow future insertion without renumbering.
  static final _sortOrderPattern = RegExp(
    r'^(sort_order|display_order|position|rank|ordering)$|_order$|_position$|_rank$',
    caseSensitive: false,
  );

  /// Column name patterns for year columns — historical
  /// datasets legitimately span centuries (e.g., banks
  /// founded 1472–2019).
  static final _yearPattern = RegExp(
    r'(^year$|_year$|^founded)',
    caseSensitive: false,
  );

  /// Computes statistical distribution metrics for
  /// [colName] and flags an outlier anomaly when min or
  /// max lies more than 3 standard deviations from the
  /// mean (the classic 3-sigma rule).
  ///
  /// Skip guards (checked in order):
  /// 1. Primary key columns (auto-increment, not data).
  /// 2. Identifier columns (`*_id`, `*_key`, `*_code`) —
  ///    opaque external IDs, not measurements.
  /// 3. Domain-specific columns: coordinates, versions,
  ///    timestamps, sort/ordering, year/founded.
  /// 4. Small samples (n < 30) — sigma estimates are
  ///    unreliable and a single value can dominate.
  ///
  /// Log-scale fallback: for all-positive columns that
  /// fail the linear 3σ check, a log-transformed check
  /// is applied to catch log-normal distributions
  /// (e.g., currency exchange rates, engagement scores).
  static Future<void> _detectNumericOutliers({
    required DriftDebugQuery query,
    required String tableName,
    required String colName,
    required bool isPrimaryKey,
    required List<Map<String, dynamic>> anomalies,
  }) async {
    // Skip primary key columns — auto-increment IDs are
    // sequential by definition, not measurements.
    if (isPrimaryKey) {
      return;
    }

    // Skip columns whose names indicate identifiers or
    // foreign keys. External IDs (API identifiers, foreign
    // system keys) are opaque — not drawn from a normal
    // distribution — so sigma-based outlier detection
    // produces false positives.
    // See bugs/outlier_on_external_id_false_positive.md.
    if (_identifierPattern.hasMatch(colName)) {
      return;
    }

    // Skip columns whose names indicate a domain where
    // wide numeric ranges are expected and correct.
    // Each pattern targets a specific false-positive
    // category documented in bugs/false_positive_anomaly_detections.md.
    if (_coordinatePattern.hasMatch(colName) ||
        _versionPattern.hasMatch(colName) ||
        _timestampPattern.hasMatch(colName) ||
        _sortOrderPattern.hasMatch(colName) ||
        _yearPattern.hasMatch(colName)) {
      return;
    }

    // Fetch mean, min, max, population variance, and
    // non-null count in a single query. Variance is
    // computed as E[X²] - E[X]² which SQLite can evaluate
    // without extensions. The count is used to enforce
    // the minimum sample size guard below.
    final statsRows = ServerUtils.normalizeRows(
      await query(
        'SELECT AVG("$colName") AS avg_val, '
        'MIN("$colName") AS min_val, '
        'MAX("$colName") AS max_val, '
        'AVG("$colName" * "$colName") - '
        'AVG("$colName") * AVG("$colName") AS variance, '
        'COUNT("$colName") AS cnt '
        'FROM "$tableName" WHERE "$colName" IS NOT NULL',
      ),
    );
    if (statsRows.isEmpty) {
      return;
    }

    // Small sample guard: sigma-based outlier detection is
    // unreliable with fewer than 30 data points. The sample
    // mean and standard deviation are poor estimators at
    // small n, and a single extreme value can dominate the
    // statistics. Skip to avoid false positives.
    final sampleCount =
        (ServerUtils.toDouble(statsRows.first['cnt']) ?? 0).toInt();
    if (sampleCount < _minSampleSizeForOutliers) {
      return;
    }

    final avg = ServerUtils.toDouble(statsRows.first['avg_val']);
    final min = ServerUtils.toDouble(statsRows.first['min_val']);
    final max = ServerUtils.toDouble(statsRows.first['max_val']);
    if (avg == null || min == null || max == null) {
      return;
    }

    // Skip binary-domain columns (range exactly 0–1) —
    // these are typically boolean flags stored as INTEGER.
    // A skewed distribution (e.g., 9% true → avg 0.09) is
    // a valid data pattern, not an outlier.
    if (min == 0 && max == 1) {
      return;
    }

    // Compute population standard deviation from the
    // SQL-computed variance. Clamp to zero to guard
    // against floating-point rounding producing tiny
    // negative values.
    final rawVariance = ServerUtils.toDouble(statsRows.first['variance']) ?? 0;
    final stddev = sqrt(rawVariance < 0 ? 0 : rawVariance);

    // Zero stddev means all values are identical — no
    // outliers possible.
    if (stddev == 0) {
      return;
    }

    // Flag when either extreme lies more than 3 standard
    // deviations from the mean (3-sigma rule). This
    // correctly handles high-variance distributions
    // (e.g., multi-currency exchange rates) where a wide
    // range is natural, while still catching isolated
    // extreme values in otherwise tight distributions.
    final minDeviation = (min - avg).abs();
    final maxDeviation = (max - avg).abs();
    final threshold = stddev * 3;

    if (maxDeviation <= threshold && minDeviation <= threshold) {
      // Neither extreme exceeds 3σ — no outlier.
      return;
    }

    // Log-scale fallback for all-positive columns.
    // Distributions like currency exchange rates and
    // engagement scores span orders of magnitude but
    // look reasonable on a log scale. If the log-
    // transformed data passes the 3σ check, suppress
    // the anomaly.
    if (min > 0) {
      final logMin = log(min);
      final logMax = log(max);
      final logAvg = log(avg);

      // Approximate log-space stddev from the range.
      // For a distribution spanning [logMin, logMax],
      // using (range / 4) as a conservative stddev
      // estimate (covers ~95% of a normal distribution).
      final logRange = logMax - logMin;
      final logStddev = logRange / 4;

      if (logStddev > 0) {
        final logMinDev = (logMin - logAvg).abs();
        final logMaxDev = (logMax - logAvg).abs();
        final logThreshold = logStddev * 3;

        if (logMinDev <= logThreshold && logMaxDev <= logThreshold) {
          // Passes on log scale — this is a wide but
          // log-normal distribution, not an outlier.
          return;
        }
      }
    }

    // Identify which end is the outlier and by how many
    // standard deviations, so developers know which
    // values to investigate.
    final minSigma = minDeviation / stddev;
    final maxSigma = maxDeviation / stddev;
    final outlierEnd = maxDeviation > minDeviation ? 'max' : 'min';
    final outlierValue = maxDeviation > minDeviation ? max : min;
    final outlierSigma = maxDeviation > minDeviation ? maxSigma : minSigma;

    anomalies.add(<String, dynamic>{
      'table': tableName,
      'column': colName,
      'type': 'potential_outlier',
      'severity': 'info',
      'message':
          'Potential outlier in $tableName.$colName: '
          '$outlierEnd value $outlierValue is '
          '${outlierSigma.toStringAsFixed(1)}σ from mean '
          '${avg.toStringAsFixed(2)} '
          '(range [$min, $max])',
    });
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
