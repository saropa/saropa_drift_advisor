/**
 * Tests for the "Hey Saropa" wake phrase + narrative answer (Feature 79).
 *
 * Covers: the wake-phrase catch-net (many spellings / mishearings, start-only),
 * that stripping never changes the generated SQL, the answerKind / answerVerb
 * metadata each branch records, and the pure narrateAnswer sentence templates.
 *
 * Run: `npm run test:web`  (node --test).
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { loadModule, makeDb } from './helpers.mjs';
import { relational } from './fixtures.mjs';

const mod = await loadModule();
const { nlToSql, stripWakePhrase, narrateAnswer } = mod;
const rel = relational.meta;

// Mirrors nlExactCount() in nl-modal.ts: strip the trailing LIMIT, wrap in
// COUNT(*), run against the fixture DB — so the narrated total is the true count.
function exactCount(sql) {
  const inner = String(sql).replace(/;\s*$/, '').replace(/\s+limit\s+\d+\s*$/i, '');
  const db = makeDb(relational);
  try {
    const row = db.prepare('SELECT COUNT(*) AS n FROM (' + inner + ')').get();
    return Number(row.n);
  } finally {
    db.close();
  }
}

// ─────────────────────────────────────────────────────────────────────────
describe('stripWakePhrase — catch-net', () => {
  // Every variant, prefixed to the same question, must strip to that question.
  const variants = [
    'hey saropa', 'Hey Saropa', 'saropa', 'Saropa', 'SAROPA',
    'hi saropa', 'hello saropa', 'ok saropa', 'okay saropa', 'yo saropa',
    'hey there saropa', 'please saropa', 'um saropa', 'uhh saropa',
    'hey seropa', 'hey siropa', 'hey soropa', 'hey zaropa',
    'saropah', 'saroppa', 'saroper', 'sropa', 'sarppa',
    'sa ropa', 'sar opa', 'sara opa', 'say ropa',
  ];
  for (const v of variants) {
    it(`strips "${v}, …"`, () => {
      const r = stripWakePhrase(v + ', how many contacts');
      assert.equal(r.wake, true);
      assert.equal(r.question, 'how many contacts');
    });
  }

  it('strips a name directly followed by the question (no comma)', () => {
    const r = stripWakePhrase('saropa how many contacts');
    assert.equal(r.wake, true);
    assert.equal(r.question, 'how many contacts');
  });

  it('treats a bare wake phrase as wake with an empty remainder', () => {
    const r = stripWakePhrase('hey saropa');
    assert.equal(r.wake, true);
    assert.equal(r.question, '');
  });
});

describe('stripWakePhrase — does NOT over-strip', () => {
  it('a bare greeting (no name) is not a wake phrase', () => {
    const r = stripWakePhrase('hey, how many contacts');
    assert.equal(r.wake, false);
    assert.equal(r.question, 'hey, how many contacts');
  });

  it('a mid-question "saropa" (a value) is left intact', () => {
    const r = stripWakePhrase('find the saropa account');
    assert.equal(r.wake, false);
    assert.equal(r.question, 'find the saropa account');
  });

  it('does not eat a word that merely starts with the name', () => {
    // "saropaccounts" is one token: the name needs a trailing separator/end.
    const r = stripWakePhrase('saropaccounts please');
    assert.equal(r.wake, false);
    assert.equal(r.question, 'saropaccounts please');
  });
});

// ─────────────────────────────────────────────────────────────────────────
describe('wake phrase never changes the SQL', () => {
  const pairs = [
    ['how many contacts changed today', 'hey saropa, how many contacts changed today'],
    ['average age of contacts', 'saropa, average age of contacts'],
    ['contacts added last week', 'hey saropa contacts added last week'],
    ['show contacts by status', 'ok saropa, show contacts by status'],
  ];
  for (const [plain, woken] of pairs) {
    it(`"${woken}" == "${plain}"`, () => {
      assert.equal(nlToSql(woken, rel).sql, nlToSql(plain, rel).sql);
    });
  }

  it('sets wake:true on the woken result, wake:false on the plain one', () => {
    assert.equal(nlToSql('hey saropa, how many contacts', rel).wake, true);
    assert.equal(nlToSql('how many contacts', rel).wake, false);
  });

  it('wake phrase with no question yields no SQL (not an error)', () => {
    const r = nlToSql('hey saropa', rel);
    assert.equal(r.sql, null);
    assert.equal(r.wake, true);
    assert.equal(r.error, undefined);
  });
});

// ─────────────────────────────────────────────────────────────────────────
describe('answerKind / answerVerb metadata', () => {
  const kind = (q) => nlToSql(q, rel).answerKind;
  const verb = (q) => nlToSql(q, rel).answerVerb;

  it('count + birth verb → added', () => {
    const r = nlToSql('how many contacts were added last week', rel);
    assert.equal(r.answerKind, 'count');
    assert.equal(r.answerVerb, 'added');
  });
  it('count + edit verb → changed', () => {
    const r = nlToSql('how many contacts changed today', rel);
    assert.equal(r.answerKind, 'count');
    assert.equal(r.answerVerb, 'changed');
  });
  it('count, no verb → has', () => {
    assert.equal(verb('how many contacts'), 'has');
  });

  it('records the aggregate shapes', () => {
    assert.equal(kind('total balance of contacts'), 'sum');
    assert.equal(kind('average age of contacts'), 'avg');
    assert.equal(kind('highest balance'), 'max');
    assert.equal(kind('lowest age in contacts'), 'min');
    assert.equal(kind('distinct status in contacts'), 'distinct');
    assert.equal(kind('duplicate emails in contacts'), 'duplicate');
    assert.equal(kind('contacts by status'), 'group');
    assert.equal(kind('newest contacts'), 'latest');
    assert.equal(kind('oldest contacts'), 'oldest');
    assert.equal(kind('show contacts'), 'rows');
  });

  it('carries the aggregated column for sum/avg', () => {
    assert.equal(nlToSql('total balance of contacts', rel).aggColumn, 'balance');
    assert.equal(nlToSql('average age of contacts', rel).aggColumn, 'age');
  });

  it('echoes the user temporal phrase as the qualifier', () => {
    assert.equal(nlToSql('how many contacts changed today', rel).qualifier, 'today');
  });
});

// ─────────────────────────────────────────────────────────────────────────
describe('narrateAnswer — sentence templates', () => {
  it('count with a window names the verb and echoes the phrase', () => {
    const s = narrateAnswer(
      { answerKind: 'count', answerVerb: 'added', table: 'contacts', qualifier: 'last week' },
      45, null,
    );
    assert.equal(s, 'Your database added 45 contacts last week.');
  });

  it('count without a window falls back to "has"', () => {
    const s = narrateAnswer(
      { answerKind: 'count', answerVerb: 'added', table: 'contacts', qualifier: '' },
      45, null,
    );
    assert.equal(s, 'Your database has 45 contacts.');
  });

  it('formats large numbers with grouping', () => {
    const s = narrateAnswer(
      { answerKind: 'sum', table: 'accounts', aggColumn: 'balance', qualifier: '' },
      12400, null,
    );
    assert.equal(s, 'The total balance across accounts is 12,400.');
  });

  it('avg / max / min read naturally', () => {
    assert.equal(
      narrateAnswer({ answerKind: 'avg', table: 'contacts', aggColumn: 'age', qualifier: '' }, 41, null),
      'The average age for contacts is 41.',
    );
    assert.equal(
      narrateAnswer({ answerKind: 'max', table: 'accounts', aggColumn: 'balance', qualifier: '' }, 9800, null),
      'The highest balance for accounts is 9,800.',
    );
    assert.equal(
      narrateAnswer({ answerKind: 'min', table: 'accounts', aggColumn: 'balance', qualifier: '' }, 0, null),
      'The lowest balance for accounts is 0.',
    );
  });

  it('row / group answers use the exact total count', () => {
    assert.equal(
      narrateAnswer({ answerKind: 'rows', table: 'contacts', qualifier: 'today' }, null, 7),
      'Found 7 contacts today.',
    );
    assert.equal(
      narrateAnswer({ answerKind: 'group', table: 'contacts', qualifier: '' }, null, 3),
      '3 groups of contacts.',
    );
  });
});

// ─────────────────────────────────────────────────────────────────────────
describe('narration end-to-end (real SQLite)', () => {
  it('counts ALL rows for a row answer, not the LIMITed preview', () => {
    // "show contacts" → SELECT * … LIMIT 50; the narrated total must be the full
    // 4 seeded rows, proving the trailing LIMIT is stripped before COUNT(*).
    const r = nlToSql('hey saropa, show contacts', rel);
    assert.equal(r.answerKind, 'rows');
    const total = exactCount(r.sql);
    assert.equal(total, 4);
    assert.equal(narrateAnswer(r, null, total), 'Found 4 contacts.');
  });

  it('reads the single cell for a scalar count answer', () => {
    // The scalar path reads the aggregate cell directly (no COUNT wrapper).
    const r = nlToSql('hey saropa, how many contacts are there', rel);
    assert.equal(r.answerKind, 'count');
    const db = makeDb(relational);
    const value = Number(db.prepare(r.sql).get()['COUNT(*)']);
    db.close();
    assert.equal(value, 4);
    assert.equal(narrateAnswer(r, value, null), 'Your database has 4 contacts.');
  });

  it('groups: counts the number of GROUP BY buckets', () => {
    // contacts.status has 3 distinct values across 4 rows (active×2, pending, closed).
    const r = nlToSql('hey saropa, contacts by status', rel);
    assert.equal(r.answerKind, 'group');
    const total = exactCount(r.sql);
    assert.equal(total, 3);
    assert.equal(narrateAnswer(r, null, total), '3 groups of contacts.');
  });
});
