import * as assert from 'assert';
import { ColumnMetadata, TableMetadata } from '../api-client';
import { generateDartTables } from '../codegen/dart-codegen';

function col(overrides: Partial<ColumnMetadata> = {}): ColumnMetadata {
  return { name: 'id', type: 'INTEGER', pk: false, ...overrides };
}

function table(overrides: Partial<TableMetadata> = {}): TableMetadata {
  return {
    name: 'users',
    columns: [col({ pk: true })],
    rowCount: 0,
    ...overrides,
  };
}

describe('generateDartTables', () => {
  it('returns empty string for no tables', () => {
    assert.strictEqual(generateDartTables([]), '');
  });

  it('generates basic table with all column types', () => {
    const t = table({
      name: 'items',
      columns: [
        col({ name: 'id', type: 'INTEGER', pk: true }),
        col({ name: 'title', type: 'TEXT' }),
        col({ name: 'price', type: 'REAL' }),
        col({ name: 'data', type: 'BLOB' }),
      ],
    });
    const out = generateDartTables([t]);
    assert.ok(out.includes("import 'package:drift/drift.dart';"));
    assert.ok(out.includes('class Items extends Table {'));
    assert.ok(out.includes('IntColumn get id => integer().autoIncrement()();'));
    assert.ok(out.includes('TextColumn get title => text()();'));
    assert.ok(out.includes('RealColumn get price => real()();'));
    assert.ok(out.includes('BlobColumn get data => blob()();'));
  });

  it('detects autoIncrement for INTEGER PK', () => {
    const t = table({
      columns: [col({ name: 'id', type: 'INTEGER', pk: true })],
    });
    const out = generateDartTables([t]);
    assert.ok(out.includes('integer().autoIncrement()()'));
  });

  it('does not autoIncrement non-INTEGER PK', () => {
    const t = table({
      columns: [col({ name: 'key', type: 'TEXT', pk: true })],
    });
    const out = generateDartTables([t]);
    assert.ok(out.includes('TextColumn get key => text()()'));
    assert.ok(!out.includes('autoIncrement'));
  });

  it('falls back to TextColumn for unknown type', () => {
    const t = table({
      columns: [col({ name: 'meta', type: 'JSON' })],
    });
    const out = generateDartTables([t]);
    assert.ok(out.includes('TextColumn get meta => text()();'));
  });

  it('maps NUMERIC to IntColumn', () => {
    const t = table({
      columns: [col({ name: 'amount', type: 'NUMERIC' })],
    });
    const out = generateDartTables([t]);
    assert.ok(out.includes('IntColumn get amount => integer()();'));
  });

  it('adds heuristic comment for Bool candidates', () => {
    const t = table({
      columns: [
        col({ name: 'is_active', type: 'INTEGER' }),
        col({ name: 'has_access', type: 'INTEGER' }),
        col({ name: 'can_edit', type: 'INTEGER' }),
      ],
    });
    const out = generateDartTables([t]);
    assert.strictEqual(
      (out.match(/\/\/ Consider: BoolColumn/g) ?? []).length,
      3,
    );
  });

  it('adds heuristic comment for DateTime candidates', () => {
    const t = table({
      columns: [
        col({ name: 'created_at', type: 'INTEGER' }),
        col({ name: 'birth_date', type: 'INTEGER' }),
        col({ name: 'start_time', type: 'INTEGER' }),
      ],
    });
    const out = generateDartTables([t]);
    assert.strictEqual(
      (out.match(/\/\/ Consider: DateTimeColumn/g) ?? []).length,
      3,
    );
  });

  it('no heuristic comment on PK columns', () => {
    const t = table({
      columns: [col({ name: 'is_active', type: 'INTEGER', pk: true })],
    });
    const out = generateDartTables([t]);
    assert.ok(!out.includes('// Consider'));
  });

  it('no heuristic comment on non-INTEGER columns', () => {
    const t = table({
      columns: [col({ name: 'is_active', type: 'TEXT' })],
    });
    const out = generateDartTables([t]);
    assert.ok(!out.includes('// Consider'));
  });

  it('emits .named() when round-trip does not match', () => {
    const t = table({
      columns: [col({ name: 'XMLData', type: 'TEXT' })],
    });
    const out = generateDartTables([t]);
    assert.ok(out.includes(".named('XMLData')"));
  });

  it('generates multiple tables separated by blank line', () => {
    const out = generateDartTables([
      table({ name: 'users' }),
      table({ name: 'posts' }),
    ]);
    assert.ok(out.includes('class Users extends Table'));
    assert.ok(out.includes('class Posts extends Table'));
    assert.ok(out.includes('}\n\nclass'));
  });

  it('handles snake_case table and column names', () => {
    const t = table({
      name: 'user_settings',
      columns: [col({ name: 'setting_value', type: 'TEXT' })],
    });
    const out = generateDartTables([t]);
    assert.ok(out.includes('class UserSettings extends Table'));
    assert.ok(out.includes('get settingValue'));
  });

  it('generates empty class body for table with no columns', () => {
    const t = table({ columns: [] });
    const out = generateDartTables([t]);
    assert.ok(out.includes('class Users extends Table {\n}'));
  });

  it('includes nullability notice in header comment', () => {
    const out = generateDartTables([table()]);
    assert.ok(out.includes('Nullability cannot be detected'));
  });
});
