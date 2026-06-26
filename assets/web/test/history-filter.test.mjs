/**
 * Unit tests for the History sidebar's filter predicate (history-filter.ts).
 *
 * The predicate is TypeScript bundled into the web app; there is no JS runtime
 * for it in unit tests, so — like the home-search harness — esbuild compiles
 * the real `history-filter.ts` to an in-memory ESM module and the tests
 * exercise the actual export. history-filter.ts is intentionally DOM-free so it
 * bundles cleanly here (the rest of history-sidebar.ts is not).
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
  entryPoints: [join(here, '..', 'history-filter.ts')],
  bundle: true,
  format: 'esm',
  write: false,
  logLevel: 'silent',
});
const mod = await import(
  'data:text/javascript,' + encodeURIComponent(out.outputFiles[0].text)
);
const { entryMatchesHistoryFilter } = mod;

const e = (sql, source) => ({ sql, source });

describe('entryMatchesHistoryFilter — source filter', () => {
  it("'all' matches every source", () => {
    assert.equal(entryMatchesHistoryFilter(e('SELECT 1', 'browser'), 'all', ''), true);
    assert.equal(entryMatchesHistoryFilter(e('SELECT 1', 'app'), 'all', ''), true);
    assert.equal(entryMatchesHistoryFilter(e('SELECT 1', 'internal'), 'all', ''), true);
  });

  it('an exact source filter excludes other sources', () => {
    assert.equal(entryMatchesHistoryFilter(e('SELECT 1', 'app'), 'app', ''), true);
    assert.equal(entryMatchesHistoryFilter(e('SELECT 1', 'browser'), 'app', ''), false);
  });
});

describe('entryMatchesHistoryFilter — text search', () => {
  it('empty/blank query imposes no text constraint', () => {
    assert.equal(entryMatchesHistoryFilter(e('SELECT * FROM users', 'app'), 'all', ''), true);
    assert.equal(entryMatchesHistoryFilter(e('SELECT * FROM users', 'app'), 'all', '   '), true);
  });

  it('matches a case-insensitive substring of the SQL', () => {
    const row = e('SELECT * FROM Users WHERE id = 1', 'browser');
    assert.equal(entryMatchesHistoryFilter(row, 'all', 'users'), true);
    assert.equal(entryMatchesHistoryFilter(row, 'all', 'USERS'), true);
    assert.equal(entryMatchesHistoryFilter(row, 'all', 'where id'), true);
  });

  it('excludes rows whose SQL lacks the substring', () => {
    assert.equal(
      entryMatchesHistoryFilter(e('SELECT * FROM users', 'app'), 'all', 'orders'),
      false,
    );
  });

  it('trims surrounding whitespace before matching', () => {
    assert.equal(
      entryMatchesHistoryFilter(e('SELECT * FROM orders', 'app'), 'all', '  orders  '),
      true,
    );
  });
});

describe('entryMatchesHistoryFilter — combined source + text', () => {
  it('requires BOTH the source and the substring to pass', () => {
    const row = e('SELECT * FROM orders', 'browser');
    // Right source, right text → in.
    assert.equal(entryMatchesHistoryFilter(row, 'browser', 'orders'), true);
    // Right source, wrong text → out.
    assert.equal(entryMatchesHistoryFilter(row, 'browser', 'users'), false);
    // Wrong source, right text → out.
    assert.equal(entryMatchesHistoryFilter(row, 'app', 'orders'), false);
  });
});
