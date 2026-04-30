/**
 * Tests for query model SQL rendering and validation behavior.
 */
import * as assert from 'assert';
import type { ColumnMetadata } from '../api-client';
import { createEmptyQueryModel, createTableInstance } from '../query-builder/query-model';
import { renderQuerySql, sqlLiteral, validateQueryModel } from '../query-builder/sql-renderer';

const userCols: ColumnMetadata[] = [
  { name: 'id', type: 'INTEGER', pk: true },
  { name: 'name', type: 'TEXT', pk: false },
];
const orderCols: ColumnMetadata[] = [
  { name: 'id', type: 'INTEGER', pk: true },
  { name: 'user_id', type: 'INTEGER', pk: false },
  { name: 'total', type: 'REAL', pk: false },
];

describe('sql-renderer', () => {
  it('renders a self-join using aliases', () => {
    const model = createEmptyQueryModel();
    const c1 = createTableInstance(model, 'contacts', userCols);
    model.tables.push(c1);
    const c2 = createTableInstance(model, 'contacts', userCols);
    model.tables.push(c2);
    model.joins.push({
      id: 'j1',
      leftTableId: c1.id,
      leftColumn: 'id',
      rightTableId: c2.id,
      rightColumn: 'id',
      type: 'LEFT',
    });
    model.selectedColumns.push({ tableId: c1.id, column: 'name' });
    model.selectedColumns.push({ tableId: c2.id, column: 'name', alias: 'related_name' });

    const sql = renderQuerySql(model);
    assert.ok(sql.includes('FROM "contacts" AS'));
    assert.ok(sql.includes('JOIN "contacts" AS'));
    assert.ok(sql.includes('ON'));
  });

  it('renders IN filter values as list literals', () => {
    const model = createEmptyQueryModel();
    const users = createTableInstance(model, 'users', userCols);
    model.tables.push(users);
    model.filters.push({
      id: 'f1',
      tableId: users.id,
      column: 'name',
      operator: 'IN',
      values: ['alice', 'bob'],
      conjunction: 'AND',
    });
    const sql = renderQuerySql(model);
    assert.ok(sql.includes(`IN ('alice', 'bob')`));
  });

  it('rejects empty model as invalid', () => {
    const model = createEmptyQueryModel();
    const errors = validateQueryModel(model);
    assert.ok(errors.some((e) => e.includes('at least one table')));
  });

  it('rejects mirrored duplicate joins', () => {
    const model = createEmptyQueryModel();
    const users = createTableInstance(model, 'users', userCols);
    const orders = createTableInstance(model, 'orders', orderCols);
    model.tables.push(users, orders);
    model.joins.push({
      id: 'a',
      leftTableId: users.id,
      leftColumn: 'id',
      rightTableId: orders.id,
      rightColumn: 'user_id',
      type: 'LEFT',
    });
    model.joins.push({
      id: 'b',
      leftTableId: orders.id,
      leftColumn: 'user_id',
      rightTableId: users.id,
      rightColumn: 'id',
      type: 'LEFT',
    });
    const errors = validateQueryModel(model);
    assert.ok(errors.some((e) => e.includes('duplicate join')));
  });

  it('escapes sql literals to prevent quote breaking', () => {
    assert.strictEqual(sqlLiteral("O'Reilly"), "'O''Reilly'");
  });
});
