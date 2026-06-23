/**
 * Prefix every selector in a CSS string with a scope selector, so a stylesheet
 * authored for a standalone webview can be embedded inside a composed document
 * (the Drift Tools Hub) without its bare selectors (`body`, `.btn`, `.header`)
 * colliding with another pane's identically-named rules.
 *
 * Why this exists: the health and dashboard panels each ship a full-document
 * stylesheet that owns `body`, `.btn`, `.header`, `.card`, `.grid`, etc. Placing
 * both in one document would let whichever loads last win every shared rule. The
 * hub renders each pane inside a wrapper element (`.dash-pane[data-pane=...]`)
 * and runs that pane's CSS through `scopeCss(css, '.pane-health')` so each rule
 * only applies inside its own pane. The standalone panels call the same
 * `get*Css()` with NO scope and receive byte-identical output, so their
 * behavior is unchanged.
 *
 * This is a deliberately small, predictable transformer for the hand-authored
 * CSS in this extension — NOT a general CSS parser. It handles: line/block
 * comments, plain selector lists (comma-separated, compound, attribute,
 * pseudo), `@media`/`@supports` (recurses into the inner block), and
 * name-defining at-rules like `@keyframes`/`@font-face` (left untouched so the
 * animation/font name stays referable from the scoped rules). It assumes no
 * native CSS nesting in the source (none is used here).
 */

/** Selectors that map to the scope ROOT itself rather than a descendant. */
const ROOT_SELECTORS = new Set(['body', 'html', ':root']);

/** Strip `/* … *\/` block comments before scoping (line comments are not CSS). */
function stripComments(css: string): string {
  return css.replace(/\/\*[\s\S]*?\*\//g, '');
}

/**
 * Rewrite a single selector so it only matches inside `scope`. Root selectors
 * (`body`/`html`/`:root`) become the scope element itself; a leading
 * `body `/`html ` is dropped and the remainder scoped; `*` becomes
 * `<scope> *`; everything else is prefixed as a descendant.
 */
function prefixSelector(selector: string, scope: string): string {
  const sel = selector.trim();
  if (sel === '') {
    return sel;
  }
  if (ROOT_SELECTORS.has(sel)) {
    return scope;
  }
  if (sel === '*') {
    return `${scope} *`;
  }
  // A descendant chain that starts at the document root (`body .x`) is scoped by
  // dropping the root token — the pane wrapper stands in for <body>.
  const deRooted = sel.replace(/^(?:body|html)\b\s*/, '');
  if (deRooted === '') {
    return scope;
  }
  return `${scope} ${deRooted}`;
}

/** Find the index of the `}` matching the `{` at `openIndex`. */
function matchBrace(css: string, openIndex: number): number {
  let depth = 0;
  for (let i = openIndex; i < css.length; i++) {
    const ch = css[i];
    if (ch === '{') {
      depth++;
    } else if (ch === '}') {
      depth--;
      if (depth === 0) {
        return i;
      }
    }
  }
  return css.length - 1;
}

/**
 * Scope every rule in `css` under `scope` (e.g. `.pane-health`). With no scope
 * the input is returned unchanged so standalone callers stay byte-identical.
 */
export function scopeCss(css: string, scope?: string): string {
  if (!scope) {
    return css;
  }
  const src = stripComments(css);
  let out = '';
  let i = 0;
  while (i < src.length) {
    const open = src.indexOf('{', i);
    if (open === -1) {
      // Trailing non-rule text (whitespace) — nothing left to scope.
      out += src.slice(i);
      break;
    }
    const prelude = src.slice(i, open).trim();
    const close = matchBrace(src, open);
    const inner = src.slice(open + 1, close);

    if (prelude.startsWith('@')) {
      // Conditional groups wrap nested rules that themselves need scoping.
      if (/^@(?:media|supports|container)\b/i.test(prelude)) {
        out += `${prelude}{${scopeCss(inner, scope)}}`;
      } else {
        // @keyframes / @font-face / @page etc. define names or page boxes whose
        // inner blocks are not document selectors — leave them intact.
        out += `${prelude}{${inner}}`;
      }
    } else {
      const scoped = prelude
        .split(',')
        .map((part) => prefixSelector(part, scope))
        .join(', ');
      out += `${scoped}{${inner}}`;
    }
    i = close + 1;
  }
  return out;
}
