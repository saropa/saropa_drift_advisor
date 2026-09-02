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

  // Regression coverage for bug 007: Number.parseInt silently rounds any
  // digit string above 2^53 (e.g. '9007199254740993' -> 9007199254740992).
  // A snowflake/Discord ID, Int64Column, or microsecond timestamp above that
  // range must be kept as an exact value, not routed through a JS `number`.
  it('coerces an INTEGER above Number.MAX_SAFE_INTEGER to a RawIntegerLiteral, not a rounded number', () => {
    const col = sampleTables[0].columns[1];
    const r = parseCellEditForColumn(col, '9007199254740993'); // 2^53 + 1
    assert.strictEqual(r.ok, true);
    if (r.ok) {
      assert.deepStrictEqual(r.value, { rawInteger: '9007199254740993' });
      // The warning is informational, not a rejection - the edit still applies.
      assert.ok(r.warning && /exceeds the safe integer range/.test(r.warning));
    }
  });

  it('coerces a large negative INTEGER to an exact RawIntegerLiteral', () => {
    const col = sampleTables[0].columns[1];
    const r = parseCellEditForColumn(col, '-72057594037927937'); // -(2^56 + 1)
    assert.strictEqual(r.ok, true);
    if (r.ok) {
      assert.deepStrictEqual(r.value, { rawInteger: '-72057594037927937' });
    }
  });

  it('keeps an INTEGER at the exact safe boundary as a plain number', () => {
    const col = sampleTables[0].columns[1];
    const r = parseCellEditForColumn(col, String(Number.MAX_SAFE_INTEGER));
    assert.strictEqual(r.ok, true);
    if (r.ok) {
      assert.strictEqual(r.value, Number.MAX_SAFE_INTEGER);
      assert.strictEqual(r.warning, undefined);
    }
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

  // Regression coverage for bug 009: a TEXT/UUID primary key is NOT an
  // engine-populated rowid alias, so unlike the INTEGER `id` column above it
  // must survive validateRowInsert rather than being silently dropped.
  const textPkTables: TableMetadata[] = [
    {
      name: 'devices',
      rowCount: 0,
      columns: [
        { name: 'uuid', type: 'TEXT', pk: true, notnull: false },
        { name: 'label', type: 'TEXT', pk: false, notnull: true },
      ],
    },
  ];

  it('validateRowInsert keeps a supplied TEXT primary key value', () => {
    const r = validateRowInsert(textPkTables, 'devices', {
      uuid: 'd1',
      label: 'Phone',
    });
    assert.strictEqual(r.ok, true);
    if (r.ok) {
      assert.strictEqual(r.values.uuid, 'd1');
      assert.strictEqual(r.values.label, 'Phone');
    }
  });

  it('validateRowInsert rejects an insert missing a required TEXT primary key', () => {
    const r = validateRowInsert(textPkTables, 'devices', { label: 'Phone' });
    assert.strictEqual(r.ok, false);
    if (!r.ok) {
      assert.match(r.message, /uuid.*primary key.*must be supplied/i);
    }
  });

  // Composite PRIMARY KEY: PRAGMA table_info numbers each part `pk = 1, 2, ...`
  // (all truthy here), so neither column alone is a rowid alias even though
  // both are INTEGER - both must be supplied or the insert is rejected.
  const compositePkTables: TableMetadata[] = [
    {
      name: 'memberships',
      rowCount: 0,
      columns: [
        { name: 'user_id', type: 'INTEGER', pk: true, notnull: true },
        { name: 'group_id', type: 'INTEGER', pk: true, notnull: true },
      ],
    },
  ];

  it('validateRowInsert keeps both parts of a supplied composite primary key', () => {
    const r = validateRowInsert(compositePkTables, 'memberships', {
      user_id: '1',
      group_id: '2',
    });
    assert.strictEqual(r.ok, true);
    if (r.ok) {
      assert.strictEqual(r.values.user_id, 1);
      assert.strictEqual(r.values.group_id, 2);
    }
  });

  it('validateRowInsert rejects a composite key insert missing one part', () => {
    const r = validateRowInsert(compositePkTables, 'memberships', {
      user_id: '1',
    });
    assert.strictEqual(r.ok, false);
    if (!r.ok) {
      assert.match(r.message, /group_id.*primary key.*must be supplied/i);
    }
  });

  // Bug 009: an empty-string value for a nullable TEXT PK passes the
  // "must be supplied" check (hasOwnProperty returns true) but coerces to
  // null — which creates an uneditable, undeletable row. Reject it.
  it('validateRowInsert rejects empty-string TEXT primary key that coerces to null', () => {
    const r = validateRowInsert(textPkTables, 'devices', {
      uuid: '',
      label: 'Phone',
    });
    assert.strictEqual(r.ok, false);
    if (!r.ok) {
      assert.match(r.message, /uuid.*primary key.*cannot be empty/i);
    }
  });

  // Bug 009: whitespace-only PK also coerces to null — same rejection.
  it('validateRowInsert rejects whitespace-only TEXT primary key', () => {
    const r = validateRowInsert(textPkTables, 'devices', {
      uuid: '   ',
      label: 'Phone',
    });
    assert.strictEqual(r.ok, false);
    if (!r.ok) {
      assert.match(r.message, /uuid.*primary key.*cannot be empty/i);
    }
  });
});
