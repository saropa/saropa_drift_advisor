/**
 * Tests for SQL → visual query model import and round-trip with [renderQuerySql].
 */
import * as assert from 'assert';
import type { ColumnMetadata, TableMetadata } from '../api-client';
import { createEmptyQueryModel, createTableInstance } from '../query-builder/query-model';
import { importSelectSqlToModel } from '../query-builder/sql-import';
import { renderQuerySql } from '../query-builder/sql-renderer';

const userCols: ColumnMetadata[] = [
  { name: 'id', type: 'INTEGER', pk: true },
  { name: 'name', type: 'TEXT', pk: false },
];
const orderCols: ColumnMetadata[] = [
  { name: 'id', type: 'INTEGER', pk: true },
  { name: 'user_id', type: 'INTEGER', pk: false },
  { name: 'total', type: 'REAL', pk: false },
];

function schema(): TableMetadata[] {
  return [
    { name: 'users', columns: userCols, rowCount: 0 },
    { name: 'orders', columns: orderCols, rowCount: 0 },
  ];
}

describe('sql-import', () => {
  it('round-trips a simple two-table join from renderer output', () => {
    const model = createEmptyQueryModel();
    const u = createTableInstance(model, 'users', userCols, { forcedAlias: 'u1' });
    const o = createTableInstance(model, 'orders', orderCols, { forcedAlias: 'o1' });
    model.tables.push(u, o);
    model.joins.push({
      id: 'j',
      leftTableId: u.id,
      leftColumn: 'id',
      rightTableId: o.id,
      rightColumn: 'user_id',
      type: 'LEFT',
    });
    model.selectedColumns.push(
      { tableId: u.id, column: 'name' },
      { tableId: o.id, column: 'total', aggregation: 'SUM', alias: 'sum_total' },
    );
    model.filters.push({
      id: 'f',
      tableId: u.id,
      column: 'name',
      operator: 'LIKE',
      value: '%a%',
      conjunction: 'AND',
    });
    model.limit = 50;

    const sql = renderQuerySql(model);
    const { model: imported, errors, warnings } = importSelectSqlToModel(sql, schema());
    assert.strictEqual(errors.length, 0, errors.join('; '));
    assert.strictEqual(warnings.length, 0, warnings.join('; '));
    const out = renderQuerySql(imported);
    assert.strictEqual(out, sql);
  });

  it('imports self-join SQL with distinct aliases', () => {
    const sql = [
      'SELECT "c1"."name", "c2"."name"',
      'FROM "users" AS "c1"',
      'LEFT JOIN "users" AS "c2" ON "c2"."id" = "c1"."id"',
      'LIMIT 10',
    ].join('\n');
    const { model, errors } = importSelectSqlToModel(sql, schema());
    assert.strictEqual(errors.length, 0);
    assert.strictEqual(model.tables.length, 2);
    assert.notStrictEqual(model.tables[0]!.alias, model.tables[1]!.alias);
    assert.strictEqual(model.joins.length, 1);
  });

  it('rejects WITH queries', () => {
    const { errors } = importSelectSqlToModel('WITH x AS (SELECT 1) SELECT * FROM users', schema());
    assert.ok(errors.some((e) => e.includes('WITH')));
  });
});
