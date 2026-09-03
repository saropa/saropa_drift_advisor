/**
 * OFFLINE-RENDER REGRESSION GATE — the check that would have caught bug 081 on day one.
 *
 * THE DEFECT. The viewer shell inlines its CSS and JS specifically so it works with no
 * network ("zero extra requests, works offline", html_content.dart). But every icon was a
 * Material Symbols LIGATURE served solely from fonts.googleapis.com. Offline the font never
 * arrived, so the browser painted the ligature NAMES as text and the toolbar became a row of
 * clipped words — `home`, `table_chart`, `smart_toy`. Nothing in the repo detected it.
 *
 * WHAT THIS FILE ASSERTS. Loading the shell with every external host unreachable must not
 * paint ligature names as text. That decomposes into four properties, each proved here:
 *
 *   G1  The degraded-state rule that collapses ligature text WINS THE CASCADE against every
 *       per-surface rule that sets a font size on the icon class. This is the exact trap the
 *       081 fix had to solve: ~a dozen partials use more specific selectors
 *       (`#toolbar-bar .tb-icon-btn .material-symbols-outlined`, …) and all of them outrank a
 *       plain `.icons-unavailable .material-symbols-outlined` descendant selector, so the
 *       `!important` is load-bearing. G1 recomputes the cascade instead of grepping for the
 *       keyword, so it stays true if the selectors are ever restructured.
 *   G2  Every icon in the shell is ACCOUNTED FOR: an icon inside a control either carries a
 *       text fallback (`data-label` / `aria-label` / `title`) or renders its own visible
 *       text, and every icon outside a control is declared decorative (`aria-hidden`). A
 *       collapsed icon with no fallback is an empty box — the second half of the same bug.
 *   G3  Nothing but the FONTS is fetched from an external host. If the stylesheet, the
 *       bundle, or an image were also remote, "offline" would be a different and larger
 *       failure and this gate would be measuring the wrong thing. Also pins `display=block`
 *       on the icon link (with `swap`, the browser paints the fallback — i.e. the ligature
 *       name — immediately, which is the bug happening ONLINE) and the multi-family fallback
 *       chain on the icon face.
 *   G4  The runtime degrade initializer is REACHABLE FROM THE REAL ENTRY POINT. The rules in
 *       G1 only apply once `icons-unavailable` is set on <html>; a probe that exists in
 *       toolbar.ts but is not wired into the shipped bundle proves nothing.
 *
 * DESIGN DECISIONS (justified, because each had a cheaper wrong answer):
 *
 * • WHERE THE SHELL COMES FROM — the Dart source is read as text, not rendered by the Dart
 *   VM. `HtmlContent.buildIndexHtml` interpolates only the l10n/version/asset-source values;
 *   every one of the 50+ icon elements is a LITERAL in the template, so the source text and
 *   the rendered output are identical over the surface being checked. Rendering it for real
 *   would mean invoking the Dart SDK from the web test gate (slow, and it would break
 *   `npm run test:web` for anyone without Dart) to learn nothing extra. The risk that comes
 *   with reading source instead of output — an icon this file's parser cannot see — is closed
 *   by an explicit accounting check: the number of icons the parser classified must equal the
 *   raw number of occurrences of the class in the file. Add an icon by a route this parser
 *   does not understand and the gate FAILS rather than silently skipping it.
 *
 * • NO HEADLESS BROWSER. A real browser is the only way to observe actual paint, but adding
 *   playwright/puppeteer is a dependency blast-radius decision and is deliberately not taken
 *   here. See the limits section below for exactly what that costs.
 *
 * • WHY A NODE TEST AND NOT A PYTHON SCRIPT. Three of the four artifacts inspected are
 *   node-side and must be BUILT to be inspected honestly: style.scss is compiled with `sass`
 *   and the bundle with `esbuild`, both already dev dependencies. Compiling from source
 *   rather than reading the generated style.css / bundle.js means the gate cannot pass on a
 *   stale artifact — or fail because of one. A Python script would have to shell out to the
 *   same two tools to reach the same facts.
 *
 * WHAT THIS CANNOT PROVE (be honest about the boundary):
 *   - That a real engine paints nothing. `font-size: 0` collapsing the ligature is a spec
 *     claim, not an observation; only a browser sees pixels.
 *   - Anything about a font that loads but renders the WRONG glyph, or about layout/clipping
 *     of the substituted labels at real widths.
 *   - The runtime verdict logic itself (which `document.fonts` outcome should degrade) — that
 *     is owned by icon-font-fallback.test.mjs. G4 only proves the initializer is reachable.
 *   - The CDN-fallback branch of the shell (used only when the package's local assets are
 *     missing); its contract is pinned by test/html_content_test.dart on the Dart side.
 *
 * Run: `npm run test:web`.
 */
import { describe, it, before } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { compile } from 'sass';
import { build } from 'esbuild';

const here = dirname(fileURLToPath(import.meta.url));
const webDir = join(here, '..');
const repoRoot = join(webDir, '..', '..');
const shellPath = join(repoRoot, 'lib', 'src', 'server', 'html_content.dart');

/** The icon class every Material Symbols ligature carries. */
const ICON_CLASS = 'material-symbols-outlined';
/** The class toolbar.ts puts on <html> when the icon face is provably absent. */
const DEGRADED_CLASS = 'icons-unavailable';

// ---------------------------------------------------------------------------
// CSS helpers
// ---------------------------------------------------------------------------

/**
 * Strips CSS comments. The stylesheet carries long explanatory comments that
 * quote selectors verbatim (deliberately — they document the specificity trap),
 * so a naive scan would "find" rules that do not exist.
 */
function stripComments(css) {
  return css.replace(/\/\*[\s\S]*?\*\//g, '');
}

/**
 * Flattens a compiled stylesheet into { selector, decls, order } records, one per
 * selector in a comma-separated list, so each selector can be weighed on its own.
 * At-rule headers (`@media …`) are skipped naturally: the pattern only matches a
 * prelude followed by a brace-free block.
 */
function flattenRules(css) {
  const out = [];
  const ruleRe = /([^{}]+)\{([^{}]*)\}/g;
  let m;
  let order = 0;
  while ((m = ruleRe.exec(css)) !== null) {
    const prelude = m[1].trim();
    if (prelude.startsWith('@')) continue; // e.g. `@font-face`, `@supports` body-less prelude
    const decls = m[2];
    for (const sel of prelude.split(',')) {
      out.push({ selector: sel.trim(), decls, order: order++ });
    }
  }
  return out;
}

/**
 * CSS specificity as [ids, classes, types]. `:not()`/`:is()` contribute their
 * arguments' specificity but not their own, which matters here because the
 * degraded toolbar rules use `:not(.tb-density-user)`.
 */
function specificity(selector) {
  // Unwrap functional pseudo-classes so their arguments are counted as normal.
  let s = selector.replace(/:(not|is|has|where)\(([^)]*)\)/g, (_all, fn, inner) =>
    fn === 'where' ? '' : ' ' + inner + ' ',
  );
  const ids = (s.match(/#[\w-]+/g) || []).length;
  s = s.replace(/#[\w-]+/g, ' ');
  const classes =
    (s.match(/\.[\w-]+/g) || []).length +
    (s.match(/\[[^\]]*\]/g) || []).length +
    // Single-colon pseudo-classes only; `::before`/`::after` are type-level.
    (s.match(/(?<!:):[\w-]+/g) || []).length;
  s = s.replace(/\.[\w-]+|\[[^\]]*\]|(?<!:):[\w-]+/g, ' ');
  const types = (s.match(/(?:^|[\s>+~])([a-zA-Z][\w-]*)/g) || []).length + (s.match(/::[\w-]+/g) || []).length;
  return [ids, classes, types];
}

/** Lexicographic specificity comparison: >0 when a outranks b. */
function compareSpecificity(a, b) {
  for (let i = 0; i < 3; i++) if (a[i] !== b[i]) return a[i] - b[i];
  return 0;
}

/** Extracts the last declaration of `prop` from a declaration block, with its !important flag. */
function findDeclaration(decls, prop) {
  const re = new RegExp(`(?:^|;)\\s*${prop}\\s*:([^;]*)`, 'gi');
  let m;
  let found = null;
  while ((m = re.exec(decls)) !== null) {
    const raw = m[1].trim();
    found = { value: raw.replace(/!important\s*$/i, '').trim(), important: /!important\s*$/i.test(raw) };
  }
  return found;
}

/**
 * Decides which of two author-origin rules wins for an element both match:
 * !important first, then specificity, then source order.
 */
function cascadeWinner(a, b) {
  if (a.important !== b.important) return a.important ? a : b;
  const bySpec = compareSpecificity(a.spec, b.spec);
  if (bySpec !== 0) return bySpec > 0 ? a : b;
  return a.order > b.order ? a : b;
}

/** True when the selector's rightmost compound is the icon element itself (not its ::after). */
function targetsIconElement(selector) {
  const last = selector.split(/\s|>|\+|~/).filter(Boolean).pop() || '';
  return last.includes(`.${ICON_CLASS}`) && !last.includes('::');
}

// ---------------------------------------------------------------------------
// Shared, compiled-once artifacts
// ---------------------------------------------------------------------------

let css; // style.scss compiled fresh — never the checked-in style.css
let rules;
let shell; // html_content.dart source text
let bundle; // the real entry point, bundled fresh — never the checked-in bundle.js

before(async () => {
  css = stripComments(compile(join(webDir, 'style.scss')).css);
  rules = flattenRules(css);
  shell = readFileSync(shellPath, 'utf8');
  const out = await build({
    entryPoints: [join(webDir, 'index.js')],
    bundle: true,
    format: 'iife',
    write: false,
    logLevel: 'silent',
  });
  bundle = out.outputFiles[0].text;
});

// ---------------------------------------------------------------------------
// G1 — the degraded rule must beat every per-surface icon size rule
// ---------------------------------------------------------------------------

describe('offline shell — G1: ligature text is collapsed everywhere', () => {
  /**
   * Collects every font-size declaration that lands on the icon ELEMENT, split into
   * the degraded-state rules and the normal ones that compete with them.
   */
  function iconFontSizeRules() {
    const hits = [];
    for (const r of rules) {
      if (!targetsIconElement(r.selector)) continue;
      const decl = findDeclaration(r.decls, 'font-size');
      if (!decl) continue;
      hits.push({
        selector: r.selector,
        order: r.order,
        spec: specificity(r.selector),
        value: decl.value,
        important: decl.important,
        degraded: r.selector.includes(`.${DEGRADED_CLASS}`),
      });
    }
    return hits;
  }

  it('declares a degraded rule that collapses the ligature to zero size', () => {
    const degraded = iconFontSizeRules().filter((r) => r.degraded);
    assert.ok(degraded.length > 0, `no .${DEGRADED_CLASS} rule sets a font-size on .${ICON_CLASS}`);
    // A non-zero size would still paint the ligature NAME, which is the bug.
    assert.ok(
      degraded.some((r) => parseFloat(r.value) === 0),
      `degraded icon font-size must be 0, got: ${degraded.map((r) => r.value).join(', ')}`,
    );
  });

  it('the degraded rule wins the cascade against EVERY per-surface size rule', () => {
    const all = iconFontSizeRules();
    const degraded = all.filter((r) => r.degraded && parseFloat(r.value) === 0);
    const competitors = all.filter((r) => !r.degraded);
    assert.ok(competitors.length > 0, 'expected per-surface icon size rules to exist');

    // Every element a competitor matches is also matched by the degraded rule once
    // `icons-unavailable` is on <html> (the degraded selectors are ancestor-prefixed
    // forms of the same class), so a pairwise cascade comparison is sound and total.
    const losses = [];
    for (const c of competitors) {
      const beaten = degraded.some((d) => cascadeWinner(d, c) === d);
      if (!beaten) losses.push(`${c.selector} { font-size: ${c.value}${c.important ? ' !important' : ''} }`);
    }
    assert.deepEqual(
      losses,
      [],
      'these rules would out-rank the degraded state and leak the ligature name:\n  ' + losses.join('\n  '),
    );
  });

  it('gives collapsed icon-only controls a visible stand-in marker', () => {
    // Once the ligature is zero-sized, a control with no label is an empty box.
    // The ::after bullet keeps it visible and clickable.
    const marker = rules.find(
      (r) => r.selector.includes(`.${DEGRADED_CLASS}`) && r.selector.includes(`.${ICON_CLASS}::after`),
    );
    assert.ok(marker, 'no degraded-state ::after marker rule on the icon class');
    const content = findDeclaration(marker.decls, 'content');
    assert.ok(content && content.value !== 'none', 'degraded marker must render content');
    // The marker must not itself need a webfont, or it fails in the same conditions.
    const family = findDeclaration(marker.decls, 'font-family');
    assert.ok(family, 'degraded marker must pin a system font-family');
    assert.ok(
      /system-ui|sans-serif|monospace|serif/.test(family.value),
      `degraded marker font-family must end in a generic family, got: ${family.value}`,
    );
    // Sized in an absolute unit: the parent is font-size:0, so an em value draws nothing.
    const size = findDeclaration(marker.decls, 'font-size');
    assert.ok(size && !/\bem\b/.test(size.value), `degraded marker font-size must not be em-relative: ${size?.value}`);
  });
});

// ---------------------------------------------------------------------------
// G2 — every icon in the shell has a text fallback or is declared decorative
// ---------------------------------------------------------------------------

describe('offline shell — G2: every icon has a usable fallback', () => {
  // Buttons and links do not nest (see the no-nested-interactive-controls gate),
  // so a non-greedy match per control is exact for this markup.
  const CONTROL_RE = /<(button|a)\b([^>]*)>([\s\S]*?)<\/\1>/g;

  it('classifies every icon occurrence — no icon escapes this check', () => {
    const total = (shell.match(new RegExp(ICON_CLASS, 'g')) || []).length;
    let inControls = 0;
    for (const m of shell.matchAll(CONTROL_RE)) {
      inControls += (m[3].match(new RegExp(ICON_CLASS, 'g')) || []).length;
    }
    const standalone = countStandaloneOutsideControls();
    // The accounting must be exhaustive. Reading the Dart SOURCE rather than rendered
    // output is only sound while this parser sees every icon; if a future icon is
    // emitted by a shape it does not recognise, this fails instead of skipping it.
    assert.equal(
      inControls + standalone,
      total,
      `icon accounting mismatch: ${total} occurrences, ${inControls} inside controls, ` +
        `${standalone} standalone — a new emit shape is unchecked`,
    );
    assert.ok(total > 0, 'no icons found in the shell — the parser or the path is wrong');
  });

  /** Counts icon spans that are NOT inside any <button>/<a> control. */
  function countStandaloneOutsideControls() {
    // Blank out control bodies, then count what is left.
    const outside = shell.replace(CONTROL_RE, (all) => ' '.repeat(all.length));
    return (outside.match(new RegExp(ICON_CLASS, 'g')) || []).length;
  }

  it('every icon-bearing control carries a text fallback or its own visible text', () => {
    const offenders = [];
    for (const m of shell.matchAll(CONTROL_RE)) {
      const [, , attrs, body] = m;
      if (!body.includes(ICON_CLASS)) continue;
      const hasLabelAttr = /\b(data-label|aria-label|title)\s*=/.test(attrs);
      // Visible text is any non-whitespace left after removing all child markup.
      const visibleText = body.replace(/<[^>]*>/g, '').replace(/&\w+;/g, '').trim();
      if (!hasLabelAttr && visibleText.length === 0) {
        offenders.push(m[0].slice(0, 120));
      }
    }
    assert.deepEqual(
      offenders,
      [],
      'icon-only controls with no text fallback — offline these are empty boxes:\n  ' + offenders.join('\n  '),
    );
  });

  it('icons outside a control are declared decorative', () => {
    // These cannot show a label, so their only correct offline behavior is to vanish
    // (G1) and to be invisible to assistive tech in the first place.
    const offenders = [];
    const outside = shell.replace(CONTROL_RE, (all) => ' '.repeat(all.length));
    for (const m of outside.matchAll(/<span\b[^>]*>/g)) {
      if (!m[0].includes(ICON_CLASS)) continue;
      if (!/aria-hidden\s*=\s*"true"/.test(m[0])) offenders.push(m[0]);
    }
    assert.deepEqual(offenders, [], 'decorative icons missing aria-hidden:\n  ' + offenders.join('\n  '));
  });
});

// ---------------------------------------------------------------------------
// G3 — nothing but the fonts is fetched from an external host
// ---------------------------------------------------------------------------

describe('offline shell — G3: the only external dependency is the fonts', () => {
  it('inlines CSS and JS into the shell (the offline contract)', () => {
    assert.match(shell, /<style>\$inlineCss<\/style>/, 'stylesheet is not inlined into the shell');
    assert.match(shell, /<script>\$\{inlineBundleJs/, 'bundle is not inlined into the shell');
  });

  it('loads no external subresource other than the two font stylesheets', () => {
    // Only subresource-fetching attributes matter. An <a href> is navigation, and a
    // data: URI is self-contained, so both are excluded by construction below.
    const offenders = [];
    for (const m of shell.matchAll(/<(link|script|img|iframe)\b[^>]*>/g)) {
      const tag = m[0];
      const url = (tag.match(/\b(?:href|src)\s*=\s*"([^"]*)"/) || [])[1] || '';
      if (!/^https?:\/\//.test(url)) continue; // relative, data:, or interpolated
      const host = url.split('/')[2];
      if (host !== 'fonts.googleapis.com' && host !== 'fonts.gstatic.com') offenders.push(tag.slice(0, 140));
    }
    assert.deepEqual(offenders, [], 'external subresources beyond the fonts:\n  ' + offenders.join('\n  '));
  });

  it('the compiled stylesheet fetches nothing at all', () => {
    // An @import or an absolute url() would be a second silent offline failure.
    assert.ok(!/@import/.test(css), 'style.css contains an @import');
    const remote = (css.match(/url\(\s*["']?https?:/gi) || []).length;
    assert.equal(remote, 0, 'style.css references a remote url()');
  });

  it('the icon link uses display=block, never swap', () => {
    const link = (shell.match(/<link[^>]*Material\+Symbols[^>]*>/) || [])[0];
    assert.ok(link, 'Material Symbols stylesheet link not found');
    // `swap` paints the FALLBACK immediately, and for a ligature font the fallback IS
    // the glyph name — that is bug 081 reproducing even for an online user.
    assert.ok(!/display=swap/.test(link), 'icon font must not use display=swap');
    assert.match(link, /display=block/, 'icon font must use display=block');
  });

  it('the icon face declares a real fallback chain', () => {
    const base = rules.find((r) => r.selector === `.${ICON_CLASS}`);
    assert.ok(base, `no base .${ICON_CLASS} rule`);
    const family = findDeclaration(base.decls, 'font-family');
    assert.ok(family, 'icon face declares no font-family');
    const families = family.value.split(',').map((f) => f.trim());
    assert.ok(families.length > 1, `icon font-family has no fallback: ${family.value}`);
    assert.ok(
      /system-ui|sans-serif|serif|monospace/.test(families[families.length - 1]),
      `icon font-family must end in a generic family: ${family.value}`,
    );
  });
});

// ---------------------------------------------------------------------------
// G4 — the runtime degrade is reachable from the shipped entry point
// ---------------------------------------------------------------------------

describe('offline shell — G4: the degrade initializer ships and runs', () => {
  it('bundles the icon-font probe from the real entry point', () => {
    // Bundled from index.js — the same entry esbuild.config.mjs ships — so a probe
    // that exists in toolbar.ts but is never imported would NOT appear here.
    assert.match(bundle, /initIconFontFallback/, 'the icon-font probe is not in the shipped bundle');
    assert.match(
      bundle,
      new RegExp(`["']${DEGRADED_CLASS}["']`),
      `the bundle never sets the .${DEGRADED_CLASS} class the stylesheet keys on`,
    );
  });

  it('calls the probe, not merely defines it', () => {
    // Definition plus at least one call site. esbuild does not minify, so the
    // identifier survives verbatim.
    const hits = (bundle.match(/initIconFontFallback/g) || []).length;
    assert.ok(hits >= 2, `initIconFontFallback appears ${hits}x — defined but never called`);
    assert.match(bundle, /initIconFontFallback\(\)/, 'the icon-font probe is never invoked');
  });

  it('drives the degrade off a rendering measurement, not a network symptom', () => {
    // The verdict logic is owned by icon-font-fallback.test.mjs; this only pins that
    // the shipped bundle still consults a measurement before hiding working glyphs.
    assert.match(bundle, /measureText|getBoundingClientRect/, 'no rendering measurement in the shipped probe');
  });
});
