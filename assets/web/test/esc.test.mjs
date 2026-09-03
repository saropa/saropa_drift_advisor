/**
 * Regression test for plans/history/2026.09/20260902/004_web_viewer_xss_esc_missing_quote_escaping.md.
 *
 * `esc()` (utils.ts) is the web viewer's only general-purpose HTML escaper and
 * is used in ~325 places, most of them inside quoted HTML attributes carrying
 * database-supplied text. It previously escaped only `& < >` (a textContent ->
 * innerHTML round-trip, which never escapes quotes in a text node), so a `"`
 * in a cell value broke out of an attribute and let the rest of the value be
 * parsed as new attributes — including event-handler attributes such as
 * `onmouseover=` (stored XSS). This test pins the fix: quotes must now be
 * escaped too, and the escaped output must survive being re-parsed as an
 * attribute value without breaking out.
 *
 * Run: `npm run test:web` (node --test).
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));

// esc() is TypeScript bundled into the web app; there is no JS runtime for it
// in unit tests, so — like the other web-viewer test harnesses — esbuild
// compiles the real utils.ts to an in-memory ESM module and the tests
// exercise the actual export.
const out = await build({
  entryPoints: [join(here, '..', 'utils.ts')],
  bundle: true,
  format: 'esm',
  write: false,
  logLevel: 'silent',
});
const mod = await import('data:text/javascript,' + encodeURIComponent(out.outputFiles[0].text));
const { esc } = mod;

describe('esc', () => {
  it('returns an empty string for null/undefined', () => {
    assert.equal(esc(null), '');
    assert.equal(esc(undefined), '');
  });

  it('escapes ampersand and angle brackets', () => {
    assert.equal(esc('<b>a & b</b>'), '&lt;b&gt;a &amp; b&lt;/b&gt;');
  });

  it('escapes double quotes so a value cannot break out of a "..." attribute', () => {
    // The exact payload from bugs/004's Steps to Reproduce.
    const payload = '" onmouseover="document.title=\'PWNED\'" x="';
    const escaped = esc(payload);
    assert.ok(!escaped.includes('"'), `expected no bare " in escaped output, got: ${escaped}`);
    assert.equal(escaped, '&quot; onmouseover=&quot;document.title=&#39;PWNED&#39;&quot; x=&quot;');
  });

  it('escapes single quotes so a value cannot break out of a \'...\' attribute', () => {
    assert.equal(esc("' onmouseover='alert(1)"), '&#39; onmouseover=&#39;alert(1)');
  });

  it('round-trips through a quoted attribute without leaking a second attribute', () => {
    // Regression proof, without pulling in a DOM/jsdom dependency: build the
    // same markup shape table-view.ts emits (`data-raw="' + esc(value) + '"`)
    // and confirm the escaped value contains no bare `"`. That is exactly the
    // property an HTML parser relies on to keep the whole value inside the
    // one `data-raw` attribute instead of terminating it early and parsing
    // the rest (e.g. `onmouseover=`) as a second attribute.
    const evil = '" onmouseover="document.title=\'PWNED\'" x="';
    const html = `<button data-raw="${esc(evil)}">x</button>`;
    // The only `"` characters in the markup are the two that open/close the
    // attribute itself; every quote from the payload has been escaped away.
    const quoteCount = (html.match(/"/g) || []).length;
    assert.equal(quoteCount, 2, `expected only the attribute's own quotes, got: ${html}`);
    assert.ok(!html.includes('onmouseover="document'), `payload was not neutralized: ${html}`);
  });

  it('round-trips a table name containing a double quote (the non-malicious repro case)', () => {
    // A plain quoted SQL identifier like `a"b` is enough to corrupt an
    // attribute even with no attacker involved (bugs/004 "Minimal
    // Reproducible Example"). Confirm it no longer breaks the attribute.
    const name = 'a"b';
    const html = `<div data-table="${esc(name)}"></div>`;
    assert.equal((html.match(/"/g) || []).length, 2, `expected only the attribute's own quotes, got: ${html}`);
  });
});
