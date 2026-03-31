import * as assert from 'assert';
import {
  extractClassBody,
  parseColumn,
} from '../schema-diff/dart-parser';

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

