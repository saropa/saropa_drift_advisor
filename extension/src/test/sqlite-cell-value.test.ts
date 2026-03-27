import * as assert from 'assert';
import type { TableMetadata } from '../api-types';
import {
  parseCellEditForColumn,
  validateCellEdit,
  validateRowInsert,
} from '../editing/sqlite-cell-value';

describe('sqlite-cell-value', () => {
  const sampleTables: TableMetadata[] = [
    {
      name: 't',
      rowCount: 1,
      columns: [
        { name: 'id', type: 'INTEGER', pk: true, notnull: true },
        { name: 'n', type: 'INTEGER', pk: false, notnull: false },
        { name: 'req', type: 'INTEGER', pk: false, notnull: true },
        { name: 'label', type: 'TEXT', pk: false, notnull: true },
        { name: 'bio', type: 'TEXT', pk: false, notnull: false },
      ],
    },
  ];

  it('allows NULL for nullable columns when input is empty', () => {
    const col = sampleTables[0].columns[4];
    const r = parseCellEditForColumn(col, '');
    assert.strictEqual(r.ok, true);
    if (r.ok) assert.strictEqual(r.value, null);
  });

  it('allows empty string for NOT NULL TEXT', () => {
    const col = sampleTables[0].columns[3];
    const r = parseCellEditForColumn(col, '   ');
    assert.strictEqual(r.ok, true);
    if (r.ok) assert.strictEqual(r.value, '');
  });

  it('rejects NULL for NOT NULL non-text columns', () => {
    const col = sampleTables[0].columns[2];
    const r = parseCellEditForColumn(col, '');
    assert.strictEqual(r.ok, false);
  });

  it('coerces valid INTEGER strings', () => {
    const col = sampleTables[0].columns[1];
    const r = parseCellEditForColumn(col, '-42');
    assert.strictEqual(r.ok, true);
    if (r.ok) assert.strictEqual(r.value, -42);
  });

  it('rejects bad INTEGER input', () => {
    const col = sampleTables[0].columns[1];
    const r = parseCellEditForColumn(col, '3.14');
    assert.strictEqual(r.ok, false);
  });

  it('rejects PK column edits', () => {
    const col = sampleTables[0].columns[0];
    const r = parseCellEditForColumn(col, '1');
    assert.strictEqual(r.ok, false);
  });

  it('validateCellEdit resolves column by table', () => {
    const ok = validateCellEdit(sampleTables, 't', 'n', '7');
    assert.strictEqual(ok.ok, true);
    if (ok.ok) assert.strictEqual(ok.value, 7);
  });

  it('validateCellEdit fails for unknown table', () => {
    const r = validateCellEdit(sampleTables, 'missing', 'n', '1');
    assert.strictEqual(r.ok, false);
  });

  it('validateRowInsert rejects NOT NULL columns left null', () => {
    const r = validateRowInsert(sampleTables, 't', {
      n: null,
      req: null,
      label: 'ok',
      bio: null,
    });
    assert.strictEqual(r.ok, false);
  });

  it('validateRowInsert coerces non-PK columns like cell edits', () => {
    const r = validateRowInsert(sampleTables, 't', {
      n: '5',
      req: '1',
      label: 'x',
      bio: '',
    });
    assert.strictEqual(r.ok, true);
    if (r.ok) {
      assert.strictEqual(r.values.n, 5);
      assert.strictEqual(r.values.req, 1);
    }
  });
});
