/**
 * Unit tests for the Home tab feature-search matcher (home-search.ts).
 *
 * The matcher is TypeScript bundled into the web app; there is no JS runtime for
 * it in unit tests, so — like the NL→SQL harness — esbuild compiles the real
 * `home-search.ts` to an in-memory ESM module and the tests exercise the actual
 * exports. home-search.ts is intentionally DOM-free so it bundles cleanly here.
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
  entryPoints: [join(here, '..', 'home-search.ts')],
  bundle: true,
  format: 'esm',
  write: false,
  logLevel: 'silent',
});
const mod = await import('data:text/javascript,' + encodeURIComponent(out.outputFiles[0].text));
const { buildSearchTokens, fuzzySubsequence, tokensMatch } = mod;

describe('buildSearchTokens', () => {
  it('splits label and blurb into lower-cased words', () => {
    const t = buildSearchTokens('Run SQL', 'editor, templates', []);
    assert.ok(t.includes('run'));
    assert.ok(t.includes('sql'));
    assert.ok(t.includes('editor'));
    assert.ok(t.includes('templates'));
  });

  it('keeps multi-word keyword phrases whole', () => {
    const t = buildSearchTokens('Snapshot', 'capture schema', ['time travel']);
    // The phrase survives as one token so a phrase substring match works.
    assert.ok(t.includes('time travel'));
  });

  it('de-duplicates tokens', () => {
    const t = buildSearchTokens('CSV', 'csv import', ['csv']);
    assert.equal(t.filter((x) => x === 'csv').length, 1);
  });

  it('drops punctuation and empties', () => {
    const t = buildSearchTokens('Mask PII', 'redact, sensitive — columns', []);
    assert.ok(!t.includes(''));
    assert.ok(t.includes('redact'));
    assert.ok(t.includes('sensitive'));
    assert.ok(t.includes('columns'));
  });
});

describe('fuzzySubsequence', () => {
  it('matches an in-order subsequence', () => {
    assert.equal(fuzzySubsequence('anmly', 'anomaly'), true);
    assert.equal(fuzzySubsequence('thm', 'theme'), true);
  });

  it('rejects out-of-order characters', () => {
    assert.equal(fuzzySubsequence('emeht', 'theme'), false);
  });

  it('rejects characters not present', () => {
    assert.equal(fuzzySubsequence('xyz', 'theme'), false);
  });

  it('an empty query is trivially a subsequence', () => {
    assert.equal(fuzzySubsequence('', 'anything'), true);
  });
});

describe('tokensMatch', () => {
  const themeTokens = buildSearchTokens('Theme', 'light, dark, showcase, midnight', [
    'appearance',
    'color',
    'palette',
  ]);
  const diffTokens = buildSearchTokens('DB diff', 'diff databases, migrations', [
    'difference',
    'delta',
    'drift',
  ]);

  it('matches a tool by its exact label word', () => {
    assert.equal(tokensMatch('theme', themeTokens), true);
  });

  it('matches a synonym that is not the tool name', () => {
    // "appearance"/"palette" are dictionary synonyms, not the label or blurb.
    assert.equal(tokensMatch('palette', themeTokens), true);
    assert.equal(tokensMatch('appearance', themeTokens), true);
  });

  it('matches via fuzzy subsequence on a typo', () => {
    assert.equal(tokensMatch('aprnce', themeTokens), true); // a-p-r-n-c-e ⊂ appearance
  });

  it('matches a substring inside a longer keyword', () => {
    assert.equal(tokensMatch('migra', diffTokens), true); // substring of "migrations"
  });

  it('does not match an unrelated query', () => {
    assert.equal(tokensMatch('redact', themeTokens), false);
  });

  it('an empty query matches every card (full grid restored)', () => {
    assert.equal(tokensMatch('', themeTokens), true);
    assert.equal(tokensMatch('', diffTokens), true);
  });
});
