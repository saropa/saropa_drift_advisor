import * as assert from 'assert';
import {
  extractClassBody,
  isInsideComment,
  parseColumn,
  parseDartTables,
} from '../schema-diff/dart-parser';
import { isDriftProject } from '../diagnostics/dart-file-parser';

describe('extractClassBody', () => {
  it('should extract a simple class body', () => {
    const src = 'class Foo extends Table { int x = 1; }';
    const idx = src.indexOf('{');
    assert.strictEqual(extractClassBody(src, idx).trim(), 'int x = 1;');
  });

  it('should handle nested braces', () => {
    const src = 'class Foo extends Table { void f() { if (true) { } } }';
    const idx = src.indexOf('{');
    const body = extractClassBody(src, idx);
    assert.ok(body.includes('void f()'));
    assert.ok(body.includes('if (true)'));
  });

  it('should skip braces inside single-quoted strings', () => {
    const src = "class Foo extends Table { String s = '{}'; }";
    const idx = src.indexOf('{');
    const body = extractClassBody(src, idx);
    assert.ok(body.includes("'{}'"));
  });

  it('should skip braces inside double-quoted strings', () => {
    const src = 'class Foo extends Table { String s = "{}"; }';
    const idx = src.indexOf('{');
    const body = extractClassBody(src, idx);
    assert.ok(body.includes('"{}'));
  });

  it('should skip braces inside line comments', () => {
    const src = 'class Foo extends Table {\n// { not a brace\nint x = 1;\n}';
    const idx = src.indexOf('{');
    const body = extractClassBody(src, idx);
    assert.ok(body.includes('int x = 1'));
  });

  it('should skip braces inside block comments', () => {
    const src = 'class Foo extends Table { /* { } */ int x = 1; }';
    const idx = src.indexOf('{');
    const body = extractClassBody(src, idx);
    assert.ok(body.includes('int x = 1'));
  });

  it('should skip braces inside triple-quoted strings', () => {
    const src =
      "class Foo extends Table { String s = '''{ }'''; int x = 1; }";
    const idx = src.indexOf('{');
    const body = extractClassBody(src, idx);
    assert.ok(body.includes('int x = 1'));
  });

  it('should handle escaped quotes in strings', () => {
    const src = "class Foo extends Table { String s = 'a\\'b{'; int x = 1; }";
    const idx = src.indexOf('{');
    const body = extractClassBody(src, idx);
    assert.ok(body.includes('int x = 1'));
  });
});

describe('parseColumn', () => {
  it('should parse IntColumn to INTEGER', () => {
    const col = parseColumn('IntColumn', 'userId', 'integer()', 5);
    assert.ok(col);
    assert.strictEqual(col.sqlType, 'INTEGER');
    assert.strictEqual(col.sqlName, 'user_id');
    assert.strictEqual(col.line, 5);
  });

  it('should parse TextColumn to TEXT', () => {
    const col = parseColumn('TextColumn', 'name', 'text()', 0);
    assert.ok(col);
    assert.strictEqual(col.sqlType, 'TEXT');
  });

  it('should parse BoolColumn to INTEGER', () => {
    const col = parseColumn('BoolColumn', 'isActive', 'boolean()', 0);
    assert.ok(col);
    assert.strictEqual(col.sqlType, 'INTEGER');
  });

  it('should parse DateTimeColumn to INTEGER', () => {
    const col = parseColumn('DateTimeColumn', 'createdAt', 'dateTime()', 0);
    assert.ok(col);
    assert.strictEqual(col.sqlType, 'INTEGER');
  });

  it('should parse RealColumn to REAL', () => {
    const col = parseColumn('RealColumn', 'price', 'real()', 0);
    assert.ok(col);
    assert.strictEqual(col.sqlType, 'REAL');
  });

  it('should parse BlobColumn to BLOB', () => {
    const col = parseColumn('BlobColumn', 'data', 'blob()', 0);
    assert.ok(col);
    assert.strictEqual(col.sqlType, 'BLOB');
  });

  it('should parse Int64Column to INTEGER', () => {
    const col = parseColumn('Int64Column', 'bigId', 'int64()', 0);
    assert.ok(col);
    assert.strictEqual(col.sqlType, 'INTEGER');
  });

  it('should detect .nullable()', () => {
    const col = parseColumn('TextColumn', 'bio', 'text().nullable()', 0);
    assert.ok(col);
    assert.strictEqual(col.nullable, true);
  });

  it('should default nullable to false', () => {
    const col = parseColumn('TextColumn', 'name', 'text()', 0);
    assert.ok(col);
    assert.strictEqual(col.nullable, false);
  });

  it('should detect .autoIncrement()', () => {
    const col = parseColumn(
      'IntColumn', 'id', 'integer().autoIncrement()', 0,
    );
    assert.ok(col);
    assert.strictEqual(col.autoIncrement, true);
  });

  it('should detect .named() override', () => {
    const col = parseColumn(
      'TextColumn', 'userName', "text().named('user_login')", 0,
    );
    assert.ok(col);
    assert.strictEqual(col.sqlName, 'user_login');
  });

  it('should convert getter name to snake_case', () => {
    const col = parseColumn('TextColumn', 'firstName', 'text()', 0);
    assert.ok(col);
    assert.strictEqual(col.sqlName, 'first_name');
  });

  it('should return null for unknown column type', () => {
    const col = parseColumn('CustomColumn', 'x', 'custom()', 0);
    assert.strictEqual(col, null);
  });
});

describe('isInsideComment', () => {
  it('should detect /// doc comment prefix', () => {
    const src = '/// class Foo extends Table {';
    const idx = src.indexOf('class');
    assert.strictEqual(isInsideComment(src, idx), true);
  });

  it('should detect // line comment prefix', () => {
    const src = '// class Foo extends Table {';
    const idx = src.indexOf('class');
    assert.strictEqual(isInsideComment(src, idx), true);
  });

  it('should not flag real class declarations', () => {
    const src = 'class Foo extends Table {';
    const idx = src.indexOf('class');
    assert.strictEqual(isInsideComment(src, idx), false);
  });

  it('should not flag indented real class declarations', () => {
    const src = '  class Foo extends Table {';
    const idx = src.indexOf('class');
    assert.strictEqual(isInsideComment(src, idx), false);
  });

  it('should detect doc comment on a later line', () => {
    const src = 'int x = 1;\n/// class Foo extends Table {';
    const idx = src.indexOf('class');
    assert.strictEqual(isInsideComment(src, idx), true);
  });

  it('should detect block comment body lines starting with *', () => {
    const src = '/*\n * class Foo extends Table {\n */';
    const idx = src.indexOf('class');
    assert.strictEqual(isInsideComment(src, idx), true);
  });

  it('should detect content inside /* ... */ block comment', () => {
    const src = '/* class Foo extends Table { */';
    const idx = src.indexOf('class');
    assert.strictEqual(isInsideComment(src, idx), true);
  });

  it('should not flag code after a closed block comment', () => {
    const src = '/* comment */ class Foo extends Table {';
    const idx = src.indexOf('class');
    assert.strictEqual(isInsideComment(src, idx), false);
  });
});

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

describe('isDriftProject', () => {
  it('should detect drift dependency', () => {
    const pubspec = 'dependencies:\n  drift: ^2.14.0\n';
    assert.strictEqual(isDriftProject(pubspec), true);
  });

  it('should detect saropa_drift_advisor dependency', () => {
    const pubspec = 'dev_dependencies:\n  saropa_drift_advisor: ^2.17.0\n';
    assert.strictEqual(isDriftProject(pubspec), true);
  });

  it('should return false for non-Drift projects', () => {
    const pubspec = 'dependencies:\n  flutter:\n    sdk: flutter\n  provider: ^6.0.0\n';
    assert.strictEqual(isDriftProject(pubspec), false);
  });

  it('should not match drift_dev or drift_sqflite alone', () => {
    // /\bdrift\s*:/ requires `drift` followed by optional whitespace then `:`.
    // In `drift_dev:`, after `drift` comes `_` — not whitespace or `:` — so
    // having only drift_dev does not make this a Drift project.
    const pubspec = 'dev_dependencies:\n  drift_dev: ^2.14.0\n';
    assert.strictEqual(isDriftProject(pubspec), false);
  });

  it('should return false for empty pubspec', () => {
    assert.strictEqual(isDriftProject(''), false);
  });
});

