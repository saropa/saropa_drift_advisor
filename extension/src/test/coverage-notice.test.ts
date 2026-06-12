import * as assert from 'node:assert';

import {
  COVERAGE_THRESHOLD,
  TRANSLATED_LOCALES,
  evaluateCoverageNotice,
  normalizeLocale,
} from '../l10n/coverage-notice';

/**
 * Covers the pure decision logic for the activation coverage notice (plan 75 §2):
 * locale normalization and the show/silent decision. The vscode-bound
 * `maybeShowCoverageNotice` is the thin shell over `evaluateCoverageNotice`, which
 * is what carries the policy and is unit-tested here.
 */
describe('coverage-notice normalizeLocale', () => {
  it('passes through exact catalog tags', () => {
    assert.strictEqual(normalizeLocale('de'), 'de');
    assert.strictEqual(normalizeLocale('pt-br'), 'pt-br');
    assert.strictEqual(normalizeLocale('zh-cn'), 'zh-cn');
  });

  it('lowercases and folds region/script subtags to the catalog tag', () => {
    assert.strictEqual(normalizeLocale('de-AT'), 'de');
    assert.strictEqual(normalizeLocale('pt-BR'), 'pt-br');
    assert.strictEqual(normalizeLocale('zh-Hant-TW'), 'zh-tw');
    assert.strictEqual(normalizeLocale('zh-Hans-CN'), 'zh-cn');
  });

  it('falls back to en for empty or untracked languages', () => {
    assert.strictEqual(normalizeLocale(null), 'en');
    assert.strictEqual(normalizeLocale(''), 'en');
    assert.strictEqual(normalizeLocale('en-US'), 'en');
    assert.strictEqual(normalizeLocale('xx'), 'en');
  });
});

describe('coverage-notice evaluateCoverageNotice', () => {
  it('stays silent for the English source language', () => {
    assert.strictEqual(evaluateCoverageNotice('en', {}, false), null);
    assert.strictEqual(evaluateCoverageNotice('en-GB', { de: 0 }, false), null);
  });

  it('stays silent for an untracked language (no bundle shipped)', () => {
    assert.strictEqual(evaluateCoverageNotice('nl', {}, false), null);
    assert.strictEqual(evaluateCoverageNotice('hi-IN', {}, false), null);
  });

  it('shows for a tracked locale with no bundle yet (0%)', () => {
    const d = evaluateCoverageNotice('de-DE', {}, false);
    assert.ok(d);
    assert.strictEqual(d.locale, 'de');
    assert.strictEqual(d.pct, 0);
    assert.strictEqual(d.languageName, 'German');
  });

  it('shows for a tracked locale below the threshold, naming the percent', () => {
    const d = evaluateCoverageNotice('ja', { ja: 42.6 }, false);
    assert.ok(d);
    assert.strictEqual(d.pct, 43); // rounded
    assert.strictEqual(d.languageName, 'Japanese');
  });

  it('stays silent at or above the coverage threshold', () => {
    assert.strictEqual(evaluateCoverageNotice('fr', { fr: COVERAGE_THRESHOLD }, false), null);
    assert.strictEqual(evaluateCoverageNotice('fr', { fr: 99 }, false), null);
  });

  it('stays silent when already shown for that language', () => {
    assert.strictEqual(evaluateCoverageNotice('de', { de: 0 }, true), null);
  });

  it('only targets the documented translated locale set (en excluded)', () => {
    assert.ok(!TRANSLATED_LOCALES.includes('en'));
    for (const loc of TRANSLATED_LOCALES) {
      const d = evaluateCoverageNotice(loc, {}, false);
      assert.ok(d, `expected a notice decision for tracked locale ${loc}`);
      assert.strictEqual(d.locale, loc);
    }
  });
});
