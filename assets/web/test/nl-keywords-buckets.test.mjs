/**
 * Tests for the Ask panel's voice/keyword commands (item 5), multi-window
 * conditional counts (item 6), and recursive time-bucket series (item 7).
 *
 * Covers: detectNlKeyword's three command shapes and its negatives (a real
 * query must never be hijacked), applyTemporalSwap's window rewrite, and that
 * the multi-window count + bucket-series SQL actually RUN against SQLite and
 * return the expected shape.
 *
 * Run: `npm run test:web`  (node --test).
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { loadModule, makeDb } from './helpers.mjs';
import { relational } from './fixtures.mjs';

const mod = await loadModule();
const { nlToSql, detectNlKeyword, applyTemporalSwap } = mod;
const rel = relational.meta;

/** Runs generated SQL against a fresh fixture DB and returns all rows. */
function run(sql) {
  const db = makeDb(relational);
  try {
    return db.prepare(String(sql).replace(/;\s*$/, '')).all();
  } finally {
    db.close();
  }
}

// ─────────────────────────────────────────────────────────────────────────
describe('detectNlKeyword — clear', () => {
  for (const t of ['clear', 'Clear', 'clear it', 'start again', 'start over', 'reset', 'never mind', 'scratch that']) {
    it(`"${t}" → clear`, () => {
      assert.deepEqual(detectNlKeyword(t), { kind: 'clear' });
    });
  }
});

describe('detectNlKeyword — run again', () => {
  for (const t of ['run again', 'run it again', 'do it again', 'again', 'once more', 'try again']) {
    it(`"${t}" → run`, () => {
      assert.deepEqual(detectNlKeyword(t), { kind: 'run' });
    });
  }
});

describe('detectNlKeyword — temporal swap', () => {
  const cases = [
    ['last year', 'last year'],
    ['what about last year', 'last year'],
    ['how about this week', 'this week'],
    ['and last month', 'last month'],
    ['what about yesterday?', 'yesterday'],
  ];
  for (const [input, phrase] of cases) {
    it(`"${input}" → swap ${phrase}`, () => {
      assert.deepEqual(detectNlKeyword(input), { kind: 'temporalSwap', phrase });
    });
  }
});

describe('detectNlKeyword — negatives (real queries are not commands)', () => {
  // A genuine question that merely contains a command word must return null so
  // it is parsed as a query, not swallowed as a command.
  for (const t of [
    'how many contacts',
    'contacts with a clear flag set',
    'contacts created last year in the west region',
    'show me active contacts',
    '',
  ]) {
    it(`"${t}" → null`, () => {
      assert.equal(detectNlKeyword(t), null);
    });
  }
});

describe('applyTemporalSwap', () => {
  it('swaps the window in the base question', () => {
    assert.equal(
      applyTemporalSwap('contacts added last month', 'last year'),
      'contacts added last year',
    );
  });
  it('returns null when the base has no recognized window', () => {
    assert.equal(applyTemporalSwap('all active contacts', 'last year'), null);
  });
});

// ─────────────────────────────────────────────────────────────────────────
describe('multi-window conditional count (item 6)', () => {
  it('builds one SUM(CASE …) per window and runs', () => {
    const r = nlToSql('how many contacts were added this year and last month', rel);
    assert.ok(r.sql, 'expected SQL');
    // Two conditional sums, aliased by the window phrase.
    const sums = (r.sql.match(/SUM\(CASE WHEN/g) || []).length;
    assert.equal(sums, 2, 'expected two conditional sums:\n' + r.sql);
    assert.match(r.sql, /AS this_year/);
    assert.match(r.sql, /AS last_month/);
    const rows = run(r.sql);
    assert.equal(rows.length, 1, 'a conditional count returns exactly one row');
    const keys = Object.keys(rows[0]);
    assert.deepEqual(keys, ['this_year', 'last_month']);
    // Both cells are integers (the COUNT can be 0 but never null/NaN).
    for (const k of keys) assert.equal(typeof rows[0][k], 'number');
  });

  it('does not fire for a single-window count (stays a scalar COUNT)', () => {
    const r = nlToSql('how many contacts were added last month', rel);
    assert.ok(r.sql);
    assert.doesNotMatch(r.sql, /SUM\(CASE WHEN/);
    assert.match(r.sql, /SELECT COUNT\(\*\)/);
  });
});

// ─────────────────────────────────────────────────────────────────────────
describe('recursive time-bucket series (item 7)', () => {
  it('weekly: builds a recursive calendar CTE and runs (empty weeks → 0)', () => {
    const r = nlToSql('show me the weekly contacts added', rel);
    assert.ok(r.sql, 'expected SQL');
    assert.match(r.sql, /WITH RECURSIVE calendar/);
    assert.match(r.sql, /LEFT JOIN "contacts"/);
    assert.match(r.sql, /GROUP BY c\.bucket/);
    const rows = run(r.sql);
    assert.equal(rows.length, 12, 'twelve weekly buckets');
    const keys = Object.keys(rows[0]);
    assert.deepEqual(keys, ['week_start', 'contacts_added']);
    // Every bucket has a (possibly zero) integer count — the LEFT JOIN keeps
    // empty weeks rather than dropping them.
    for (const row of rows) assert.equal(typeof row.contacts_added, 'number');
  });

  it('"contacts added monthly" also routes to a bucket series', () => {
    const r = nlToSql('contacts added monthly', rel);
    assert.ok(r.sql);
    assert.match(r.sql, /WITH RECURSIVE calendar/);
    assert.match(r.sql, /AS month_start/);
    const rows = run(r.sql);
    assert.equal(rows.length, 12, 'twelve monthly buckets');
  });

  it('falls through to a plain query when no bucket word is present', () => {
    const r = nlToSql('contacts added last week', rel);
    assert.ok(r.sql);
    assert.doesNotMatch(r.sql, /WITH RECURSIVE/);
  });
});
