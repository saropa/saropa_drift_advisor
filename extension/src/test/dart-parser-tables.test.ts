/**
 * Tests for table-level Dart parsing: parseDartTables (including comment
 * filtering), parseDriftIndexCalls, and parseDriftUniqueKeySets.
 *
 * Low-level utility tests (extractClassBody, parseColumn, isInsideComment)
 * live in the sibling file dart-parser.test.ts.
 * isDriftProject tests live in dart-file-parser.test.ts (different module).
 */
import * as assert from 'assert';
import {
  parseDartTables,
  parseDriftIndexCalls,
  parseDriftUniqueKeySets,
} from '../schema-diff/dart-parser';

describe('parseDartTables', () => {
  it('should find a simple table class', () => {
    const source = `
class Users extends Table {
  IntColumn get id => integer().autoIncrement()();
  TextColumn get name => text()();
}
`;
    const tables = parseDartTables(source, 'file:///test.dart');
    assert.strictEqual(tables.length, 1);
    assert.strictEqual(tables[0].dartClassName, 'Users');
    assert.strictEqual(tables[0].sqlTableName, 'users');
    assert.strictEqual(tables[0].columns.length, 2);
    assert.strictEqual(tables[0].fileUri, 'file:///test.dart');
  });

  it('should extract multiple tables from one file', () => {
    const source = `
class Users extends Table {
  IntColumn get id => integer()();
}
class Posts extends Table {
  IntColumn get id => integer()();
}
`;
    const tables = parseDartTables(source, 'file:///test.dart');
    assert.strictEqual(tables.length, 2);
    assert.strictEqual(tables[0].dartClassName, 'Users');
    assert.strictEqual(tables[1].dartClassName, 'Posts');
  });

  it('should detect tableName getter override', () => {
    const source = `
class UserAccounts extends Table {
  IntColumn get id => integer()();

  @override
  String get tableName => 'app_users';
}
`;
    const tables = parseDartTables(source, 'file:///test.dart');
    assert.strictEqual(tables.length, 1);
    assert.strictEqual(tables[0].sqlTableName, 'app_users');
  });

  it('should use default snake_case when no override', () => {
    const source = `
class UserSettings extends Table {
  IntColumn get id => integer()();
}
`;
    const tables = parseDartTables(source, 'file:///test.dart');
    assert.strictEqual(tables[0].sqlTableName, 'user_settings');
  });

  it('should handle table with no columns', () => {
    const source = `
class EmptyTable extends Table {
  // No columns yet
}
`;
    const tables = parseDartTables(source, 'file:///test.dart');
    assert.strictEqual(tables.length, 1);
    assert.strictEqual(tables[0].columns.length, 0);
  });

  it('should skip non-Table classes', () => {
    const source = `
class MyWidget extends StatelessWidget {
  IntColumn get id => integer()();
}
class Users extends Table {
  IntColumn get id => integer()();
}
`;
    const tables = parseDartTables(source, 'file:///test.dart');
    assert.strictEqual(tables.length, 1);
    assert.strictEqual(tables[0].dartClassName, 'Users');
  });

  it('should compute correct line numbers', () => {
    const source = `// line 0
// line 1
class Users extends Table {
  IntColumn get id => integer()();
  TextColumn get name => text()();
}
`;
    const tables = parseDartTables(source, 'file:///test.dart');
    assert.strictEqual(tables[0].line, 2);
    assert.strictEqual(tables[0].columns[0].line, 3);
    assert.strictEqual(tables[0].columns[1].line, 4);
  });

  it('should handle .withDefault in builder chain', () => {
    const source = `
class Users extends Table {
  IntColumn get age => integer().withDefault(const Constant(0))();
}
`;
    const tables = parseDartTables(source, 'file:///test.dart');
    assert.strictEqual(tables[0].columns.length, 1);
    assert.strictEqual(tables[0].columns[0].sqlType, 'INTEGER');
  });

  it('should handle .nullable() with other modifiers', () => {
    const source = `
class Users extends Table {
  TextColumn get bio => text().nullable().withLength(max: 500)();
}
`;
    const tables = parseDartTables(source, 'file:///test.dart');
    assert.strictEqual(tables[0].columns[0].nullable, true);
    assert.strictEqual(tables[0].columns[0].sqlType, 'TEXT');
  });

  it('should handle double-quoted tableName override', () => {
    const source = `
class Accounts extends Table {
  IntColumn get id => integer()();

  @override
  String get tableName => "custom_accounts";
}
`;
    const tables = parseDartTables(source, 'file:///test.dart');
    assert.strictEqual(tables[0].sqlTableName, 'custom_accounts');
  });

  it('should return consistent results on repeated calls', () => {
    const source = `
class Users extends Table {
  IntColumn get id => integer()();
}
`;
    const first = parseDartTables(source, 'file:///a.dart');
    const second = parseDartTables(source, 'file:///b.dart');
    assert.strictEqual(first.length, 1);
    assert.strictEqual(second.length, 1);
    assert.strictEqual(second[0].fileUri, 'file:///b.dart');
  });

  it('should parse uniqueKeys and Index/UniqueIndex', () => {
    const source = `
class Users extends Table {
  IntColumn get id => integer().autoIncrement()();
  TextColumn get email => text()();
  TextColumn get name => text()();

  @override
  List<Set<Column>> get uniqueKeys => [
    {email},
    {name, email},
  ];

  @override
  List<Index> get indexes => [
    Index('users_name_idx', columns: [name]),
    UniqueIndex('users_email_uidx', columns: [email]),
  ];
}
`;
    const tables = parseDartTables(source, 'file:///test.dart');
    assert.strictEqual(tables.length, 1);
    assert.strictEqual(tables[0].uniqueKeys.length, 2);
    assert.deepStrictEqual(tables[0].uniqueKeys[0], ['email']);
    assert.deepStrictEqual(tables[0].uniqueKeys[1], ['name', 'email']);
    assert.strictEqual(tables[0].indexes.length, 2);
    assert.strictEqual(tables[0].indexes[0].name, 'users_name_idx');
    assert.deepStrictEqual(tables[0].indexes[0].columns, ['name']);
    assert.strictEqual(tables[0].indexes[0].unique, false);
    assert.strictEqual(tables[0].indexes[1].unique, true);
  });

  it('should default indexes and uniqueKeys to empty', () => {
    const source = `
class Users extends Table {
  IntColumn get id => integer()();
}
`;
    const tables = parseDartTables(source, 'file:///test.dart');
    assert.deepStrictEqual(tables[0].indexes, []);
    assert.deepStrictEqual(tables[0].uniqueKeys, []);
  });
});

describe('parseDriftIndexCalls / parseDriftUniqueKeySets', () => {
  it('should parse index list inner', () => {
    const inner = `
    Index('a', columns: [x, y]),
    UniqueIndex('b', columns: [z]),
    `;
    const idx = parseDriftIndexCalls(inner);
    assert.strictEqual(idx.length, 2);
    assert.strictEqual(idx[0].name, 'a');
    assert.deepStrictEqual(idx[0].columns, ['x', 'y']);
    assert.strictEqual(idx[1].unique, true);
  });

  it('should parse unique key sets', () => {
    const inner = '{foo}, {bar, baz}';
    const sets = parseDriftUniqueKeySets(inner);
    assert.deepStrictEqual(sets, [['foo'], ['bar', 'baz']]);
  });
});

// ---------------------------------------------------------------------------
// Tests below were moved from dart-parser.test.ts to keep that file under
// the 300-line limit. They cover comment-filtering behaviour in
// parseDartTables and Drift project detection via isDriftProject.
// ---------------------------------------------------------------------------

describe('parseDartTables – comment filtering', () => {
  it('should skip table classes inside /// doc comments', () => {
    const src = [
      '/// Example:',
      '/// ```dart',
      '/// class TodoItems extends Table {',
      '///   IntColumn get id => integer().autoIncrement()();',
      '/// }',
      '/// ```',
    ].join('\n');
    const tables = parseDartTables(src, 'file:///test.dart');
    assert.strictEqual(tables.length, 0, 'should find no tables in doc comments');
  });

  it('should skip table classes inside // line comments', () => {
    const src = '// class Hidden extends Table { }';
    const tables = parseDartTables(src, 'file:///test.dart');
    assert.strictEqual(tables.length, 0);
  });

  it('should skip table classes inside block comments', () => {
    const src = '/* class Hidden extends Table { } */';
    const tables = parseDartTables(src, 'file:///test.dart');
    assert.strictEqual(tables.length, 0);
  });

  it('should skip table classes inside multiline block comments without * prefix', () => {
    // Regression: class at column 0 inside /* ... */ must still be skipped
    const src = [
      '/*',
      'class Hidden extends Table {',
      '  IntColumn get id => integer()();',
      '}',
      '*/',
    ].join('\n');
    const tables = parseDartTables(src, 'file:///test.dart');
    assert.strictEqual(tables.length, 0, 'should skip table inside multiline block comment');
  });

  it('should still parse real table classes', () => {
    const src = [
      '/// This is a doc comment about the table',
      'class RealTable extends Table {',
      '  IntColumn get id => integer().autoIncrement()();',
      '}',
    ].join('\n');
    const tables = parseDartTables(src, 'file:///test.dart');
    assert.strictEqual(tables.length, 1);
    assert.strictEqual(tables[0].dartClassName, 'RealTable');
  });

  it('should parse real tables and skip commented ones in the same file', () => {
    const src = [
      '/// Example of a bad table:',
      '/// class BadExample extends Table {',
      '///   IntColumn get id => integer()();',
      '/// }',
      '',
      'class GoodTable extends Table {',
      '  IntColumn get id => integer().autoIncrement()();',
      '}',
    ].join('\n');
    const tables = parseDartTables(src, 'file:///test.dart');
    assert.strictEqual(tables.length, 1);
    assert.strictEqual(tables[0].dartClassName, 'GoodTable');
  });
});

