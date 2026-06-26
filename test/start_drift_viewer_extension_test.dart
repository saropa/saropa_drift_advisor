import 'dart:convert';
import 'dart:io';

import 'package:saropa_drift_advisor/saropa_drift_advisor.dart';
import 'package:test/test.dart';

class _FakeRow {
  _FakeRow(this.data);
  final Map<String, Object?> data;
}

class _FakeSelectable {
  _FakeSelectable(this._rows);
  final List<_FakeRow> _rows;

  Future<List<_FakeRow>> get() async => _rows;
}

class _FakeDriftDb {
  dynamic customSelect(String sql) {
    // /api/tables uses sqlite_master for table listing.
    if (sql.contains('sqlite_master') &&
        sql.contains("type IN ('table','view')")) {
      return _FakeSelectable([
        _FakeRow({'name': 'items'}),
      ]);
    }
    return _FakeSelectable(const <_FakeRow>[]);
  }
}

void main() {
  tearDown(() async {
    await DriftDebugServer.stop();
  });

  test('startDriftViewer wires customSelect into /api/tables', () async {
    final db = _FakeDriftDb();

    await db.startDriftViewer(enabled: true, port: 0);

    final port = DriftDebugServer.port;
    expect(port, isNotNull);

    final client = HttpClient();
    try {
      final req = await client.get('localhost', port!, '/api/tables');
      final resp = await req.close();
      expect(resp.statusCode, HttpStatus.ok);

      final body = await resp.transform(utf8.decoder).join();
      final decoded = jsonDecode(body) as Map<String, dynamic>;
      // Response shape: {"tables": [...], "counts": {...}}
      expect(decoded['tables'], isA<List<dynamic>>());
      expect(decoded['tables'] as List<dynamic>, contains('items'));
      expect(decoded['counts'], isA<Map<String, dynamic>>());
    } finally {
      client.close();
    }
  });

  test(
    'startDriftViewer when customSelect().get() returns non-List returns 500 for /api/tables',
    () async {
      final db = _FakeDriftDbNonList();
      await db.startDriftViewer(enabled: true, port: 0);
      final port = DriftDebugServer.port;
      expect(port, isNotNull);

      final client = HttpClient();
      try {
        final req = await client.get('localhost', port!, '/api/tables');
        final resp = await req.close();
        expect(resp.statusCode, HttpStatus.internalServerError);
        final body = await resp.transform(utf8.decoder).join();
        final decoded = jsonDecode(body) as Map<String, dynamic>;
        expect(decoded['error'], isNotNull);
        // Regression: error message should guide users to DriftDebugServer.start (e.g. drift_sqlite_async).
        expect(decoded['error'].toString(), contains('DriftDebugServer.start'));
      } finally {
        client.close();
      }
    },
  );

  test(
    'startDriftViewer when row.data is not Map returns 500 for /api/tables',
    () async {
      final db = _FakeDriftDbBadRowData();
      await db.startDriftViewer(enabled: true, port: 0);
      final port = DriftDebugServer.port;
      expect(port, isNotNull);

      final client = HttpClient();
      try {
        final req = await client.get('localhost', port!, '/api/tables');
        final resp = await req.close();
        expect(resp.statusCode, HttpStatus.internalServerError);
        final body = await resp.transform(utf8.decoder).join();
        final decoded = jsonDecode(body) as Map<String, dynamic>;
        expect(decoded['error'], isNotNull);
        // Regression: error message should guide users to DriftDebugServer.start (e.g. drift_sqlite_async).
        expect(decoded['error'].toString(), contains('DriftDebugServer.start'));
      } finally {
        client.close();
      }
    },
  );

  // Regression: a DateTime column must derive its declared sqlType from the
  // database's actual storage option. Drift's default is INTEGER (unix-epoch);
  // hard-mapping it to TEXT made every DateTime column read as a false
  // `code TEXT vs database INTEGER` divergence.
  test(
    'derived declared schema maps default DateTime storage to INTEGER',
    () async {
      final db = _FakeDriftSchemaDb(storeDateTimeAsText: false);
      await db.startDriftViewer(enabled: true, port: 0);
      final port = DriftDebugServer.port;

      final createdAt = await _declaredColumn(port!, 'things', 'createdAt');
      expect(createdAt['sqlType'], 'INTEGER');
      expect(createdAt['driftType'], 'dateTime');
    },
  );

  test(
    'derived declared schema maps DateTime to TEXT when storeDateTimeAsText is set',
    () async {
      final db = _FakeDriftSchemaDb(storeDateTimeAsText: true);
      await db.startDriftViewer(enabled: true, port: 0);
      final port = DriftDebugServer.port;

      final createdAt = await _declaredColumn(port!, 'things', 'createdAt');
      expect(createdAt['sqlType'], 'TEXT');
      expect(createdAt['driftType'], 'dateTime');
    },
  );
}

/// Fetches a single column map from GET /api/schema/declared for [table]/[column].
Future<Map<String, dynamic>> _declaredColumn(
  int port,
  String table,
  String column,
) async {
  final client = HttpClient();
  try {
    final req = await client.get('localhost', port, '/api/schema/declared');
    final resp = await req.close();
    expect(resp.statusCode, HttpStatus.ok);
    final body = await resp.transform(utf8.decoder).join();
    final decoded = jsonDecode(body) as Map<String, dynamic>;
    final tables = decoded['tables'] as List<dynamic>;
    final t =
        tables.firstWhere((dynamic e) => (e as Map)['name'] == table) as Map;
    final cols = t['columns'] as List<dynamic>;
    return (cols.firstWhere((dynamic c) => (c as Map)['name'] == column) as Map)
        .cast<String, dynamic>();
  } finally {
    client.close();
  }
}

/// Duck-typed Drift column whose `type.toString()` mimics a `DriftSqlType` enum
/// value (e.g. `DriftSqlType.dateTime`), which is what `_declaredSqlType` parses.
class _FakeColType {
  _FakeColType(this._s);
  final String _s;
  @override
  String toString() => _s;
}

/// Duck-typed Drift `GeneratedColumn`: exposes `name`, `type`, `$nullable`.
class _FakeColumn {
  _FakeColumn(this.name, this.type, {this.nullable = true});
  final String name;
  final _FakeColType type;
  final bool nullable;
  // The producer reads `c.$nullable` (Drift's getter name).
  // ignore: non_constant_identifier_names
  bool get $nullable => nullable;
}

/// Duck-typed Drift `TableInfo`: exposes `actualTableName`, `$columns`,
/// `$primaryKey`.
class _FakeTable {
  _FakeTable(this.actualTableName, this._columns, this._pk);
  final String actualTableName;
  final List<_FakeColumn> _columns;
  final List<_FakeColumn> _pk;
  // ignore: non_constant_identifier_names
  List<_FakeColumn> get $columns => _columns;
  // ignore: non_constant_identifier_names
  List<_FakeColumn> get $primaryKey => _pk;
}

/// Duck-typed Drift `DriftDatabaseOptions` carrying the DateTime-storage flag.
class _FakeOptions {
  _FakeOptions(this.storeDateTimeAsText);
  final bool storeDateTimeAsText;
}

/// Duck-typed Drift `GeneratedDatabase` with one table (an autoincrement INTEGER
/// PK `id` and a `createdAt` DateTime) and a configurable storeDateTimeAsText.
class _FakeDriftSchemaDb {
  _FakeDriftSchemaDb({required this.storeDateTimeAsText});
  final bool storeDateTimeAsText;

  _FakeOptions get options => _FakeOptions(storeDateTimeAsText);

  List<_FakeTable> get allTables {
    final id = _FakeColumn(
      'id',
      _FakeColType('DriftSqlType.int'),
      nullable: false,
    );
    final createdAt = _FakeColumn(
      'createdAt',
      _FakeColType('DriftSqlType.dateTime'),
    );
    return [
      _FakeTable('things', [id, createdAt], [id]),
    ];
  }

  dynamic customSelect(String sql) => _FakeSelectable(const <_FakeRow>[]);
}

class _FakeDriftDbNonList {
  dynamic customSelect(String sql) {
    if (sql.contains('sqlite_master') &&
        sql.contains("type IN ('table','view')")) {
      return _FakeSelectableNonList();
    }
    return _FakeSelectable(const <_FakeRow>[]);
  }
}

class _FakeSelectableNonList {
  Future<dynamic> get() async => 42;
}

class _FakeDriftDbBadRowData {
  dynamic customSelect(String sql) {
    if (sql.contains('sqlite_master') &&
        sql.contains("type IN ('table','view')")) {
      return _FakeSelectableBadRows();
    }
    return _FakeSelectable(const <_FakeRow>[]);
  }
}

class _FakeSelectableBadRows {
  Future<List<_FakeRowBadData>> get() async => [_FakeRowBadData(123)];
}

class _FakeRowBadData {
  _FakeRowBadData(this.data);
  final dynamic data;
}
