import * as assert from 'assert';
import { rowKeyColumn } from '../sql/row-key';

describe('rowKeyColumn', () => {
  it('returns the first declared primary-key column', () => {
    assert.strictEqual(
      rowKeyColumn([
        { name: 'id', pk: true },
        { name: 'name', pk: false },
      ]),
      'id',
    );
  });

  it('returns the first PK column of a composite key', () => {
    assert.strictEqual(
      rowKeyColumn([
        { name: 'row_type', pk: true },
        { name: 'row_id', pk: true },
      ]),
      'row_type',
    );
  });

  it('falls back to an "id" column when no PK is declared (views)', () => {
    // PowerSync exposes tables as views whose key column `id` is not reported
    // as a PK by PRAGMA table_info; keying on id avoids the rowid crash (#32).
    assert.strictEqual(
      rowKeyColumn([
        { name: 'id', pk: false },
        { name: 'data', pk: false },
      ]),
      'id',
    );
  });

  it('matches an "id" column case-insensitively', () => {
    assert.strictEqual(
      rowKeyColumn([
        { name: 'ID', pk: false },
        { name: 'data', pk: false },
      ]),
      'ID',
    );
  });

  it('falls back to rowid only when neither PK nor id exists', () => {
    assert.strictEqual(
      rowKeyColumn([
        { name: 'name', pk: false },
        { name: 'data', pk: false },
      ]),
      'rowid',
    );
  });

  it('prefers a declared PK over an id column', () => {
    assert.strictEqual(
      rowKeyColumn([
        { name: 'id', pk: false },
        { name: 'uuid', pk: true },
      ]),
      'uuid',
    );
  });
});
