/**
 * Tests for the refine-in-English loop helpers (Feature 18 polish).
 *
 * `detectRefinement` classifies a follow-up as a refinement of the previous
 * question and extracts the fragment to append; `combineRefinement` builds the
 * combined English the converter re-parses. Both are pure — exercised here via
 * the real exported functions (esbuilt from nl-to-sql.ts) plus a round-trip
 * through `nlToSql` to confirm a refined question yields the merged SQL.
 *
 * Run: `npm run test:web`  (node --test).
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { loadModule, makeDb } from './helpers.mjs';
import { relational } from './fixtures.mjs';

const mod = await loadModule();
const { detectRefinement, combineRefinement, nlToSql } = mod;

describe('detectRefinement', () => {
  it('treats leading additive connectives as refinements', () => {
    for (const q of [
      'now only active',
      'and sorted by name',
      'also from last week',
      'just the active ones',
      'only active',
      'then top 10',
      'plus has email',
      'filter to active',
      'narrow it to active',
      'restrict to gmail',
    ]) {
      assert.equal(detectRefinement(q).isRefinement, true, q);
    }
  });

  it('strips the connective and keeps the meaningful fragment', () => {
    assert.equal(detectRefinement('now only active').fragment, 'only active');
    assert.equal(detectRefinement('and sorted by name').fragment, 'sorted by name');
    assert.equal(detectRefinement('filter to active').fragment, 'active');
    assert.equal(detectRefinement('narrow it to gmail').fragment, 'gmail');
  });

  it('treats a fresh question as NOT a refinement', () => {
    for (const q of [
      'active contacts',
      'how many users created today',
      'contacts sorted by name', // no leading connective
      'show 20 orders',
    ]) {
      assert.equal(detectRefinement(q).isRefinement, false, q);
      assert.equal(detectRefinement(q).fragment, q);
    }
  });

  it('is not fooled by a connective with no fragment after it', () => {
    // "and" / "only" alone carry no refinement payload.
    assert.equal(detectRefinement('and').isRefinement, false);
    assert.equal(detectRefinement('only ').isRefinement, false);
  });
});

describe('combineRefinement', () => {
  it('appends the fragment and collapses whitespace', () => {
    assert.equal(
      combineRefinement('active contacts', 'from last week'),
      'active contacts from last week',
    );
    assert.equal(
      combineRefinement('  active   contacts ', '  sorted by name '),
      'active contacts sorted by name',
    );
  });
});

describe('refine round-trip through nlToSql', () => {
  const meta = relational.meta;

  it('a refined question produces the merged SQL', () => {
    // Base question alone.
    const base = 'users created this week';
    const baseSql = nlToSql(base, meta).sql;
    assert.ok(baseSql, 'base question should convert');

    // Refinement: "and sorted by name" → combined adds an ORDER BY without
    // dropping the date filter from the base.
    const ref = detectRefinement('and sorted by name');
    assert.equal(ref.isRefinement, true);
    const combined = combineRefinement(base, ref.fragment);
    const refinedSql = nlToSql(combined, meta).sql;
    assert.ok(refinedSql, 'combined question should convert');
    assert.match(refinedSql, /order by/i);
    // The original date filter survives the refinement.
    assert.match(refinedSql, /where/i);

    // Both run against the fixture DB without error.
    const db = makeDb(relational);
    try {
      db.prepare(refinedSql).all();
    } finally {
      db.close();
    }
  });
});
