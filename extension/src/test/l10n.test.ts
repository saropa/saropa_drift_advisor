import * as assert from 'node:assert';

import { t, englishOf, getWebviewL10nMap } from '../l10n';
import { hostStrings } from '../l10n/strings-host';

/**
 * Covers the host localization runtime (plan 75 §3.3, src/l10n.ts): symbolic-key
 * resolution, fail-soft on unknown keys, `{0}` argument substitution (via the
 * mocked vscode.l10n.t), and the webview-injection map builder. Pins the contract
 * the upcoming string sweep depends on — that `t()` always returns SOMETHING
 * renderable and never throws on a missing key.
 */
describe('host l10n runtime', () => {
  it('resolves a known symbolic key to its English source string', () => {
    // No translation bundle in tests, so vscode.l10n.t returns English verbatim.
    const key = 'host.dialog.cancel';
    assert.strictEqual(t(key), hostStrings[key]);
    assert.strictEqual(t(key), 'Cancel');
  });

  it('substitutes positional {0} arguments', () => {
    // host.msg.serverConnected === 'Connected to Drift debug server at {0}'
    assert.strictEqual(
      t('host.msg.serverConnected', '127.0.0.1:8642'),
      'Connected to Drift debug server at 127.0.0.1:8642',
    );
  });

  it('fail-soft: an unknown key returns the key itself, never throws', () => {
    assert.strictEqual(t('host.does.not.exist'), 'host.does.not.exist');
  });

  it('englishOf returns the untranslated source string (or the key when missing)', () => {
    assert.strictEqual(englishOf('host.dialog.discardEdits.ok'), 'Discard');
    assert.strictEqual(englishOf('nope.missing'), 'nope.missing');
  });

  it('getWebviewL10nMap returns every key when no prefix filter is given', () => {
    const map = getWebviewL10nMap();
    assert.strictEqual(Object.keys(map).length, Object.keys(hostStrings).length);
    assert.strictEqual(map['host.dialog.cancel'], 'Cancel');
  });

  it('getWebviewL10nMap filters to the requested key prefixes', () => {
    const map = getWebviewL10nMap(['host.pick.']);
    const keys = Object.keys(map);
    assert.ok(keys.length > 0, 'expected at least one host.pick.* key');
    assert.ok(keys.every((k) => k.startsWith('host.pick.')), `unexpected keys: ${keys.join(', ')}`);
    assert.ok(!('host.dialog.cancel' in map), 'non-matching key must be excluded');
  });
});
