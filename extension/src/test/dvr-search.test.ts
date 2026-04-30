/**
 * Tests for DVR client-side search / filter helpers.
 */

import * as assert from 'node:assert';
import type { IRecordedQueryV1 } from '../api-types';
import { filterRecordedQueries, searchRecordedQueries } from '../dvr/dvr-search';

function q(partial: Partial<IRecordedQueryV1> & Pick<IRecordedQueryV1, 'id' | 'sql' | 'type'>): IRecordedQueryV1 {
  return {
    sessionId: 's',
    sequence: partial.id,
    params: { positional: [], named: {} },
    timestamp: '',
    durationMs: 1,
    affectedRowCount: 0,
    resultRowCount: 0,
    table: null,
    beforeState: null,
    afterState: null,
    ...partial,
  } as IRecordedQueryV1;
}

describe('filterRecordedQueries', () => {
  const rows: IRecordedQueryV1[] = [
    q({ id: 0, sql: 'SELECT * FROM items', type: 'select', table: 'items' }),
    q({ id: 1, sql: 'UPDATE items SET x=1', type: 'update', table: 'items' }),
    q({ id: 2, sql: 'DELETE FROM orders WHERE id=1', type: 'delete', table: 'orders' }),
  ];

  it('filters by SQL substring (case-insensitive)', () => {
    const out = filterRecordedQueries(rows, { text: 'orders', kind: 'all', tableSubstring: '' });
    assert.equal(out.length, 1);
    assert.equal(out[0].id, 2);
  });

  it('filters reads only', () => {
    const out = filterRecordedQueries(rows, { text: '', kind: 'reads', tableSubstring: '' });
    assert.equal(out.length, 1);
    assert.equal(out[0].type, 'select');
  });

  it('filters writes only', () => {
    const out = filterRecordedQueries(rows, { text: '', kind: 'writes', tableSubstring: '' });
    assert.equal(out.length, 2);
  });

  it('filters by table substring', () => {
    const out = filterRecordedQueries(rows, { text: '', kind: 'all', tableSubstring: 'order' });
    assert.equal(out.length, 1);
    assert.equal(out[0].table, 'orders');
  });
});

describe('searchRecordedQueries', () => {
  const rows: IRecordedQueryV1[] = [
    {
      sessionId: 's',
      id: 0,
      sequence: 0,
      sql: 'UPDATE items SET title = "x"',
      params: { positional: [], named: {} },
      type: 'update',
      timestamp: '',
      durationMs: 1,
      affectedRowCount: 1,
      resultRowCount: 0,
      table: 'items',
      beforeState: [{ id: 1, title: 'First' }],
      afterState: [{ id: 1, title: 'x' }],
    } as IRecordedQueryV1,
  ];

  it('finds matches in before/after row values', () => {
    const hits = searchRecordedQueries(rows, 'First');
    assert.ok(hits.some((h) => h.matchType === 'value'));
  });

  it('returns empty for whitespace term', () => {
    assert.deepStrictEqual(searchRecordedQueries(rows, '   '), []);
  });
});
