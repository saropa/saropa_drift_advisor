import * as assert from 'assert';
import { generateFullSchemaSql } from '../schema-diff/schema-diff';
import { dartCol, dartTable } from './schema-diff-fixtures';

describe('generateFullSchemaSql', () => {
  it('should generate CREATE TABLE for each table', () => {
    const tables = [
      dartTable({
        columns: [
          dartCol({ sqlName: 'id', sqlType: 'INTEGER' }),
          dartCol({ sqlName: 'name', sqlType: 'TEXT' }),
        ],
      }),
    ];
    const sql = generateFullSchemaSql(tables);
    assert.ok(sql.includes('CREATE TABLE "users"'));
    assert.ok(sql.includes('"id" INTEGER'));
    assert.ok(sql.includes('"name" TEXT'));
  });

  it('should handle multiple tables', () => {
    const tables = [
      dartTable({ sqlTableName: 'users' }),
      dartTable({ sqlTableName: 'posts', dartClassName: 'Posts' }),
    ];
    const sql = generateFullSchemaSql(tables);
    assert.ok(sql.includes('CREATE TABLE "users"'));
    assert.ok(sql.includes('CREATE TABLE "posts"'));
  });

  it('should return empty string for empty input', () => {
    assert.strictEqual(generateFullSchemaSql([]), '');
  });

  it('should handle table with no columns', () => {
    const tables = [dartTable({ columns: [] })];
    const sql = generateFullSchemaSql(tables);
    assert.ok(sql.includes('CREATE TABLE "users"'));
  });
});
