import * as assert from 'assert';
import {
  sqlLiteral,
  formatAsSql,
  formatAsDataset,
} from '../seeder/seed-formatter';
import type { ITableSeedResult } from '../seeder/seeder-types';

describe('sqlLiteral', () => {
  it('converts null to NULL', () => {
    assert.strictEqual(sqlLiteral(null), 'NULL');
  });

  it('converts undefined to NULL', () => {
    assert.strictEqual(sqlLiteral(undefined), 'NULL');
  });

  it('converts number to string', () => {
    assert.strictEqual(sqlLiteral(42), '42');
  });

  it('converts boolean true to 1', () => {
    assert.strictEqual(sqlLiteral(true), '1');
  });

  it('converts boolean false to 0', () => {
    assert.strictEqual(sqlLiteral(false), '0');
  });

  it('escapes single quotes in strings', () => {
    assert.strictEqual(sqlLiteral("it's"), "'it''s'");
  });

  it('wraps strings in single quotes', () => {
    assert.strictEqual(sqlLiteral('hello'), "'hello'");
  });
});

describe('formatAsSql', () => {
  const results: ITableSeedResult[] = [
    {
      table: 'users',
      rows: [
        { id: 1, name: 'Alice' },
        { id: 2, name: 'Bob' },
      ],
    },
  ];

  it('produces valid INSERT statements', () => {
    const sql = formatAsSql(results);
    assert.ok(sql.includes(
      'INSERT INTO "users" ("id", "name") VALUES (1, \'Alice\');',
    ));
    assert.ok(sql.includes(
      'INSERT INTO "users" ("id", "name") VALUES (2, \'Bob\');',
    ));
  });

  it('includes table header comments', () => {
    const sql = formatAsSql(results);
    assert.ok(sql.includes('-- users: 2 rows'));
  });

  it('handles empty results', () => {
    const sql = formatAsSql([]);
    assert.ok(sql.includes('-- Generated test data'));
  });

  it('handles NULL values in rows', () => {
    const sql = formatAsSql([{
      table: 't',
      rows: [{ a: null, b: 'x' }],
    }]);
    assert.ok(sql.includes('NULL'));
  });
});

describe('formatAsDataset', () => {
  const results: ITableSeedResult[] = [
    { table: 'users', rows: [{ id: 1 }] },
    { table: 'posts', rows: [{ id: 10 }] },
  ];

  it('produces valid IDriftDataset with $schema field', () => {
    const ds = formatAsDataset(results, 'test');
    assert.strictEqual(ds.$schema, 'drift-dataset/v1');
  });

  it('includes all tables in output', () => {
    const ds = formatAsDataset(results, 'test');
    assert.ok('users' in ds.tables);
    assert.ok('posts' in ds.tables);
  });

  it('uses provided name', () => {
    const ds = formatAsDataset(results, 'my-dataset');
    assert.strictEqual(ds.name, 'my-dataset');
  });

  it('handles empty results', () => {
    const ds = formatAsDataset([], 'empty');
    assert.deepStrictEqual(ds.tables, {});
  });
});
