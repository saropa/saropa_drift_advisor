// Anomaly detection extracted from AnalyticsHandler.
// Pure static logic with no instance state dependencies.

import 'dart:math' show log, sqrt;

import 'server_typedefs.dart';
import 'server_types.dart';
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
  ///
  /// [declaredRelationships] is the host's convention-based relationship
  /// manifest (Feature 78). A host that links tables by a shared UUID column
  /// declares ZERO SQLite foreign keys, so `PRAGMA foreign_key_list` is empty
  /// and the orphan-row check would otherwise see no relationships at all. The
  /// caller resolves [ServerContext.declaredRelationships] to a plain list and
  /// hands it down here, keeping this function pure and parameter-only for
  /// tests. Defaults to empty (a host that links by real FKs supplies nothing).
  static Future<Map<String, dynamic>> getAnomaliesResult(
    DriftDebugQuery query, {
    List<DeclaredRelationship> declaredRelationships =
        const <DeclaredRelationship>[],
  }) async {
    final tableNames = await ServerUtils.getTableNames(query);
    final anomalies = <Map<String, dynamic>>[];

    for (final tableName in tableNames) {
      // Fetch column metadata and row count for the
      // current table — shared by multiple detectors.
      final colInfoRows = ServerUtils.normalizeRows(
        await query('PRAGMA table_info(${ServerUtils.quoteIdent(tableName)})'),
      );
      final tableRowCount = ServerUtils.extractCountFromRows(
        ServerUtils.normalizeRows(
          await query(
            'SELECT COUNT(*) AS c FROM ${ServerUtils.quoteIdent(tableName)}',
          ),
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
            final hasEmptyDefault = dfltValue == "''" || dfltValue == '""';
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

      // 4. Detect orphaned foreign key references. Narrow the host manifest to
      //    this table's joinable edges: fromTable matches AND orphanCheckable
      //    (list_ref / seed_identity edges are excluded — a scalar LEFT JOIN
      //    cannot represent them). PRAGMA-derived FKs are added inside the
      //    detector; for a zero-FK host these declared edges are the ONLY
      //    relationship source the orphan check has.
      final declaredEdges = declaredRelationships
          .where((edge) => edge.fromTable == tableName && edge.orphanCheckable)
          .toList(growable: false);
      await _detectOrphanedForeignKeys(
        query: query,
        tableName: tableName,
        tableNames: tableNames,
        anomalies: anomalies,
        declaredEdges: declaredEdges,
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
          'SELECT COUNT(*) AS c FROM ${ServerUtils.quoteIdent(tableName)} '
          'WHERE ${ServerUtils.quoteIdent(colName)} IS NULL',
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
          'SELECT COUNT(*) AS c FROM ${ServerUtils.quoteIdent(tableName)} '
          "WHERE ${ServerUtils.quoteIdent(colName)} = ''",
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
  ///
  /// The `^last_?(…)` branch catches "last-activity"
  /// timestamps (`last_modified`, `last_seen`,
  /// `last_accessed`, `last_sync`, …). These are the
  /// worst-case z-score shape: the column is rewritten
  /// on every row touch, so the distribution always
  /// drifts forward with wall-clock time and σ shrinks
  /// to whatever the observation window happens to be.
  /// A table opened the same day produces a ~17-hour
  /// window, σ on the order of an hour, and the newest
  /// write sits many σ above the mean by construction —
  /// the "outlier" is just "the row we just wrote." The
  /// prior pattern had `^modified` but that never
  /// matched `last_modified` (it starts with `last`),
  /// so Drift's canonical `DateTimeColumn get
  /// lastModified` (serialized as `last_modified` in the
  /// SQLite schema) always fell through. `_?` + case-
  /// insensitive matching covers both snake_case
  /// (`last_modified`) and camelCase (`lastModified`)
  /// without widening to generic `^last_.*`, which would
  /// catch `last_name` / `last_ip` and suppress real
  /// signals. See
  /// bugs/anomaly_false_positive_tight_timestamp_range.md.
  static final _timestampPattern = RegExp(
    r'(^created|^updated|^deleted|^modified|^last_?(modified|seen|accessed|updated|used|sync|synced|refresh|refreshed|login|logout|active|activity|read|written|online|opened|played|viewed|fetch|fetched|heartbeat|ping|visit|visited|check|checked|poll|polled|scan|scanned)|_at$|_date$|_time$|_timestamp$|^timestamp$)',
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

  /// Column name patterns for rating, score, and percentage
  /// columns — these are bounded by definition (e.g., 0–10,
  /// 0–100, 0–5) and naturally produce skewed distributions.
  /// When data clusters at one end of a bounded scale (TV
  /// ratings skew high because viewers self-select), a value
  /// at the opposite boundary looks like a statistical outlier
  /// but is completely valid.
  ///
  /// Anchored to start/end like all other skip patterns in
  /// this class — matches `rating`, `user_rating`,
  /// `avg_score`, `percent_complete`, `win_pct`, etc.
  /// See bugs/anomaly_false_positive_valid_range.md.
  static final _ratingPattern = RegExp(
    r'(^rating|rating$|^score|score$|^percent|percent$|^pct|pct$)',
    caseSensitive: false,
  );

  /// Known bounded numeric scales. If the observed data range
  /// [min, max] fits entirely within one of these scales, the
  /// column is treated as bounded and outlier detection is
  /// suppressed — values at scale boundaries are legitimate,
  /// not anomalies.
  ///
  /// Each entry is (lowerBound, upperBound). Order does not
  /// matter; the first matching scale short-circuits.
  /// See bugs/anomaly_false_positive_valid_range.md.
  static const _boundedScales = <(double, double)>[
    (0, 1), // probability, normalized score
    (0, 5), // star rating (e.g., Amazon, Yelp)
    (1, 5), // star rating (1-based)
    (0, 10), // rating scale (e.g., IMDb, TVMaze)
    (1, 10), // rating scale (1-based)
    (0, 100), // percentage, percentile
  ];

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
  ///    timestamps, sort/ordering, year/founded,
  ///    rating/score/percent.
  /// 4. Small samples (n < 30) — sigma estimates are
  ///    unreliable and a single value can dominate.
  /// 5. Binary domain (range exactly 0–1).
  /// 6. Bounded scales — observed [min, max] fits within
  ///    a known scale (0–5, 0–10, 1–10, 0–100, etc.).
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
        _yearPattern.hasMatch(colName) ||
        _ratingPattern.hasMatch(colName)) {
      return;
    }

    // First pass: mean, min, max, and non-null count. Variance is computed
    // separately below as a SECOND pass (E[(X-mean)²]) rather than the naive
    // E[X²]-E[X]² in one query. The naive form subtracts two large, nearly
    // equal sums and loses most significant bits to floating-point cancellation
    // for large-magnitude, low-spread columns — yielding a garbage σ that either
    // suppressed real outliers (σ rounded to ~0) or flagged everything (tiny σ).
    // See plans/full-codebase-audit-2026.06.12.md M2.
    final col = ServerUtils.quoteIdent(colName);
    final tbl = ServerUtils.quoteIdent(tableName);
    final statsRows = ServerUtils.normalizeRows(
      await query(
        'SELECT AVG($col) AS avg_val, '
        'MIN($col) AS min_val, '
        'MAX($col) AS max_val, '
        'COUNT($col) AS cnt '
        'FROM $tbl WHERE $col IS NOT NULL',
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
    final sampleCount = (ServerUtils.toDouble(statsRows.first['cnt']) ?? 0)
        .toInt();
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

    // Skip columns whose observed data range fits within a
    // known bounded scale (e.g., 0–10 ratings, 0–100
    // percentages). Bounded scales naturally produce skewed
    // distributions — values at the scale boundary are
    // legitimate, not anomalies. A TV rating of 1.0 on a
    // 1–10 scale is rare but valid; sigma-based detection
    // flags it incorrectly because the data is non-Gaussian.
    // See bugs/anomaly_false_positive_valid_range.md.
    for (final (lower, upper) in _boundedScales) {
      if (min >= lower && max <= upper) {
        return;
      }
    }

    // Second pass: population variance as E[(X-mean)²], with the mean from the
    // first pass interpolated as a numeric literal (a double — no injection).
    // This is numerically stable where the naive one-pass form was not.
    final varianceRows = ServerUtils.normalizeRows(
      await query(
        'SELECT AVG(($col - $avg) * ($col - $avg)) AS variance '
        'FROM $tbl WHERE $col IS NOT NULL',
      ),
    );
    final rawVariance = varianceRows.isEmpty
        ? 0.0
        : (ServerUtils.toDouble(varianceRows.first['variance']) ?? 0);
    // Clamp to zero to guard against tiny negative rounding.
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

    // Log-scale fallback for all-positive columns. Distributions like currency
    // exchange rates and engagement scores span orders of magnitude but look
    // reasonable on a log scale; if the extremes are within 3σ of the GEOMETRIC
    // mean in log space, the spread is log-normal, not an outlier — suppress.
    //
    // The previous heuristic derived a log σ from the range (range/4) and
    // centered on log(arithmetic mean). With only min/max/mean it was circular:
    // both extremes ARE the range, so the test almost always passed and
    // suppressed everything. Locating an outlier needs the distribution of the
    // logs, so the real mean/variance of LN(x) are now computed in SQL. See M2.
    if (min > 0 &&
        await _passesLogScaleCheck(
          query: query,
          col: col,
          tbl: tbl,
          min: min,
          max: max,
        )) {
      return;
    }

    // Identify which end is the outlier and by how many
    // standard deviations, so developers know which
    // values to investigate.
    final minSigma = minDeviation / stddev;
    final maxSigma = maxDeviation / stddev;
    final outlierEnd = maxDeviation > minDeviation ? 'max' : 'min';
    final outlierValue = maxDeviation > minDeviation ? max : min;
    final outlierSigma = maxDeviation > minDeviation ? maxSigma : minSigma;

    // Include the sample size (n) in the message. A low-n
    // z-score is intrinsically unstable — 30 values is the
    // hard floor above (see `_minSampleSizeForOutliers`), but
    // 30 ≤ n < ~100 still produces wide confidence intervals
    // around σ, so "4.1σ from mean" at n=35 is a weaker
    // signal than the same number at n=5000. Surfacing n in
    // the diagnostic lets the reader judge that for themselves
    // without having to inspect the data.
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
          '(range [$min, $max], n=$sampleCount)',
    });
  }

  /// Returns true when the all-positive column's extremes sit within 3σ of the
  /// geometric mean in LOG space — i.e. the wide spread is log-normal, not an
  /// outlier, and the linear-scale flag should be suppressed.
  ///
  /// [col] and [tbl] are already-quoted identifiers. The mean and variance of
  /// `LN(x)` are computed in SQL (the naive `E[Y²]-E[Y]²` form is numerically
  /// safe here because log values are small-magnitude, unlike the raw column).
  /// SQLite exposes `LN` only when built with math functions; on a build without
  /// them the query throws and this returns false (do not suppress — report the
  /// outlier rather than silently swallow it). See plans/full-codebase-audit-2026.06.12.md M2.
  static Future<bool> _passesLogScaleCheck({
    required DriftDebugQuery query,
    required String col,
    required String tbl,
    required double min,
    required double max,
  }) async {
    try {
      final rows = ServerUtils.normalizeRows(
        await query(
          'SELECT AVG(LN($col)) AS log_mean, '
          'AVG(LN($col) * LN($col)) AS log_sqmean '
          'FROM $tbl WHERE $col IS NOT NULL',
        ),
      );
      if (rows.isEmpty) {
        return false;
      }
      final logMean = ServerUtils.toDouble(rows.first['log_mean']);
      final logSqMean = ServerUtils.toDouble(rows.first['log_sqmean']);
      if (logMean == null || logSqMean == null) {
        return false;
      }
      // ignore: avoid_equal_expressions -- E[Y²] - E[Y]²: squaring the mean, identical operands are intentional
      final logVariance = logSqMean - logMean * logMean;
      final logStddev = sqrt(logVariance < 0 ? 0 : logVariance);
      if (logStddev == 0) {
        return false;
      }
      final logThreshold = logStddev * 3;
      final logMinDev = (log(min) - logMean).abs();
      final logMaxDev = (log(max) - logMean).abs();
      return logMinDev <= logThreshold && logMaxDev <= logThreshold;
      // ignore: require_catch_logging -- a missing LN() (build without math functions) is an expected capability gap, not an error to surface; we degrade by not suppressing
    } on Object {
      // No LN() (SQLite built without math functions): cannot evaluate the log
      // distribution, so do not suppress — fall through and report the outlier.
      return false;
    }
  }

  /// Checks foreign keys on [tableName] and flags any
  /// rows where the FK value has no matching row in the
  /// referenced table (orphaned references).
  ///
  /// Relationship edges come from two sources, unioned:
  /// 1. `PRAGMA foreign_key_list` — SQLite-ENFORCED foreign keys. An orphan
  ///    found through one is genuine corruption (the engine should have
  ///    prevented it) → severity `error`.
  /// 2. [declaredEdges] — the host's convention-based manifest (Feature 78),
  ///    already narrowed by the caller to this table's orphan-checkable edges.
  ///    These links are descriptive only; SQLite does not enforce them, so an
  ///    orphan is EXPECTED steady state in an offline-first host (out-of-order
  ///    sync, soft-deleted parents) → severity `warning`, not `error`.
  ///
  /// For a host that declares no SQLite FKs (links by shared UUID column),
  /// source 1 is empty and [declaredEdges] is the only relationship source —
  /// without it the entire orphan-row class is silent for that host.
  static Future<void> _detectOrphanedForeignKeys({
    required DriftDebugQuery query,
    required String tableName,
    required List<String> tableNames,
    required List<Map<String, dynamic>> anomalies,
    required List<DeclaredRelationship> declaredEdges,
  }) async {
    final fkRows = ServerUtils.normalizeRows(
      await query(
        'PRAGMA foreign_key_list(${ServerUtils.quoteIdent(tableName)})',
      ),
    );

    // Build the candidate edge set. Enforced FKs first so a declared edge that
    // duplicates one (same from/to columns) is dropped below and keeps the
    // stronger `error` severity rather than being re-reported as a `warning`.
    final edges = <_OrphanEdge>[];
    for (final fk in fkRows) {
      final fromCol = fk['from'] as String?;
      final toTable = fk['table'] as String?;
      final toCol = fk['to'] as String?;
      if (fromCol != null && toTable != null && toCol != null) {
        edges.add(
          _OrphanEdge(
            fromCol: fromCol,
            toTable: toTable,
            toCol: toCol,
            enforced: true,
          ),
        );
      }
    }
    for (final edge in declaredEdges) {
      // Skip an edge already covered by an enforced FK (dedup on the join
      // triple). A host that BOTH declares and enforces a link is reported once
      // at `error`, never doubled.
      final alreadyEnforced = edges.any(
        (existing) =>
            existing.fromCol == edge.fromColumn &&
            existing.toTable == edge.toTable &&
            existing.toCol == edge.toColumn,
      );
      if (!alreadyEnforced) {
        edges.add(
          _OrphanEdge(
            fromCol: edge.fromColumn,
            toTable: edge.toTable,
            toCol: edge.toColumn,
            enforced: false,
          ),
        );
      }
    }

    for (final edge in edges) {
      // Only join against tables actually present in the schema — a manifest
      // can name a parent table the running DB does not have.
      if (!tableNames.contains(edge.toTable)) {
        continue;
      }

      // LEFT JOIN to find FK values with no matching
      // row in the referenced table.
      final orphanCount = ServerUtils.extractCountFromRows(
        ServerUtils.normalizeRows(
          await query(
            'SELECT COUNT(*) AS c FROM ${ServerUtils.quoteIdent(tableName)} t '
            'LEFT JOIN ${ServerUtils.quoteIdent(edge.toTable)} r '
            'ON t.${ServerUtils.quoteIdent(edge.fromCol)} = r.${ServerUtils.quoteIdent(edge.toCol)} '
            'WHERE t.${ServerUtils.quoteIdent(edge.fromCol)} IS NOT NULL '
            'AND r.${ServerUtils.quoteIdent(edge.toCol)} IS NULL',
          ),
        ),
      );

      if (orphanCount > 0) {
        anomalies.add(<String, dynamic>{
          'table': tableName,
          'column': edge.fromCol,
          'type': 'orphaned_fk',
          'severity': edge.enforced ? 'error' : 'warning',
          'count': orphanCount,
          'message':
              '$orphanCount orphaned FK(s): '
              '$tableName.${edge.fromCol} -> ${edge.toTable}.${edge.toCol}',
        });
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
          '(SELECT DISTINCT * FROM ${ServerUtils.quoteIdent(tableName)})',
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

/// One orphan-checkable relationship edge for [AnomalyDetector], normalized
/// from either an enforced `PRAGMA foreign_key_list` row or a host-declared
/// manifest edge. [enforced] carries the source so the orphan finding's
/// severity can branch: enforced → `error` (real corruption), declared-only →
/// `warning` (expected in an offline-first host).
final class _OrphanEdge {
  const _OrphanEdge({
    required this.fromCol,
    required this.toTable,
    required this.toCol,
    required this.enforced,
  });

  final String fromCol;
  final String toTable;
  final String toCol;
  final bool enforced;
}
