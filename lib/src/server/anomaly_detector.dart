// Anomaly detection extracted from AnalyticsHandler.
// Pure static logic with no instance state dependencies.

import 'dart:async' show TimeoutException;
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
  /// Maximum row count before per-column probes are skipped for a table.
  /// With combined queries the scan is a single pass, so even large tables
  /// are fast — but above this limit the wall-clock cost of a single pass
  /// starts to matter on the host's single SQLite connection.
  static const _maxRowsForFullScan = 1000000;

  /// Maximum row count before the duplicate-row check is skipped.
  /// `SELECT DISTINCT *` forces a sort/temp-B-tree over every column of every
  /// row, which is orders of magnitude more expensive than an aggregate scan.
  static const _maxRowsForDuplicateCheck = 100000;

  /// Wall-clock budget for the entire anomaly scan. Partial results are
  /// returned with `truncated: true` when the budget is exceeded.
  static const _scanBudget = defaultScanBudget;

  /// Public alias of the production wall-clock budget, so a caller that
  /// wants to override [getAnomaliesResult]'s `scanBudget` conditionally
  /// (e.g. only when a caller-supplied value is present) has a value to
  /// fall back to instead of duplicating the magic number or being forced
  /// to always pass an override.
  static const Duration defaultScanBudget = Duration(seconds: 60);

  /// Scans all tables for data quality anomalies and
  /// returns a map with `anomalies` (list),
  /// `tablesScanned` (count), and `analyzedAt` (ISO 8601).
  ///
  /// Detection pipeline per table (collapsed into combined queries):
  /// 1. NOT NULL columns → NULL value counts
  /// 2. Text columns → empty-string counts
  /// 3. Numeric columns → outlier detection (3σ rule)
  /// 4. Foreign keys → [_detectOrphanedForeignKeys]
  /// 5. All rows → [_detectDuplicateRows] (guarded)
  ///
  /// Per-column probes (1–3) are folded into at most two SQL queries per
  /// table: one combined scan for counts and pass-1 stats, and one combined
  /// variance query for columns that need the 3σ check. This replaces the
  /// prior per-column await loops that issued thousands of serial scans.
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
  ///
  /// [suppressions] is the server-side equivalent of the extension's
  /// `// drift-advisor:ignore` inline directives. Each [AnomalySuppression]
  /// specifies a table[.column][.type] combination to exclude from the
  /// result. The caller collects suppressions from whatever source (parsed
  /// Dart comments, host configuration, user settings) and passes them here.
  /// Suppressed anomalies are removed before sorting and returning, so they
  /// never appear in JSON or server logs. Defaults to empty (no suppressions).
  ///
  /// [statementTimeout] bounds every individual SQL query. When non-null,
  /// each `await query(sql)` is wrapped with `.timeout(statementTimeout)`.
  /// Without this, a single slow scan on a pathological table can wedge
  /// the SQLite connection and starve every other endpoint. A timeout on
  /// one table's scan is caught per-table (see the loop below) so it skips
  /// only that table instead of discarding every anomaly already collected.
  ///
  /// [scanBudget] overrides the default wall-clock budget for the whole
  /// scan (see [_scanBudget]). Exposed as a parameter (defaulting to the
  /// production value) purely so tests can inject a short budget instead
  /// of waiting out the real 60-second default.
  static Future<Map<String, dynamic>> getAnomaliesResult(
    DriftDebugQuery query, {
    List<DeclaredRelationship> declaredRelationships =
        const <DeclaredRelationship>[],
    List<AnomalySuppression> suppressions = const <AnomalySuppression>[],
    Set<String> staticTables = const <String>{},
    Set<String> tablesWithObservedMutations = const <String>{},
    Duration? statementTimeout,
    Duration scanBudget = _scanBudget,
  }) async {
    // Wrap query with per-statement timeout so a single slow scan cannot
    // wedge the connection. SqlHandler already does this; the anomaly
    // detector never did, which is what allowed the all-endpoints-blocked
    // failure mode described in the bug.
    final DriftDebugQuery boundedQuery;
    if (statementTimeout != null) {
      boundedQuery = (sql) => query(sql).timeout(statementTimeout);
    } else {
      boundedQuery = query;
    }

    final budget = Stopwatch()..start();
    final tableNames = await ServerUtils.getTableNames(boundedQuery);
    final anomalies = <Map<String, dynamic>>[];
    var tablesScanned = 0;
    var truncated = false;

    for (final tableName in tableNames) {
      // Wall-clock budget: stop the whole scan and return partial results
      // rather than running unbounded. Remaining tables are silently skipped
      // and `truncated: true` is added to the response envelope.
      if (budget.elapsed > scanBudget) {
        truncated = true;
        break;
      }

      tablesScanned++;

      // Each table's detectors run inside their own try/catch: a timeout on
      // one pathological table (e.g. a huge column under connection
      // contention) must skip that table, not discard every anomaly already
      // collected for tables scanned so far. Without a per-table catch, a
      // single slow table would propagate past this loop to the caller's
      // generic error handler and turn a partial-results scan into a
      // zero-results failure — the opposite of what `truncated` promises.
      try {
        await _scanTable(
          query: boundedQuery,
          tableName: tableName,
          tableNames: tableNames,
          anomalies: anomalies,
          declaredRelationships: declaredRelationships,
        );
      } on TimeoutException {
        anomalies.add(<String, dynamic>{
          'table': tableName,
          'type': 'scan_skipped',
          'severity': 'info',
          'message':
              'Anomaly scan for $tableName timed out and was skipped; '
              'other tables were still scanned.',
        });
      }
    }

    // Remove anomalies matching suppressions. Two sources merge here:
    //  - caller-supplied suppressions (server-side `// drift-advisor:ignore`);
    //  - one `potential_outlier` suppression per host-declared static table
    //    (Finding 3): an outlier in immutable seed data can never be a defect,
    //    but recurred as info-level noise in every export. Only the outlier
    //    kind is suppressed — a NULL-in-NOT-NULL or orphan FK in seed data is
    //    still a real bug worth reporting.
    final effectiveSuppressions = <AnomalySuppression>[
      ...suppressions,
      for (final t in staticTables)
        AnomalySuppression(table: t, type: 'potential_outlier'),
    ];
    if (effectiveSuppressions.isNotEmpty) {
      anomalies.removeWhere(
        (a) => effectiveSuppressions.any((s) => s.matches(a)),
      );
    }

    // Discoverability (Finding 3): any potential_outlier that survived is on a
    // table NOT declared static (static ones were just suppressed). Emit ONE
    // hint — not one per finding — naming those tables and the exact snippet
    // that silences them, so the fix is visible from the finding itself rather
    // than buried in docs.
    final outlierSet = <String>{};
    for (final a in anomalies) {
      final t = a['table'];
      // `is String` promotes t, so no unsafe cast is needed.
      if (a['type'] == 'potential_outlier' && t is String) {
        outlierSet.add(t);
      }
    }
    final outlierTables = outlierSet.toList()..sort();
    if (outlierTables.isNotEmpty) {
      // Auto-suggest which outlier tables are the likely static candidates:
      // a table that produced an outlier but had NO observed mutation this
      // session is a stronger static/seed candidate than one the app is
      // actively changing. `tablesWithObservedMutations` is directional, not
      // definitive (see TableActivityTracker.tablesWithObservedMutations) —
      // when it is empty (no activity data, e.g. a fresh session) NO table can
      // be ruled out, so every outlier table is offered as a candidate.
      final candidates = outlierTables
          .where((t) => !tablesWithObservedMutations.contains(t))
          .toList();
      final active = outlierTables
          .where(tablesWithObservedMutations.contains)
          .toList();
      final activeNote = active.isEmpty
          ? ''
          : ' (${active.join(', ')} had writes/changes this session, so '
                'likely NOT static.)';
      // Two shapes: if the mutation signal left any no-mutation table, name
      // those as the likely-static candidates and put only them in the
      // snippet. If EVERY outlier table was mutated (no candidate), do not
      // claim any is static — offer the full list for the developer to judge.
      final String suggestionSentence;
      final List<String> snippetTables;
      if (candidates.isNotEmpty) {
        snippetTables = candidates;
        suggestionSentence =
            'Likely static (no mutations observed this session): '
            '${candidates.join(', ')}.$activeNote';
      } else {
        snippetTables = outlierTables;
        suggestionSentence =
            'All had writes/changes this session, so none look static; '
            'mark any you know to hold static content.';
      }
      final snippetList = snippetTables.map((t) => "'$t'").join(', ');
      anomalies.add(<String, dynamic>{
        'type': 'outlier_check_hint',
        'severity': 'info',
        'message':
            'Outlier checks ran on ${outlierTables.join(', ')}. '
            'The max-vs-mean (3σ) check cannot indicate a defect on static or '
            'seed data. $suggestionSentence '
            'Mark them static to silence this: '
            'startDriftViewer(db, staticTables: [$snippetList]).',
      });
    }

    // Sort anomalies by severity: error → warning → info.
    ServerUtils.sortAnomaliesBySeverity(anomalies);
    final result = <String, dynamic>{
      'anomalies': anomalies,
      'tablesScanned': tablesScanned,
      'analyzedAt': DateTime.now().toUtc().toIso8601String(),
    };
    // Signal partial results when the wall-clock budget was exceeded.
    if (truncated) {
      result['truncated'] = true;
    }
    return result;
  }

  /// Runs all per-table detectors (NULL, empty-string, outlier, orphan FK,
  /// duplicate rows) for a single [tableName] and appends findings to
  /// [anomalies]. Extracted from [getAnomaliesResult] so the caller can wrap
  /// each table's scan in its own try/catch — a timeout here propagates to
  /// the caller, which skips just this table.
  static Future<void> _scanTable({
    required DriftDebugQuery query,
    required String tableName,
    required List<String> tableNames,
    required List<Map<String, dynamic>> anomalies,
    required List<DeclaredRelationship> declaredRelationships,
  }) async {
    // Fetch column metadata — shared by all detectors for this table.
    final colInfoRows = ServerUtils.normalizeRows(
      await query('PRAGMA table_info(${ServerUtils.quoteIdent(tableName)})'),
    );

    // ── Classify columns ──────────────────────────────────
    // Build parallel lists for the combined scan query so each detector
    // class (NULL, empty-string, outlier) is served from a single pass.
    // Aliases are positional (index into these lists), not derived from the
    // column name — two columns whose names sanitize to the same alias
    // (e.g. "foo-bar" and "foo_bar") would otherwise collide and silently
    // overwrite each other's stats in the result row.
    final notNullCols = <String>[];
    final notNullTextCols = <String>[];
    final numericCols = <String>[];
    var hasPrimaryKey = false;
    final nonBlobColNames = <String>[];

    for (final col in colInfoRows) {
      final colName = col['name'] as String?;
      final colType = (col['type'] as String?) ?? '';
      final isNullable = col['notnull'] == 0;
      final isPk = col['pk'] != null && col['pk'] != 0;
      if (isPk) hasPrimaryKey = true;
      if (colName == null) continue;

      // Track non-BLOB columns for the duplicate-row check (BLOBs are
      // excluded because sorting multi-MB values through the temp store
      // is what made the old DISTINCT * query pathological).
      if (!_isBlobType(colType)) {
        nonBlobColNames.add(colName);
      }

      // NOT NULL columns → check for NULL constraint violations.
      if (!isNullable) {
        notNullCols.add(colName);
      }

      // NOT NULL text columns without an empty-string default → check
      // for empty strings. Columns whose default IS '' are skipped
      // because the schema treats empty strings as the designed
      // "no value" sentinel.
      if (ServerUtils.isTextType(colType) && !isNullable) {
        final dfltValue = col['dflt_value'];
        final hasEmptyDefault = dfltValue == "''" || dfltValue == '""';
        if (!hasEmptyDefault) {
          notNullTextCols.add(colName);
        }
      }

      // Numeric, non-boolean, non-PK, non-domain columns → outlier
      // check. All skip guards are applied here so excluded columns
      // never enter the combined query.
      if (ServerUtils.isNumericType(colType) &&
          !ServerUtils.isBooleanType(colType) &&
          !isPk &&
          !_shouldSkipOutlierColumn(colName)) {
        numericCols.add(colName);
      }
    }

    // ── Combined scan query ───────────────────────────────
    // One full-table pass replaces the prior per-column await loops.
    // Includes: row count, NULL counts, empty-string counts, and
    // outlier pass-1 aggregates (AVG, MIN, MAX, COUNT per column).
    // Every alias below is positional ("null_0", "avg_2", ...) so distinct
    // columns can never collide on the same result-row key.
    final tbl = ServerUtils.quoteIdent(tableName);
    final selectParts = <String>['COUNT(*) AS _row_count'];

    for (var i = 0; i < notNullCols.length; i++) {
      selectParts.add(
        'SUM(${ServerUtils.quoteIdent(notNullCols[i])} IS NULL) '
        'AS "null_$i"',
      );
    }
    for (var i = 0; i < notNullTextCols.length; i++) {
      selectParts.add(
        "SUM(${ServerUtils.quoteIdent(notNullTextCols[i])} = '') "
        'AS "empty_$i"',
      );
    }
    for (var i = 0; i < numericCols.length; i++) {
      final qc = ServerUtils.quoteIdent(numericCols[i]);
      selectParts.add('AVG($qc) AS "avg_$i"');
      selectParts.add('MIN($qc) AS "min_$i"');
      selectParts.add('MAX($qc) AS "max_$i"');
      selectParts.add('COUNT($qc) AS "cnt_$i"');
    }

    final scanRows = ServerUtils.normalizeRows(
      await query('SELECT ${selectParts.join(', ')} FROM $tbl'),
    );
    if (scanRows.isEmpty) return;
    final scanRow = scanRows.first;

    final tableRowCount = (ServerUtils.toDouble(scanRow['_row_count']) ?? 0)
        .toInt();

    // Row-count guard: skip per-column anomaly processing for oversized
    // tables. The combined scan already ran (it's cheap enough), but we
    // don't act on its results — each individual count would produce
    // noise, and the variance/log-scale follow-ups are the expensive
    // part. FK and duplicate checks still run (they use indexes).
    final skipPerColumnChecks = tableRowCount > _maxRowsForFullScan;

    if (!skipPerColumnChecks) {
      // ── Process NULL results ──────────────────────────────
      for (var i = 0; i < notNullCols.length; i++) {
        final nullCount = (ServerUtils.toDouble(scanRow['null_$i']) ?? 0)
            .toInt();
        if (nullCount == 0) continue;

        final c = notNullCols[i];
        final pct = tableRowCount > 0 ? (nullCount / tableRowCount * 100) : 0;
        // Always 'error' — NULLs in NOT NULL columns are constraint
        // violations, not warnings.
        anomalies.add(<String, dynamic>{
          'table': tableName,
          'column': c,
          'type': 'null_values',
          'severity': 'error',
          'count': nullCount,
          'message':
              '$nullCount NULL value(s) in NOT NULL column '
              '$tableName.$c (${pct.toStringAsFixed(1)}%)',
        });
      }

      // ── Process empty-string results ──────────────────────
      for (var i = 0; i < notNullTextCols.length; i++) {
        final emptyCount = (ServerUtils.toDouble(scanRow['empty_$i']) ?? 0)
            .toInt();
        if (emptyCount == 0) continue;

        final c = notNullTextCols[i];
        anomalies.add(<String, dynamic>{
          'table': tableName,
          'column': c,
          'type': 'empty_strings',
          'severity': 'warning',
          'count': emptyCount,
          'message': '$emptyCount empty string(s) in $tableName.$c',
        });
      }

      // ── Process outlier pass-1: collect variance candidates ─
      final varianceCandidates = <_OutlierCandidate>[];
      for (var i = 0; i < numericCols.length; i++) {
        final sampleCount = (ServerUtils.toDouble(scanRow['cnt_$i']) ?? 0)
            .toInt();
        // Small sample guard: sigma-based outlier detection is unreliable
        // with fewer than 30 data points.
        if (sampleCount < _minSampleSizeForOutliers) continue;

        final avg = ServerUtils.toDouble(scanRow['avg_$i']);
        final min = ServerUtils.toDouble(scanRow['min_$i']);
        final max = ServerUtils.toDouble(scanRow['max_$i']);
        if (avg == null || min == null || max == null) continue;

        // Skip binary-domain columns (range exactly 0–1).
        if (min == 0 && max == 1) continue;

        // Skip columns whose observed range fits within a known bounded
        // scale (0–5, 0–10, 1–10, 0–100, etc.).
        var bounded = false;
        for (final (lower, upper) in _boundedScales) {
          if (min >= lower && max <= upper) {
            bounded = true;
            break;
          }
        }
        if (bounded) continue;

        varianceCandidates.add(
          _OutlierCandidate(
            colName: numericCols[i],
            avg: avg,
            min: min,
            max: max,
            sampleCount: sampleCount,
          ),
        );
      }

      // ── Combined variance query (pass-2) ──────────────────
      // One scan replaces per-column variance queries. Each column's
      // variance is E[(X-mean)²] with the mean from pass-1 interpolated
      // as a numeric literal (numerically stable; see M2 audit note).
      // Aliases are positional within this candidate list — a fresh index
      // space per query, so no collision with the scan-query aliases above.
      if (varianceCandidates.isNotEmpty) {
        final varParts = <String>[];
        for (var i = 0; i < varianceCandidates.length; i++) {
          final c = varianceCandidates[i];
          final qc = ServerUtils.quoteIdent(c.colName);
          varParts.add('AVG(($qc - ${c.avg}) * ($qc - ${c.avg})) AS "var_$i"');
        }
        final varRows = ServerUtils.normalizeRows(
          await query('SELECT ${varParts.join(', ')} FROM $tbl'),
        );

        if (varRows.isNotEmpty) {
          final varRow = varRows.first;
          for (var i = 0; i < varianceCandidates.length; i++) {
            final c = varianceCandidates[i];
            final rawVariance = ServerUtils.toDouble(varRow['var_$i']) ?? 0;
            // Clamp to zero to guard against tiny negative rounding.
            final stddev = sqrt(rawVariance < 0 ? 0 : rawVariance);
            // Zero stddev means all values are identical — no outliers.
            if (stddev == 0) continue;

            final minDeviation = (c.min - c.avg).abs();
            final maxDeviation = (c.max - c.avg).abs();
            final threshold = stddev * 3;

            // Neither extreme exceeds 3σ — no outlier.
            if (maxDeviation <= threshold && minDeviation <= threshold) {
              continue;
            }

            // Log-scale fallback for all-positive columns: if extremes
            // sit within 3σ of the geometric mean in log space, the wide
            // spread is log-normal, not an outlier. These queries remain
            // individual because they are rare (only columns that failed
            // the linear check AND have min > 0).
            if (c.min > 0 &&
                await _passesLogScaleCheck(
                  query: query,
                  col: ServerUtils.quoteIdent(c.colName),
                  tbl: tbl,
                  min: c.min,
                  max: c.max,
                )) {
              continue;
            }

            // Flag the outlier with both σ distance and sample size so
            // the reader can judge signal strength.
            final minSigma = minDeviation / stddev;
            final maxSigma = maxDeviation / stddev;
            final outlierEnd = maxDeviation > minDeviation ? 'max' : 'min';
            final outlierValue = maxDeviation > minDeviation ? c.max : c.min;
            final outlierSigma = maxDeviation > minDeviation
                ? maxSigma
                : minSigma;

            anomalies.add(<String, dynamic>{
              'table': tableName,
              'column': c.colName,
              'type': 'potential_outlier',
              'severity': 'info',
              'message':
                  'Potential outlier in $tableName.${c.colName}: '
                  '$outlierEnd value $outlierValue is '
                  '${outlierSigma.toStringAsFixed(1)}σ from mean '
                  '${c.avg.toStringAsFixed(2)} '
                  '(range [${c.min}, ${c.max}], n=${c.sampleCount})',
            });
          }
        }
      }
    }

    // 4. Detect orphaned foreign key references. Narrow the host manifest
    //    to this table's joinable edges: fromTable matches AND
    //    orphanCheckable (list_ref / seed_identity edges are excluded).
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

    // 5. Detect duplicate rows (guarded: skips tables with a primary key,
    //    excludes BLOB columns, and respects the row-count limit).
    await _detectDuplicateRows(
      query: query,
      tableName: tableName,
      tableRowCount: tableRowCount,
      anomalies: anomalies,
      hasPrimaryKey: hasPrimaryKey,
      nonBlobColNames: nonBlobColNames,
    );
  }

  /// Returns true when [type] is a BLOB type. Used to exclude BLOB columns
  /// from the duplicate-row DISTINCT query — sorting multi-MB values through
  /// SQLite's temp store is what made the old query pathological.
  static bool _isBlobType(String type) => type.toUpperCase().contains('BLOB');

  /// Returns true when [colName] matches a domain-specific pattern that
  /// makes sigma-based outlier detection meaningless (identifiers,
  /// coordinates, timestamps, sort order, year, ratings, dimensions,
  /// physical measurements). Centralizes the skip-guard logic so it can
  /// be applied during column classification rather than inside a per-column
  /// query method.
  static bool _shouldSkipOutlierColumn(String colName) =>
      _identifierPattern.hasMatch(colName) ||
      _coordinatePattern.hasMatch(colName) ||
      _versionPattern.hasMatch(colName) ||
      _timestampPattern.hasMatch(colName) ||
      _sortOrderPattern.hasMatch(colName) ||
      _yearPattern.hasMatch(colName) ||
      _ratingPattern.hasMatch(colName) ||
      _dimensionPattern.hasMatch(colName) ||
      _physicalMeasurementPattern.hasMatch(colName);

  /// Column name patterns for identifier/key columns —
  /// external IDs (API identifiers, foreign system keys)
  /// are opaque identifiers, not measurements. Statistical
  /// outlier detection is meaningless because IDs are not
  /// drawn from a normal distribution and the local dataset
  /// is a sparse, non-random sample of the external ID space.
  /// See plans/history/2026.04/2026.04.13/outlier_on_external_id_false_positive.md.
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
  /// bugs/anomaly_false_positive_tight_timestamp_range.md. ref-exempt: deleted
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
  /// See plans/history/2026.04/2026.04.14/anomaly_false_positive_valid_range.md.
  static final _ratingPattern = RegExp(
    r'(^rating|rating$|^score|score$|^percent|percent$|^pct|pct$)',
    caseSensitive: false,
  );

  /// Column name patterns for dimensional / size columns —
  /// byte sizes, pixel dimensions, durations, counts, bandwidth,
  /// throughput, and latency that naturally span orders of magnitude
  /// (a 16 px thumbnail vs a 1200 px photo, a 195-byte icon vs a
  /// 148 KB source image, 2 ms vs 3 s API latency). Bimodal
  /// distributions are by design, not defects, and sigma-based
  /// detection produces false positives because the data is neither
  /// normal nor log-normal.
  /// See plans/history/2026.07/2026.07.20/BUG_outlier_false_positive_dimensions_and_physical_measurements.md.
  static final _dimensionPattern = RegExp(
    r'((?:^|_)(?:width|height|depth|area|volume|size|length|duration|bandwidth|throughput|latency)(?:$|_)|^pixel_|^num_|_count$)',
    caseSensitive: false,
  );

  /// Column name patterns for physical measurement columns —
  /// weight, mass, distance, speed, temperature, and capacity.
  /// These are bounded real-world quantities where populations
  /// are small and non-Gaussian; sigma-based detection is
  /// unreliable (e.g., Worf at 110 kg in a 149-row table
  /// triggers a 3.2σ flag that is pure artifact).
  /// See plans/history/2026.07/2026.07.20/BUG_outlier_false_positive_dimensions_and_physical_measurements.md.
  static final _physicalMeasurementPattern = RegExp(
    r'((?:^|_)(?:weight|mass|distance|speed|velocity|temperature|pressure|capacity)(?:$|_))',
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
  /// See plans/history/2026.04/2026.04.14/anomaly_false_positive_valid_range.md.
  static const _boundedScales = <(double, double)>[
    (0, 1), // probability, normalized score
    (0, 5), // star rating (e.g., Amazon, Yelp)
    (1, 5), // star rating (1-based)
    (0, 10), // rating scale (e.g., IMDb, TVMaze)
    (1, 10), // rating scale (1-based)
    (0, 100), // percentage, percentile
  ];

  /// Returns true when the all-positive column's extremes sit within 3σ of the
  /// geometric mean in LOG space — i.e. the wide spread is log-normal, not an
  /// outlier, and the linear-scale flag should be suppressed.
  ///
  /// [col] and [tbl] are already-quoted identifiers. The mean and variance of
  /// `LN(x)` are computed in SQL (the naive `E[Y²]-E[Y]²` form is numerically
  /// safe here because log values are small-magnitude, unlike the raw column).
  /// SQLite exposes `LN` only when built with math functions; on a build without
  /// them the query throws and this returns false (do not suppress — report the
  /// outlier rather than silently swallow it). See plans/history/2026.06/2026.06.12/full-codebase-audit-2026.06.12.md M2.
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
      // Variance formula E[Y²] - E[Y]²; the repeated logMean is the squared mean, not a typo.
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
      // A missing LN() means SQLite was built without math functions: an
      // expected capability gap, so the catch deliberately does not log.
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
  ///
  /// Guards (checked in order):
  /// 1. Tables with a primary key are skipped — PK uniqueness means
  ///    every row is distinct by construction, so the scan can never
  ///    produce a finding.
  /// 2. Tables exceeding [_maxRowsForDuplicateCheck] are skipped —
  ///    DISTINCT over all columns forces a sort/temp-B-tree that is
  ///    orders of magnitude more expensive than aggregate scans.
  /// 3. BLOB columns are excluded from the DISTINCT projection —
  ///    sorting multi-MB values through the temp store is what made
  ///    the old `SELECT DISTINCT *` pathological on tables with BLOB
  ///    data. If all columns are BLOBs, the check is skipped.
  ///
  /// Behavior change from the pre-fix scan: two rows that differ ONLY in a
  /// BLOB column's content (all non-BLOB columns identical) are now reported
  /// as duplicates, where the old unrestricted `SELECT DISTINCT *` would have
  /// correctly told them apart. This is judged an acceptable trade — BLOB
  /// content differing while every other column matches is a narrow case,
  /// and the false positive it can produce is far cheaper than the
  /// multi-minute full-table BLOB sort it replaces (see the bug's evidence:
  /// a 1 MB BLOB column over 10K rows pushed ~10 GB through the temp store).
  static Future<void> _detectDuplicateRows({
    required DriftDebugQuery query,
    required String tableName,
    required int tableRowCount,
    required List<Map<String, dynamic>> anomalies,
    required bool hasPrimaryKey,
    required List<String> nonBlobColNames,
  }) async {
    // Skip tables with a primary key — every row is distinct by construction
    // (SQLite enforces PK uniqueness), so DISTINCT can never find duplicates.
    if (hasPrimaryKey) return;

    // Skip oversized tables — DISTINCT forces a sort/temp-B-tree that is
    // prohibitively expensive at scale.
    if (tableRowCount > _maxRowsForDuplicateCheck) return;

    // Skip if all columns are BLOBs (nothing left to compare).
    if (nonBlobColNames.isEmpty) return;

    // Use explicit column list excluding BLOBs instead of SELECT DISTINCT *
    // to avoid sorting multi-MB BLOB values through the temp store.
    final colList = nonBlobColNames.map(ServerUtils.quoteIdent).join(', ');
    final distinctCount = ServerUtils.extractCountFromRows(
      ServerUtils.normalizeRows(
        await query(
          'SELECT COUNT(*) AS c FROM '
          '(SELECT DISTINCT $colList FROM ${ServerUtils.quoteIdent(tableName)})',
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

/// Intermediate data from the combined scan query's pass-1 aggregates for
/// one numeric column. Carries the stats needed by the variance pass-2 and
/// the final outlier decision without re-querying the table.
final class _OutlierCandidate {
  const _OutlierCandidate({
    required this.colName,
    required this.avg,
    required this.min,
    required this.max,
    required this.sampleCount,
  });

  final String colName;
  final double avg;
  final double min;
  final double max;
  final int sampleCount;
}
