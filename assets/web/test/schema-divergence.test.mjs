/**
 * Tests for the code-vs-runtime schema divergence diff (Feature 71).
 *
 * Exercises the real exported `computeSchemaDivergence` / `typeAffinity` by
 * esbuilding `schema-divergence.ts` to an in-memory ESM module (same approach
 * as helpers.mjs). Pure logic — no DOM, no SQLite needed.
 *
 * Run: `npm run test:web`  (node --test).
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));

const out = await build({
  entryPoints: [join(here, '..', 'schema-divergence.ts')],
  bundle: true,
  format: 'esm',
  write: false,
  logLevel: 'silent',
});
const { computeSchemaDivergence, typeAffinity } = await import(
  'data:text/javascript,' + encodeURIComponent(out.outputFiles[0].text)
);

/** Declared table helper. */
function dt(name, columns) {
  return { name, columns };
}
/** Runtime table helper. */
function rt(name, columns) {
  return { name, columns };
}

describe('typeAffinity', () => {
  it('collapses synonyms to the SQLite storage class', () => {
    assert.equal(typeAffinity('INTEGER'), 'INTEGER');
    assert.equal(typeAffinity('INT'), 'INTEGER');
    assert.equal(typeAffinity('VARCHAR(50)'), 'TEXT');
    assert.equal(typeAffinity('TEXT'), 'TEXT');
    assert.equal(typeAffinity('REAL'), 'REAL');
    assert.equal(typeAffinity('DOUBLE'), 'REAL');
    assert.equal(typeAffinity('BLOB'), 'BLOB');
    assert.equal(typeAffinity(''), 'BLOB');
  });
});

describe('computeSchemaDivergence', () => {
  it('returns nothing when code and database agree', () => {
    const declared = [
      dt('users', [
        { name: 'id', sqlType: 'INTEGER', nullable: false, isPk: true },
        { name: 'email', sqlType: 'TEXT', nullable: true, isPk: false },
      ]),
    ];
    const runtime = [
      rt('users', [
        { name: 'id', type: 'INTEGER', notnull: true, pk: true },
        { name: 'email', type: 'TEXT', notnull: false, pk: false },
      ]),
    ];
    assert.deepEqual(computeSchemaDivergence(declared, runtime), []);
  });

  it('treats INT/INTEGER and VARCHAR/TEXT as matching (affinity)', () => {
    const declared = [
      dt('t', [{ name: 'a', sqlType: 'INTEGER', isPk: true, nullable: false }]),
    ];
    const runtime = [
      rt('t', [{ name: 'a', type: 'INT', pk: true, notnull: true }]),
    ];
    assert.deepEqual(computeSchemaDivergence(declared, runtime), []);
  });

  it('flags a table declared in code but missing from the database', () => {
    const f = computeSchemaDivergence([dt('ghost', [])], []);
    assert.equal(f.length, 1);
    assert.equal(f[0].kind, 'missing-table');
    assert.equal(f[0].table, 'ghost');
  });

  it('flags a database table not declared in code', () => {
    const f = computeSchemaDivergence([], [rt('audit', [])]);
    assert.equal(f.length, 1);
    assert.equal(f[0].kind, 'extra-table');
  });

  it('never flags sqlite_* internal tables as extra', () => {
    const f = computeSchemaDivergence([], [rt('sqlite_sequence', [])]);
    assert.deepEqual(f, []);
  });

  it('flags missing and extra columns', () => {
    const declared = [
      dt('users', [
        { name: 'id', sqlType: 'INTEGER', isPk: true, nullable: false },
        { name: 'nickname', sqlType: 'TEXT', nullable: true },
      ]),
    ];
    const runtime = [
      rt('users', [
        { name: 'id', type: 'INTEGER', pk: true, notnull: true },
        { name: 'legacy_flag', type: 'INTEGER', notnull: false, pk: false },
      ]),
    ];
    const f = computeSchemaDivergence(declared, runtime);
    const kinds = f.map((x) => x.kind + ':' + x.column).sort();
    assert.deepEqual(kinds, ['extra-column:legacy_flag', 'missing-column:nickname']);
  });

  it('flags type, nullability, and primary-key mismatches', () => {
    const declared = [
      dt('p', [
        { name: 'id', sqlType: 'TEXT', nullable: false, isPk: true },
        { name: 'note', sqlType: 'TEXT', nullable: false, isPk: false },
      ]),
    ];
    const runtime = [
      rt('p', [
        // id: code TEXT/not-null/PK vs db INTEGER/not-null/not-key →
        // type + pk mismatch only (notnull matches, so no nullability finding).
        { name: 'id', type: 'INTEGER', notnull: true, pk: false },
        // note: code not-null vs db nullable → nullability mismatch only.
        { name: 'note', type: 'TEXT', notnull: false, pk: false },
      ]),
    ];
    const f = computeSchemaDivergence(declared, runtime);
    const kinds = f.map((x) => x.kind).sort();
    assert.deepEqual(kinds, [
      'nullable-mismatch',
      'pk-mismatch',
      'type-mismatch',
    ]);
  });

  it('defaults an unset nullable to nullable (matches db nullable)', () => {
    const declared = [dt('t', [{ name: 'a', sqlType: 'TEXT', isPk: false }])];
    const runtime = [
      rt('t', [{ name: 'a', type: 'TEXT', notnull: false, pk: false }]),
    ];
    assert.deepEqual(computeSchemaDivergence(declared, runtime), []);
  });
});
