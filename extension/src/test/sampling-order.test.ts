import * as assert from 'assert';
import { samplingOrderBy } from '../sql/sampling-order';

describe('samplingOrderBy', () => {
  it('omits the clause when the relation has no declared PK', () => {
    // No PK = ordinary rowid table or a view (e.g. a PowerSync table view).
    // Omitting is the only form valid for both — never fall back to rowid (#32).
    assert.strictEqual(samplingOrderBy([]), '');
  });

  it('orders by a single PK column, leading space, quoted', () => {
    assert.strictEqual(samplingOrderBy(['id']), ' ORDER BY "id"');
  });

  it('orders by composite PK columns in key order', () => {
    assert.strictEqual(
      samplingOrderBy(['row_type', 'row_id']),
      ' ORDER BY "row_type", "row_id"',
    );
  });

  it('supports descending order for recent-row previews', () => {
    assert.strictEqual(samplingOrderBy(['id'], true), ' ORDER BY "id" DESC');
  });

  it('escapes embedded double quotes in the column name', () => {
    assert.strictEqual(samplingOrderBy(['we"ird']), ' ORDER BY "we""ird"');
  });

  it('produces a valid sweep for a WITHOUT ROWID table via its PK', () => {
    // Regression guard for GitHub #32: PowerSync ps_updated_rows is WITHOUT
    // ROWID, so the sweep must key off its PK, not rowid.
    const sql = `SELECT * FROM "ps_updated_rows"${samplingOrderBy(['row_type', 'row_id'])} LIMIT 1000`;
    assert.ok(!sql.includes('rowid'));
    assert.strictEqual(
      sql,
      'SELECT * FROM "ps_updated_rows" ORDER BY "row_type", "row_id" LIMIT 1000',
    );
  });

  it('produces a rowid-free sweep for a no-PK view', () => {
    const sql = `SELECT * FROM "my_view"${samplingOrderBy([])} LIMIT 1000`;
    assert.strictEqual(sql, 'SELECT * FROM "my_view" LIMIT 1000');
  });
});
