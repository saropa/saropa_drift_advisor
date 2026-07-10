/**
 * Unit tests for the boolean-rendering logic in table-view.ts:
 * the driftType-exact path in formatCellValue, the name-heuristic fallback
 * (including the fixed `_active`/`_enabled` suffix regex, which previously
 * used a Dart-escaped `\$` that matched a literal dollar sign in JS), the
 * shared isBoolSemanticColumn predicate, and the cross-table ambiguity rule
 * isUnambiguousDriftBoolColumn used by table-less SQL results.
 *
 * Like the sibling suites, esbuild compiles the real TypeScript to an
 * in-memory ESM module. table-view.ts is bundled together with state.ts via a
 * stdin entry so the test can seed S.schemaMeta through the SAME module
 * instance the functions read.
 *
 * Run: `npm run test:web`  (node --test).
 */
import { describe, it, before } from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));

let mod;
before(async () => {
  const out = await build({
    stdin: {
      contents:
        "export * from './table-view.ts';\n" +
        "export { setSchemaMeta } from './state.ts';\n",
      resolveDir: join(here, '..'),
      loader: 'ts',
    },
    bundle: true,
    format: 'esm',
    write: false,
    logLevel: 'silent',
  });
  mod = await import('data:text/javascript,' + encodeURIComponent(out.outputFiles[0].text));
});

/** Schema-metadata fixture: is_active is bool everywhere, flag is bool in one
 * table but int in another (ambiguous), score is never bool. */
const META = {
  tables: [
    {
      name: 'users',
      columns: [
        { name: 'id', type: 'INTEGER', driftType: 'int', pk: true },
        { name: 'is_active', type: 'INTEGER', driftType: 'bool', pk: false },
        { name: 'flag', type: 'INTEGER', driftType: 'bool', pk: false },
      ],
    },
    {
      name: 'events',
      columns: [
        { name: 'id', type: 'INTEGER', driftType: 'int', pk: true },
        { name: 'is_active', type: 'INTEGER', driftType: 'bool', pk: false },
        { name: 'flag', type: 'INTEGER', driftType: 'int', pk: false },
        { name: 'score', type: 'REAL', driftType: 'double', pk: false },
      ],
    },
  ],
};

describe('isBooleanColumn (name heuristic)', () => {
  it('matches prefix names', () => {
    assert.equal(mod.isBooleanColumn('is_active'), true);
    assert.equal(mod.isBooleanColumn('has_avatar'), true);
  });

  it('matches suffix names (regression: `\\$` previously matched a literal dollar sign)', () => {
    assert.equal(mod.isBooleanColumn('user_active'), true);
    assert.equal(mod.isBooleanColumn('account_enabled'), true);
    assert.equal(mod.isBooleanColumn('row_deleted'), true);
  });

  it('does not match a name merely containing a bool word mid-string', () => {
    // The suffix must anchor at end-of-string: `_active_since` is a date-ish
    // name, not a bool.
    assert.equal(mod.isBooleanColumn('last_active_since'), false);
    assert.equal(mod.isBooleanColumn('notifications'), false);
  });
});

describe('isBoolSemanticColumn (shared grid/editor predicate)', () => {
  it('driftType bool wins regardless of name or storage type', () => {
    assert.equal(mod.isBoolSemanticColumn('notifications', 'INTEGER', 'bool'), true);
  });

  it('falls back to the name heuristic for INTEGER-affinity types', () => {
    assert.equal(mod.isBoolSemanticColumn('is_active', 'INTEGER', undefined), true);
    // INT/BIGINT count too — the grid and editor previously disagreed here.
    assert.equal(mod.isBoolSemanticColumn('user_active', 'INT', undefined), true);
  });

  it('rejects non-integer storage and non-bool driftType', () => {
    assert.equal(mod.isBoolSemanticColumn('is_active', 'TEXT', undefined), false);
    assert.equal(mod.isBoolSemanticColumn('flag', 'INTEGER', 'int'), false);
  });
});

describe('formatCellValue driftType path', () => {
  it('formats 0/1 as booleans when driftType is bool, even for heuristic-miss names', () => {
    const one = mod.formatCellValue(1, 'notifications', 'INTEGER', 'bool');
    assert.equal(one.wasFormatted, true);
    assert.notEqual(one.formatted, '1');
    const zero = mod.formatCellValue(0, 'notifications', 'INTEGER', 'bool');
    assert.equal(zero.wasFormatted, true);
    assert.notEqual(zero.formatted, '0');
    // Raw value preserved for the hover/copy affordances.
    assert.equal(one.raw, '1');
    assert.equal(zero.raw, '0');
  });

  it('leaves heuristic-miss names raw when driftType is absent', () => {
    const r = mod.formatCellValue(1, 'notifications', 'INTEGER', undefined);
    assert.equal(r.wasFormatted, false);
    assert.equal(r.formatted, '1');
  });
});

describe('isUnambiguousDriftBoolColumn (SQL results, no table context)', () => {
  it('is false with no schema metadata loaded', () => {
    mod.setSchemaMeta(null);
    assert.equal(mod.isUnambiguousDriftBoolColumn('is_active'), false);
  });

  it('is true only when bool in every declaring table', () => {
    mod.setSchemaMeta(META);
    assert.equal(mod.isUnambiguousDriftBoolColumn('is_active'), true);
    // `flag` is bool in users but int in events → ambiguous → raw.
    assert.equal(mod.isUnambiguousDriftBoolColumn('flag'), false);
    assert.equal(mod.isUnambiguousDriftBoolColumn('score'), false);
    assert.equal(mod.isUnambiguousDriftBoolColumn('no_such_column'), false);
  });
});

describe('schemaDriftTypesForTable', () => {
  it('maps a table\'s columns to their drift types, empty for unknown tables', () => {
    mod.setSchemaMeta(META);
    const m = mod.schemaDriftTypesForTable('events');
    assert.equal(m.flag, 'int');
    assert.equal(m.is_active, 'bool');
    assert.deepEqual(mod.schemaDriftTypesForTable('missing'), {});
  });
});
