// VM Service extension bridge for Plan 68.
// Registers ext.saropa.drift.* RPCs that delegate to the same logic as HTTP handlers
// so the VS Code extension can connect via the Dart VM Service when debugging.

import 'dart:convert';
import 'dart:developer' as developer;

import 'router.dart';
import 'server_constants.dart';

/// Prefix for all Drift VM service extension methods (isolate-scoped).
const String _kExtPrefix = 'ext.saropa.drift.';

/// Registers VM Service extension RPCs and delegates to [Router].
///
/// All state is static because `developer.registerExtension` callbacks are
/// bound once per isolate (Dart provides no unregister API). Call
/// [setRouter] + [register] on start, and [clear] on stop so handlers
/// return "not running" until the next cycle.
abstract final class VmServiceBridge {
  /// The active router. Static because `developer.registerExtension`
  /// callbacks are bound once per isolate — they must reach whichever
  /// router is current, even after stop/start cycles.
  static Router? _router;

  /// Sets the active router for all VM Service extension handlers.
  ///
  /// Must be called before [register] on each server start so the
  /// already-registered (or about-to-be-registered) callbacks delegate
  /// to the correct [Router] instance.
  static void setRouter(Router router) {
    _router = router;
  }

  /// Whether extensions have already been registered in this isolate.
  /// `developer.registerExtension` throws if called twice for the same
  /// method name, so we gate on this flag and just swap the router on
  /// subsequent server starts.
  static bool _registered = false;

  /// Registers all ext.saropa.drift.* methods, or updates the router
  /// reference if extensions were already registered in this isolate.
  static void register() {
    if (_registered) {
      // Extensions survive stop/start — only the router needs updating.
      return;
    }
    _registered = true;

    developer.registerExtension('${_kExtPrefix}getHealth', _handleGetHealth);
    developer.registerExtension(
      '${_kExtPrefix}getSchemaMetadata',
      _handleGetSchemaMetadata,
    );
    developer.registerExtension(
      '${_kExtPrefix}getTableFkMeta',
      _handleGetTableFkMeta,
    );
    developer.registerExtension('${_kExtPrefix}runSql', _handleRunSql);
    developer.registerExtension(
      '${_kExtPrefix}getGeneration',
      _handleGetGeneration,
    );
    developer.registerExtension(
      '${_kExtPrefix}getPerformance',
      _handleGetPerformance,
    );
    developer.registerExtension(
      '${_kExtPrefix}clearPerformance',
      _handleClearPerformance,
    );
    developer.registerExtension(
      '${_kExtPrefix}getAnomalies',
      _handleGetAnomalies,
    );
    developer.registerExtension('${_kExtPrefix}explainSql', _handleExplainSql);
    developer.registerExtension(
      '${_kExtPrefix}getIndexSuggestions',
      _handleGetIndexSuggestions,
    );
    developer.registerExtension('${_kExtPrefix}getIssues', _handleGetIssues);
    developer.registerExtension(
      '${_kExtPrefix}getChangeDetection',
      _handleGetChangeDetection,
    );
    developer.registerExtension(
      '${_kExtPrefix}setChangeDetection',
      _handleSetChangeDetection,
    );
    developer.registerExtension(
      '${_kExtPrefix}applyEditsBatch',
      _handleApplyEditsBatch,
    );
  }

  /// Clears the router reference so handlers return "not running" after
  /// server stop.
  static void clear() {
    _router = null;
  }

  static Future<developer.ServiceExtensionResponse> _handleGetHealth(
    String method,
    Map<String, String> params,
  ) {
    final router = _router;
    if (router == null) {
      return Future<developer.ServiceExtensionResponse>.value(
        developer.ServiceExtensionResponse.error(
          developer.ServiceExtensionResponse.extensionErrorMin,
          'Drift server not running',
        ),
      );
    }
    return Future<developer.ServiceExtensionResponse>.value(
      developer.ServiceExtensionResponse.result(
        jsonEncode(router.healthJsonForVmExtension()),
      ),
    );
  }

  static Future<developer.ServiceExtensionResponse> _handleGetSchemaMetadata(
    String method,
    Map<String, String> params,
  ) async {
    final router = _router;
    if (router == null) {
      return Future<developer.ServiceExtensionResponse>.value(
        developer.ServiceExtensionResponse.error(
          developer.ServiceExtensionResponse.extensionErrorMin,
          'Drift server not running',
        ),
      );
    }

    // When change detection is off, skip the heavy
    // per-table PRAGMA + COUNT queries that produce
    // log spam. Return an empty table list so the
    // extension gets a valid response without any
    // database I/O.
    if (!router.isChangeDetectionEnabled) {
      final body = <String, dynamic>{
        ServerConstants.jsonKeyTables: <Map<String, dynamic>>[],
        ServerConstants.jsonKeyChangeDetection: false,
      };

      return developer.ServiceExtensionResponse.result(jsonEncode(body));
    }

    try {
      final inc = params['includeForeignKeys']?.toLowerCase();
      final includeForeignKeys = inc == 'true' || inc == '1' || inc == 'yes';
      final tables = await router.getSchemaMetadataList(
        includeForeignKeys: includeForeignKeys,
      );
      final body = <String, dynamic>{ServerConstants.jsonKeyTables: tables};
      return developer.ServiceExtensionResponse.result(jsonEncode(body));
    } on Object catch (e) {
      return Future<developer.ServiceExtensionResponse>.value(
        developer.ServiceExtensionResponse.error(
          developer.ServiceExtensionResponse.extensionErrorMin,
          e.toString(),
        ),
      );
    }
  }

  static Future<developer.ServiceExtensionResponse> _handleGetTableFkMeta(
    String method,
    Map<String, String> params,
  ) async {
    final router = _router;
    if (router == null) {
      return developer.ServiceExtensionResponse.error(
        developer.ServiceExtensionResponse.extensionErrorMin,
        'Drift server not running',
      );
    }
    final tableName = params['tableName'];
    if (tableName == null || tableName.isEmpty) {
      return developer.ServiceExtensionResponse.error(
        developer.ServiceExtensionResponse.extensionErrorMin,
        'Missing tableName parameter',
      );
    }
    try {
      final fks = await router.getTableFkMetaList(tableName);
      return developer.ServiceExtensionResponse.result(jsonEncode(fks));
    } on Object catch (e) {
      return developer.ServiceExtensionResponse.error(
        developer.ServiceExtensionResponse.extensionErrorMin,
        e.toString(),
      );
    }
  }

  static Future<developer.ServiceExtensionResponse> _handleRunSql(
    String method,
    Map<String, String> params,
  ) async {
    final router = _router;
    if (router == null) {
      return developer.ServiceExtensionResponse.error(
        developer.ServiceExtensionResponse.extensionErrorMin,
        'Drift server not running',
      );
    }
    final sql = params['sql'];
    if (sql == null || sql.isEmpty) {
      return developer.ServiceExtensionResponse.error(
        developer.ServiceExtensionResponse.extensionErrorMin,
        ServerConstants.errorMissingSql,
      );
    }
    try {
      final result = await router.runSqlResult(sql);
      return developer.ServiceExtensionResponse.result(jsonEncode(result));
    } on Object catch (e) {
      return developer.ServiceExtensionResponse.error(
        developer.ServiceExtensionResponse.extensionErrorMin,
        e.toString(),
      );
    }
  }

  /// Handles ext.saropa.drift.applyEditsBatch — params { statements: JSON array }.
  static Future<developer.ServiceExtensionResponse> _handleApplyEditsBatch(
    String method,
    Map<String, String> params,
  ) async {
    final router = _router;
    if (router == null) {
      return developer.ServiceExtensionResponse.error(
        developer.ServiceExtensionResponse.extensionErrorMin,
        'Drift server not running',
      );
    }
    final encoded = params['statements'];
    if (encoded == null || encoded.isEmpty) {
      return developer.ServiceExtensionResponse.error(
        developer.ServiceExtensionResponse.extensionErrorMin,
        'Missing statements parameter (JSON array of strings)',
      );
    }
    late List<String> statements;
    try {
      final decoded = jsonDecode(encoded);
      if (decoded is! List<dynamic>) {
        return developer.ServiceExtensionResponse.error(
          developer.ServiceExtensionResponse.extensionErrorMin,
          'statements must be a JSON array',
        );
      }
      statements = <String>[];
      for (final item in decoded) {
        if (item is! String) {
          return developer.ServiceExtensionResponse.error(
            developer.ServiceExtensionResponse.extensionErrorMin,
            'Each statement must be a JSON string',
          );
        }
        if (item.trim().isEmpty) {
          return developer.ServiceExtensionResponse.error(
            developer.ServiceExtensionResponse.extensionErrorMin,
            'Statements must be non-empty strings',
          );
        }
        statements.add(item);
      }
      if (statements.isEmpty) {
        return developer.ServiceExtensionResponse.error(
          developer.ServiceExtensionResponse.extensionErrorMin,
          'statements must be non-empty',
        );
      }
    } on Object catch (e) {
      return developer.ServiceExtensionResponse.error(
        developer.ServiceExtensionResponse.extensionErrorMin,
        'Invalid statements JSON: $e',
      );
    }

    try {
      await router.applyEditsBatchStatements(statements);
      return developer.ServiceExtensionResponse.result(
        jsonEncode(<String, dynamic>{
          ServerConstants.jsonKeyOk: true,
          ServerConstants.jsonKeyCount: statements.length,
        }),
      );
    } on Object catch (e) {
      return developer.ServiceExtensionResponse.error(
        developer.ServiceExtensionResponse.extensionErrorMin,
        e.toString(),
      );
    }
  }

  static Future<developer.ServiceExtensionResponse> _handleGetGeneration(
    String method,
    Map<String, String> params,
  ) async {
    final router = _router;
    if (router == null) {
      return developer.ServiceExtensionResponse.error(
        developer.ServiceExtensionResponse.extensionErrorMin,
        'Drift server not running',
      );
    }

    // When change detection is off, return the frozen
    // generation value without querying the database.
    // checkDataChange() already gates itself, but this
    // avoids the handler overhead entirely.
    if (!router.isChangeDetectionEnabled) {
      final body = <String, dynamic>{
        ServerConstants.jsonKeyGeneration: router.currentGeneration,
        ServerConstants.jsonKeyChangeDetection: false,
      };

      return developer.ServiceExtensionResponse.result(jsonEncode(body));
    }

    try {
      final gen = await router.getGeneration();
      final body = <String, dynamic>{ServerConstants.jsonKeyGeneration: gen};
      return developer.ServiceExtensionResponse.result(jsonEncode(body));
    } on Object catch (e) {
      return developer.ServiceExtensionResponse.error(
        developer.ServiceExtensionResponse.extensionErrorMin,
        e.toString(),
      );
    }
  }

  static Future<developer.ServiceExtensionResponse> _handleGetPerformance(
    String method,
    Map<String, String> params,
  ) async {
    final router = _router;
    if (router == null) {
      return developer.ServiceExtensionResponse.error(
        developer.ServiceExtensionResponse.extensionErrorMin,
        'Drift server not running',
      );
    }
    try {
      final data = await router.getPerformanceData();
      return developer.ServiceExtensionResponse.result(jsonEncode(data));
    } on Object catch (e) {
      return developer.ServiceExtensionResponse.error(
        developer.ServiceExtensionResponse.extensionErrorMin,
        e.toString(),
      );
    }
  }

  static Future<developer.ServiceExtensionResponse> _handleClearPerformance(
    String method,
    Map<String, String> params,
  ) {
    final router = _router;
    if (router == null) {
      return Future<developer.ServiceExtensionResponse>.value(
        developer.ServiceExtensionResponse.error(
          developer.ServiceExtensionResponse.extensionErrorMin,
          'Drift server not running',
        ),
      );
    }
    try {
      router.clearPerformance();
      return Future<developer.ServiceExtensionResponse>.value(
        developer.ServiceExtensionResponse.result(
          jsonEncode(<String, String>{'status': 'cleared'}),
        ),
      );
    } on Object catch (e) {
      return Future<developer.ServiceExtensionResponse>.value(
        developer.ServiceExtensionResponse.error(
          developer.ServiceExtensionResponse.extensionErrorMin,
          e.toString(),
        ),
      );
    }
  }

  static Future<developer.ServiceExtensionResponse> _handleGetAnomalies(
    String method,
    Map<String, String> params,
  ) async {
    final router = _router;
    if (router == null) {
      return developer.ServiceExtensionResponse.error(
        developer.ServiceExtensionResponse.extensionErrorMin,
        'Drift server not running',
      );
    }
    try {
      final data = await router.getAnomaliesResult();
      return developer.ServiceExtensionResponse.result(jsonEncode(data));
    } on Object catch (e) {
      return developer.ServiceExtensionResponse.error(
        developer.ServiceExtensionResponse.extensionErrorMin,
        e.toString(),
      );
    }
  }

  static Future<developer.ServiceExtensionResponse> _handleExplainSql(
    String method,
    Map<String, String> params,
  ) async {
    final router = _router;
    if (router == null) {
      return developer.ServiceExtensionResponse.error(
        developer.ServiceExtensionResponse.extensionErrorMin,
        'Drift server not running',
      );
    }
    final sql = params['sql'];
    if (sql == null || sql.isEmpty) {
      return developer.ServiceExtensionResponse.error(
        developer.ServiceExtensionResponse.extensionErrorMin,
        ServerConstants.errorMissingSql,
      );
    }
    try {
      final result = await router.explainSqlResult(sql);
      return developer.ServiceExtensionResponse.result(jsonEncode(result));
    } on Object catch (e) {
      return developer.ServiceExtensionResponse.error(
        developer.ServiceExtensionResponse.extensionErrorMin,
        e.toString(),
      );
    }
  }

  static Future<developer.ServiceExtensionResponse> _handleGetIndexSuggestions(
    String method,
    Map<String, String> params,
  ) async {
    final router = _router;
    if (router == null) {
      return developer.ServiceExtensionResponse.error(
        developer.ServiceExtensionResponse.extensionErrorMin,
        'Drift server not running',
      );
    }
    try {
      final list = await router.getIndexSuggestionsList();
      return developer.ServiceExtensionResponse.result(jsonEncode(list));
    } on Object catch (e) {
      return developer.ServiceExtensionResponse.error(
        developer.ServiceExtensionResponse.extensionErrorMin,
        e.toString(),
      );
    }
  }

  /// Handles ext.saropa.drift.getIssues.
  /// Returns the same merged issues list as GET /api/issues.
  /// Optional param "sources": comma-separated "index-suggestions", "anomalies".
  static Future<developer.ServiceExtensionResponse> _handleGetIssues(
    String method,
    Map<String, String> params,
  ) async {
    final router = _router;
    if (router == null) {
      return developer.ServiceExtensionResponse.error(
        developer.ServiceExtensionResponse.extensionErrorMin,
        'Drift server not running',
      );
    }
    try {
      final sources = params['sources'];
      final result = await router.getIssuesResult(sources: sources);
      if (result.containsKey(ServerConstants.jsonKeyError)) {
        final rawError = result[ServerConstants.jsonKeyError];
        return developer.ServiceExtensionResponse.error(
          developer.ServiceExtensionResponse.extensionErrorMin,
          rawError?.toString() ?? 'Unknown error',
        );
      }
      return developer.ServiceExtensionResponse.result(jsonEncode(result));
    } on Object catch (e) {
      return developer.ServiceExtensionResponse.error(
        developer.ServiceExtensionResponse.extensionErrorMin,
        e.toString(),
      );
    }
  }

  /// Handles ext.saropa.drift.getChangeDetection.
  /// Returns {"changeDetection": true|false}.
  static Future<developer.ServiceExtensionResponse> _handleGetChangeDetection(
    String method,
    Map<String, String> params,
  ) {
    final router = _router;
    if (router == null) {
      return Future<developer.ServiceExtensionResponse>.value(
        developer.ServiceExtensionResponse.error(
          developer.ServiceExtensionResponse.extensionErrorMin,
          'Drift server not running',
        ),
      );
    }
    return Future<developer.ServiceExtensionResponse>.value(
      developer.ServiceExtensionResponse.result(
        jsonEncode(<String, dynamic>{
          ServerConstants.jsonKeyChangeDetection:
              router.isChangeDetectionEnabled,
        }),
      ),
    );
  }

  /// Handles ext.saropa.drift.setChangeDetection.
  /// Expects param "enabled" = "true" or "false".
  /// Returns {"changeDetection": true|false}.
  static Future<developer.ServiceExtensionResponse> _handleSetChangeDetection(
    String method,
    Map<String, String> params,
  ) {
    final router = _router;
    if (router == null) {
      return Future<developer.ServiceExtensionResponse>.value(
        developer.ServiceExtensionResponse.error(
          developer.ServiceExtensionResponse.extensionErrorMin,
          'Drift server not running',
        ),
      );
    }

    // VM service params are always strings; parse
    // "true"/"false" to bool.
    final enabledStr = params[ServerConstants.jsonKeyEnabled];

    if (enabledStr == null || (enabledStr != 'true' && enabledStr != 'false')) {
      return Future<developer.ServiceExtensionResponse>.value(
        developer.ServiceExtensionResponse.error(
          developer.ServiceExtensionResponse.extensionErrorMin,
          'Missing or invalid "${ServerConstants.jsonKeyEnabled}" '
          'parameter (expected "true" or "false")',
        ),
      );
    }

    final enabled = enabledStr == 'true';
    router.setChangeDetectionEnabled(enabled);

    return Future<developer.ServiceExtensionResponse>.value(
      developer.ServiceExtensionResponse.result(
        jsonEncode(<String, dynamic>{
          ServerConstants.jsonKeyChangeDetection: enabled,
        }),
      ),
    );
  }
}
