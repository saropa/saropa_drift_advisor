/**
 * Per-render Content-Security-Policy + nonce for every webview panel, plus the
 * delegated-event dispatcher that stands in for inline `on*` handlers.
 *
 * Why this exists: webview HTML renders untrusted database content (table and
 * column names, cell values, SQLite error text). A strict CSP is the backstop
 * so that any escaping miss is an inert rendering bug instead of script
 * execution in the developer's editor. `script-src 'nonce-<n>'` means only the
 * tags stamped here can run; injected markup carrying a `<script>` cannot guess
 * the per-render nonce, so it never executes.
 *
 * A nonce does NOT enable inline event handlers (`onclick="..."`); the CSP
 * blocks those regardless of how the node was created. So panels express their
 * handlers as `data-<event>` attributes and one delegated listener
 * (`delegatedDispatcherScript`) dispatches them — see the helper's doc below.
 *
 * `style-src` deliberately keeps `'unsafe-inline'`: inline `style=` attributes
 * are pervasive across the panels and cannot carry a nonce, and style injection
 * is not code execution — `default-src 'none'` already removes every
 * exfiltration channel (no connect/img/font to an attacker origin). Locking
 * scripts is the security-defining change; locking styles would be enormous
 * churn for no real gain. See plans/history/2026.06/2026.06.12/full-codebase-audit-2026.06.12.md C2 (C2b).
 */

import * as crypto from 'crypto';

import { getWebviewTokens } from './views/design-tokens';

/** A fresh, unguessable per-render nonce. 128 bits is ample for a CSP nonce. */
export function getNonce(): string {
  return crypto.randomBytes(16).toString('base64');
}

/**
 * Extra allowed origins per directive, for the few panels that load external
 * resources (the data-grid webview pulls bundle.js + CDN fallbacks). Standard
 * panels pass nothing and get the strict default policy.
 */
export interface WebviewCspOptions {
  scriptSrc?: string[];
  styleSrc?: string[];
  connectSrc?: string[];
  imgSrc?: string[];
  fontSrc?: string[];
}

/** Build the CSP header value for a webview render with the given nonce. */
export function buildWebviewCsp(nonce: string, opts: WebviewCspOptions = {}): string {
  const dir = (name: string, base: string[], extra?: string[]): string =>
    `${name} ${[...base, ...(extra ?? [])].join(' ')}`.trimEnd();

  const directives = [
    `default-src 'none'`,
    dir('script-src', [`'nonce-${nonce}'`], opts.scriptSrc),
    dir('style-src', [`'unsafe-inline'`], opts.styleSrc),
    dir('img-src', [`'self'`, 'data:', 'blob:'], opts.imgSrc),
    dir('font-src', [`'self'`, 'data:'], opts.fontSrc),
  ];
  // connect-src only when a panel actually talks to a server; omitting it
  // leaves default-src 'none' to block all fetch/XHR, which is the safe default.
  if (opts.connectSrc?.length) {
    directives.push(dir('connect-src', [], opts.connectSrc));
  }
  return directives.join('; ');
}

const CSP_META_RE =
  /<meta[^>]+http-equiv=["']Content-Security-Policy["'][^>]*>/i;

/**
 * The literal a panel author writes in place of a real nonce, e.g.
 * `<script nonce="__CSP_NONCE__">`. secureWebviewHtml swaps it for the
 * per-render nonce. Authors must opt IN this way — see the warning below.
 */
export const CSP_NONCE_PLACEHOLDER = '__CSP_NONCE__';

/**
 * Wrap a panel's full HTML document with the C2b CSP backstop:
 *  1. swap every author placeholder `__CSP_NONCE__` for the per-render nonce;
 *  2. inject the CSP `<meta>` into `<head>`, replacing any existing one;
 *  3. append the delegated-event dispatcher (real nonce) before `</body>` so
 *     `data-<event>` attributes work without inline handlers.
 *
 * CRITICAL — why this does NOT regex-stamp every `<script>`: the whole point of
 * the nonce is that ONLY scripts the author marked can run. If this instead
 * stamped every `<script>` it found, an unescaped DB value that reached the DOM
 * as `<script>…</script>` (an escaping miss) would receive the page nonce and
 * execute — handing the attacker exactly what the CSP exists to prevent. So a
 * script runs only if the author wrote `nonce="__CSP_NONCE__"` on it; an
 * injected `<script>` carries no placeholder, gets no nonce, and is blocked.
 */
export function secureWebviewHtml(
  html: string,
  opts: WebviewCspOptions = {},
): string {
  const nonce = getNonce();

  // Author-opted-in scripts only. split/join avoids regex-escaping the nonce.
  let out = html.split(CSP_NONCE_PLACEHOLDER).join(nonce);

  const meta =
    `<meta http-equiv="Content-Security-Policy" content="${buildWebviewCsp(nonce, opts)}">`;

  // Define the canonical Saropa design tokens once for EVERY webview, here at
  // the single choke point all panels pass through, rather than each panel
  // prepending them to its own stylesheet. Panels reference var(--status-bad),
  // var(--brand), etc.; this is where those names resolve. style-src allows
  // 'unsafe-inline' so the injected <style> needs no nonce. See design-tokens.ts.
  const headAdditions =
    `${meta}<style data-saropa-tokens>${getWebviewTokens()}</style>`;
  out = CSP_META_RE.test(out)
    ? out.replace(CSP_META_RE, headAdditions)
    : out.replace(/<head(\s[^>]*)?>/i, (m) => `${m}${headAdditions}`);

  // The dispatcher is our own trusted script, so it takes the real nonce directly.
  const dispatcher =
    `<script nonce="${nonce}">${delegatedDispatcherScript()}</script>`;
  out = out.includes('</body>')
    ? out.replace('</body>', `${dispatcher}</body>`)
    : `${out}${dispatcher}`;

  return out;
}

/**
 * The single delegated listener that replaces inline `on*` handlers. A panel
 * marks an element with `data-click` / `data-change` / `data-input` /
 * `data-submit` naming a GLOBAL handler function, plus `data-a0`, `data-a1`, …
 * for its arguments. Two sentinel argument values are recognized: `$this`
 * passes the element itself, `$value` passes the element's current `value`.
 *
 * Arguments are passed as strings (their literal attribute text); handlers that
 * need a number coerce it themselves (e.g. `Number(page)`). This avoids any
 * JSON-parse ambiguity where a data value like a table name `"123"` would
 * silently become a number.
 *
 * Returned as a string so it can be embedded in a nonce-stamped `<script>`.
 */
export function delegatedDispatcherScript(): string {
  return `(function(){
  function arg(raw, el){
    if (raw === '$this') return el;
    if (raw === '$value') return el.value;
    return raw;
  }
  function collect(el){
    var out = [], i = 0, v;
    while ((v = el.getAttribute('data-a' + i)) !== null){ out.push(arg(v, el)); i++; }
    return out;
  }
  function bind(evt){
    var attr = 'data-' + evt;
    document.addEventListener(evt, function(e){
      var el = e.target && e.target.closest ? e.target.closest('[' + attr + ']') : null;
      if (!el) return;
      var fn = window[el.getAttribute(attr)];
      if (typeof fn === 'function') fn.apply(el, collect(el));
    });
  }
  ['click', 'change', 'input', 'submit'].forEach(bind);
})();`;
}
