/**
 * Unit tests for the Schema explorer's pure logic (schema-explorer-logic.ts).
 *
 * The renderer (schema-explorer.ts) reads document/fetch, so the testable logic
 * lives in a DOM-free sibling. As with home-search.test.mjs, esbuild compiles
 * the real TypeScript to an in-memory ESM module and the tests exercise the
 * actual exports.
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
  entryPoints: [join(here, '..', 'schema-explorer-logic.ts')],
  bundle: true,
  format: 'esm',
  write: false,
  logLevel: 'silent',
});
const mod = await import('data:text/javascript,' + encodeURIComponent(out.outputFiles[0].text));
const { baseType, tableFks, collectTypes, buildIncomingFkMap, tableMatches, buildSchemaMarkdown } = mod;

// Shared fixture: two tables, one FK edge contacts.org_id → orgs.id.
const META = {
  tables: [
    {
      name: 'contacts',
      rowCount: 3,
      columns: [
        { name: 'id', type: 'INTEGER', pk: true, notnull: true },
        { name: 'name', type: 'TEXT', notnull: true },
        { name: 'org_id', type: 'INTEGER' },
        { name: 'note', type: '' },
      ],
      foreignKeys: [{ fromColumn: 'org_id', toTable: 'orgs', toColumn: 'id' }],
    },
    {
      name: 'orgs',
      rowCount: 1,
      columns: [
        { name: 'id', type: 'INTEGER', pk: true, notnull: true },
        { name: 'label', type: 'VARCHAR(255)' },
      ],
    },
  ],
  foreignKeys: [{ fromTable: 'contacts', fromColumn: 'org_id', toTable: 'orgs', toColumn: 'id' }],
};

describe('baseType', () => {
  it('uppercases and strips length/precision parens', () => {
    assert.equal(baseType('VARCHAR(255)'), 'VARCHAR');
    assert.equal(baseType('integer'), 'INTEGER');
    assert.equal(baseType('  text '), 'TEXT');
  });
  it('takes the first keyword of a multi-word type', () => {
    assert.equal(baseType('UNSIGNED BIG INT'), 'UNSIGNED');
  });
  it('collapses empty/nullish to an empty string', () => {
    assert.equal(baseType(''), '');
    assert.equal(baseType(null), '');
    assert.equal(baseType(undefined), '');
  });
});

describe('tableFks', () => {
  it('returns the declared edges, or [] when absent', () => {
    assert.equal(tableFks(META.tables[0]).length, 1);
    assert.deepEqual(tableFks(META.tables[1]), []);
    assert.deepEqual(tableFks(null), []);
  });
});

describe('collectTypes', () => {
  it('returns distinct base types sorted, skipping empties', () => {
    // INTEGER, TEXT, VARCHAR — the empty type on contacts.note is dropped.
    assert.deepEqual(collectTypes(META), ['INTEGER', 'TEXT', 'VARCHAR']);
  });
  it('is empty for no tables', () => {
    assert.deepEqual(collectTypes({ tables: [] }), []);
    assert.deepEqual(collectTypes(null), []);
  });
});

describe('buildIncomingFkMap', () => {
  it('maps a referenced table to its inbound edges', () => {
    const map = buildIncomingFkMap(META);
    assert.equal(map.orgs.length, 1);
    assert.equal(map.orgs[0].fromTable, 'contacts');
    assert.equal(map.orgs[0].fromColumn, 'org_id');
    assert.equal(map.contacts, undefined);
  });
});

describe('tableMatches', () => {
  it('matches on table name (case-insensitive substring)', () => {
    assert.equal(tableMatches(META.tables[0], 'CONT', ''), true);
    assert.equal(tableMatches(META.tables[1], 'cont', ''), false);
  });
  it('matches on any column name', () => {
    assert.equal(tableMatches(META.tables[0], 'org_id', ''), true);
    assert.equal(tableMatches(META.tables[1], 'org_id', ''), false);
  });
  it('empty term matches every table', () => {
    assert.equal(tableMatches(META.tables[1], '', ''), true);
  });
  it('type filter requires a column of that base type', () => {
    assert.equal(tableMatches(META.tables[1], '', 'VARCHAR'), true);
    assert.equal(tableMatches(META.tables[1], '', 'TEXT'), false);
  });
  it('type filter and term compose (both must hold)', () => {
    // contacts has TEXT but its name does not contain "orgs".
    assert.equal(tableMatches(META.tables[0], 'orgs', 'TEXT'), false);
    assert.equal(tableMatches(META.tables[0], 'name', 'TEXT'), true);
  });
});

describe('buildSchemaMarkdown', () => {
  it('emits a section per table with a column table and FK lines', () => {
    const md = buildSchemaMarkdown(META);
    assert.match(md, /^# Schema/);
    assert.match(md, /## contacts/);
    assert.match(md, /## orgs/);
    // PK + NOT NULL render in the constraints column.
    assert.match(md, /\| id \| INTEGER \| PK, NOT NULL \|/);
    // The FK edge is listed.
    assert.match(md, /FK: `org_id` → `orgs\.id`/);
  });
  it('handles an empty schema without throwing', () => {
    assert.equal(buildSchemaMarkdown({ tables: [] }), '# Schema\n');
  });
});
