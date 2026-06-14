/**
 * Tests for the C2b webview CSP backstop: nonce generation, the CSP policy
 * shape, and the secureWebviewHtml post-processor (placeholder swap, CSP meta
 * injection/replacement, delegated dispatcher). The security-defining property
 * is that ONLY author-marked scripts get the nonce — an injected bare <script>
 * (an escaping miss) must stay unstamped and therefore blocked.
 * See plans/full-codebase-audit-2026.06.12.md C2 (C2b).
 */

import * as assert from 'assert';
import {
  getNonce,
  buildWebviewCsp,
  secureWebviewHtml,
  CSP_NONCE_PLACEHOLDER,
} from '../webview-csp';

describe('webview-csp', () => {
  it('getNonce returns a fresh, non-empty value each call', () => {
    const a = getNonce();
    const b = getNonce();
    assert.ok(a.length >= 16, 'nonce should be reasonably long');
    assert.notStrictEqual(a, b, 'nonces must not repeat');
  });

  it('CSP locks script-src to the nonce with no unsafe-inline', () => {
    const csp = buildWebviewCsp('NONCE123');
    assert.ok(csp.includes("default-src 'none'"));
    assert.ok(csp.includes("script-src 'nonce-NONCE123'"));
    assert.ok(
      !/script-src[^;]*'unsafe-inline'/.test(csp),
      'script-src must NOT carry unsafe-inline',
    );
  });

  it('extra origins extend the relevant directive only', () => {
    const csp = buildWebviewCsp('N', {
      scriptSrc: ['http://127.0.0.1:8642'],
      connectSrc: ['http://127.0.0.1:8642'],
    });
    assert.ok(csp.includes("script-src 'nonce-N' http://127.0.0.1:8642"));
    assert.ok(csp.includes('connect-src http://127.0.0.1:8642'));
  });

  it('swaps the author placeholder for the page nonce and injects the CSP', () => {
    const html =
      `<html><head></head><body>`
      + `<script nonce="${CSP_NONCE_PLACEHOLDER}">x()</script></body></html>`;
    const out = secureWebviewHtml(html);
    const meta = out.match(/content="([^"]+)"/);
    assert.ok(meta, 'a CSP meta should be present');
    const nonce = meta![1].match(/'nonce-([^']+)'/)![1];
    assert.ok(
      out.includes(`<script nonce="${nonce}">x()`),
      'the author script should carry the page nonce',
    );
    assert.ok(
      !out.includes(CSP_NONCE_PLACEHOLDER),
      'no raw placeholder may survive into the output',
    );
  });

  it('does NOT stamp an injected bare <script> (the escaping-miss backstop)', () => {
    // Simulates a build function that forgot to escape a DB cell value, so a
    // raw <script> reached the document. It has no placeholder, so it must get
    // no nonce and is therefore rejected by script-src 'nonce-…'.
    const html =
      `<html><head></head><body>`
      + `<script nonce="${CSP_NONCE_PLACEHOLDER}">legit()</script>`
      + `<div><script>alert(document.cookie)</script></div>`
      + `</body></html>`;
    const out = secureWebviewHtml(html);
    const nonce = out.match(/'nonce-([^']+)'/)![1];
    assert.ok(out.includes(`<script nonce="${nonce}">legit()`),
      'the author script is stamped');
    assert.ok(
      out.includes('<script>alert(document.cookie)</script>'),
      'the injected script stays unstamped → blocked by the CSP',
    );
    assert.ok(
      !out.includes(`<script nonce="${nonce}">alert(document.cookie)`),
      'the injected script must never receive the page nonce',
    );
  });

  it('replaces an existing CSP meta rather than adding a second', () => {
    const html =
      '<html><head><meta http-equiv="Content-Security-Policy" '
      + "content=\"default-src 'none'; script-src 'unsafe-inline';\">"
      + '</head><body></body></html>';
    const out = secureWebviewHtml(html);
    const count = (out.match(/Content-Security-Policy/g) || []).length;
    assert.strictEqual(count, 1, 'exactly one CSP meta');
    assert.ok(
      !out.includes("script-src 'unsafe-inline'"),
      'the old unsafe-inline policy must be gone',
    );
  });

  it('appends the delegated dispatcher before </body>', () => {
    const out = secureWebviewHtml('<html><head></head><body></body></html>');
    assert.ok(out.includes("['click', 'change', 'input', 'submit']"));
    assert.ok(/<script nonce="[^"]+">\(function\(\)\{/.test(out));
  });
});
