// Shared test utilities for Saropa Drift Advisor tests.
//
// Provides reusable mock query callbacks, HTTP helper methods,
// and factory functions to reduce duplication across test files.

import 'dart:convert';
import 'dart:io';

import 'package:saropa_drift_advisor/src/server/server_context.dart';

/// Creates a minimal [ServerContext] for handler unit tests.
///
/// The [query] callback defaults to returning empty results.
/// Optional overrides for auth, CORS, write, compare, etc.
ServerContext createTestContext({
  DriftDebugQuery? query,
  String? corsOrigin,
  DriftDebugOnLog? onLog,
  DriftDebugOnError? onError,
  List<int>? authTokenHash,
  String? basicAuthUser,
  String? basicAuthPassword,
  DriftDebugQuery? queryCompare,
  DriftDebugWriteQuery? writeQuery,
  DriftDebugGetDatabaseBytes? getDatabaseBytes,
}) {
  return ServerContext(
    query: query ?? (_) async => <Map<String, dynamic>>[],
    corsOrigin: corsOrigin,
    onLog: onLog,
    onError: onError,
    authTokenHash: authTokenHash,
    basicAuthUser: basicAuthUser,
    basicAuthPassword: basicAuthPassword,
    queryCompare: queryCompare,
    writeQuery: writeQuery,
    getDatabaseBytes: getDatabaseBytes,
  );
}

/// Creates a mock query function that returns canned data
/// based on pattern matching against the SQL string.
///
/// Supports schema queries, table names, PRAGMA table_info,
/// PRAGMA foreign_key_list, COUNT(*), and table data.
Future<List<Map<String, dynamic>>> Function(String sql) mockQueryWithTables({
  /// Map of table name -> list of column definitions.
  /// Each column is {name, type, pk} matching PRAGMA table_info output.
  required Map<String, List<Map<String, dynamic>>> tableColumns,

  /// Map of table name -> row data for SELECT * queries.
  Map<String, List<Map<String, dynamic>>>? tableData,

  /// Map of table name -> list of FK definitions.
  /// Each FK is {id, seq, table, from, to} matching PRAGMA foreign_key_list.
  Map<String, List<Map<String, dynamic>>>? tableForeignKeys,

  /// Map of table name -> row count (for COUNT(*) queries).
  Map<String, int>? tableCounts,

  /// Optional list of indexes for PRAGMA index_list queries.
  /// Each index is {name, unique, origin, partial}.
  Map<String, List<Map<String, dynamic>>>? tableIndexes,

  /// Maps index name → list of column names covered by that index.
  /// Used for PRAGMA index_info queries (e.g. IndexAnalyzer tests).
  Map<String, List<String>>? indexInfoColumns,
}) {
  // Build schema SQL entries from table columns.
  final schemaEntries = <Map<String, dynamic>>[];
  for (final entry in tableColumns.entries) {
    final cols = entry.value
        .map((c) => '${c['name']} ${c['type'] ?? 'TEXT'}')
        .join(', ');
    schemaEntries.add(<String, dynamic>{
      'type': 'table',
      'name': entry.key,
      'sql': 'CREATE TABLE ${entry.key} ($cols)',
    });
  }

  return (String sql) async {
    // Schema master query (full schema with CREATE statements).
    if (sql.contains('ORDER BY type, name') && sql.contains('sqlite_master')) {
      return schemaEntries;
    }

    // Table names query (just names).
    if (sql.contains("type='table'") && sql.contains('ORDER BY name')) {
      return tableColumns.keys
          .map((name) => <String, dynamic>{'name': name})
          .toList();
    }

    // Single-table schema lookup (used by migration preview to get
    // CREATE TABLE statements for individual tables).
    if (sql.contains('sqlite_master') &&
        sql.contains("type='table'") &&
        sql.contains("name='")) {
      for (final entry in schemaEntries) {
        final tableName = entry['name'] as String;
        if (sql.contains("name='$tableName'")) {
          return [entry];
        }
      }
      return <Map<String, dynamic>>[];
    }

    // Single-index schema lookup (used by migration preview to get
    // CREATE INDEX statements for individual indexes).
    if (sql.contains('sqlite_master') &&
        sql.contains("type='index'") &&
        sql.contains("name='")) {
      // No index SQL in the mock — return empty. Tests that need
      // this can provide a custom query callback.
      return <Map<String, dynamic>>[];
    }

    // PRAGMA table_info for specific table.
    if (sql.contains('PRAGMA table_info')) {
      final match = RegExp(r'PRAGMA table_info\("?(\w+)"?\)').firstMatch(sql);
      if (match != null) {
        final tableName = match.group(1)!;
        final cols = tableColumns[tableName];
        if (cols != null) {
          return cols
              .asMap()
              .entries
              .map((e) => <String, dynamic>{
                    'cid': e.key,
                    'name': e.value['name'],
                    'type': e.value['type'] ?? 'TEXT',
                    'notnull': e.value['notnull'] ?? 0,
                    'dflt_value': e.value['dflt_value'],
                    'pk': e.value['pk'] ?? 0,
                  })
              .toList();
        }
      }
      return <Map<String, dynamic>>[];
    }

    // PRAGMA foreign_key_list for specific table.
    if (sql.contains('PRAGMA foreign_key_list')) {
      if (tableForeignKeys != null) {
        final match =
            RegExp(r'PRAGMA foreign_key_list\("?(\w+)"?\)').firstMatch(sql);
        if (match != null) {
          final tableName = match.group(1)!;
          return tableForeignKeys[tableName] ?? <Map<String, dynamic>>[];
        }
      }
      return <Map<String, dynamic>>[];
    }

    // PRAGMA index_list for specific table.
    if (sql.contains('PRAGMA index_list')) {
      if (tableIndexes != null) {
        final match = RegExp(r'PRAGMA index_list\("?(\w+)"?\)').firstMatch(sql);
        if (match != null) {
          final tableName = match.group(1)!;
          return tableIndexes[tableName] ?? <Map<String, dynamic>>[];
        }
      }
      return <Map<String, dynamic>>[];
    }

    // PRAGMA index_info for specific index — returns columns
    // covered by the named index.
    if (sql.contains('PRAGMA index_info')) {
      if (indexInfoColumns != null) {
        final match = RegExp(r'PRAGMA index_info\("([^"]+)"\)').firstMatch(sql);
        if (match != null) {
          final idxName = match.group(1)!;
          final cols = indexInfoColumns[idxName] ?? [];
          return cols
              .asMap()
              .entries
              .map((e) => <String, dynamic>{
                    'seqno': e.key,
                    'cid': e.key,
                    'name': e.value,
                  })
              .toList();
        }
      }
      return <Map<String, dynamic>>[];
    }

    // COUNT(*) queries.
    if (sql.contains('COUNT(*)')) {
      if (tableCounts != null) {
        for (final entry in tableCounts.entries) {
          if (sql.contains('"${entry.key}"')) {
            return [
              <String, dynamic>{'c': entry.value}
            ];
          }
        }
      }
      return [
        <String, dynamic>{'c': 0}
      ];
    }

    // SELECT * from table with LIMIT/OFFSET.
    if (sql.startsWith('SELECT * FROM') && tableData != null) {
      for (final entry in tableData.entries) {
        if (sql.contains('"${entry.key}"')) {
          return entry.value;
        }
      }
    }

    // EXPLAIN QUERY PLAN.
    if (sql.startsWith('EXPLAIN QUERY PLAN')) {
      return [
        <String, dynamic>{
          'id': 0,
          'parent': 0,
          'notused': 0,
          'detail': 'SCAN TABLE items',
        }
      ];
    }

    // Default: empty result.
    return <Map<String, dynamic>>[];
  };
}

/// Makes an HTTP GET request and returns the parsed JSON body.
///
/// Returns a record with status code and decoded body.
Future<({int status, dynamic body})> httpGet(
  int port,
  String path, {
  Map<String, String>? headers,
}) async {
  final client = HttpClient();
  try {
    final req = await client.get('localhost', port, path);
    if (headers != null) {
      for (final entry in headers.entries) {
        req.headers.set(entry.key, entry.value);
      }
    }
    final resp = await req.close();
    final bodyStr = await resp.transform(utf8.decoder).join();
    dynamic decoded;
    try {
      decoded = jsonDecode(bodyStr);
    } on FormatException {
      // Non-JSON response (e.g. HTML, plain text).
      decoded = bodyStr;
    }
    return (status: resp.statusCode, body: decoded);
  } finally {
    client.close();
  }
}

/// Makes an HTTP POST request with a JSON body and returns parsed response.
Future<({int status, dynamic body})> httpPost(
  int port,
  String path, {
  Map<String, dynamic>? json,
  String? rawBody,
  ContentType? contentType,
  Map<String, String>? headers,
}) async {
  final client = HttpClient();
  try {
    final req = await client.post('localhost', port, path);
    req.headers.contentType = contentType ?? ContentType.json;
    if (headers != null) {
      for (final entry in headers.entries) {
        req.headers.set(entry.key, entry.value);
      }
    }
    if (json != null) {
      req.write(jsonEncode(json));
    } else if (rawBody != null) {
      req.write(rawBody);
    }
    final resp = await req.close();
    final bodyStr = await resp.transform(utf8.decoder).join();
    dynamic decoded;
    try {
      decoded = jsonDecode(bodyStr);
    } on FormatException {
      decoded = bodyStr;
    }
    return (status: resp.statusCode, body: decoded);
  } finally {
    client.close();
  }
}

/// Makes an HTTP DELETE request and returns parsed response.
Future<({int status, dynamic body})> httpDelete(
  int port,
  String path, {
  Map<String, String>? headers,
}) async {
  final client = HttpClient();
  try {
    final req = await client.delete('localhost', port, path);
    if (headers != null) {
      for (final entry in headers.entries) {
        req.headers.set(entry.key, entry.value);
      }
    }
    final resp = await req.close();
    final bodyStr = await resp.transform(utf8.decoder).join();
    dynamic decoded;
    try {
      decoded = jsonDecode(bodyStr);
    } on FormatException {
      decoded = bodyStr;
    }
    return (status: resp.statusCode, body: decoded);
  } finally {
    client.close();
  }
}
