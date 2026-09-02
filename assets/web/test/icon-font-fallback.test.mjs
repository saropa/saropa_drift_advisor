/**
 * Regression tests for plans/history/2026.09/20260902/081 — the offline Material Symbols fallback, and
 * specifically for the three code-review findings raised against the first fix.
 *
 * Finding 1 (the important one): `document.fonts.load()` only ever matches
 * faces declared by a CSS-connected `@font-face` rule. A user who has the icon
 * family installed as a SYSTEM font and is offline gets an EMPTY array back
 * while every icon on screen renders perfectly — the first fix read that empty
 * array as "font missing" and hid working glyphs behind `font-size: 0`. The
 * fix under test makes an empty result INCONCLUSIVE and settles it with a real
 * rendering probe (ligature width vs. the same string in a generic family).
 *
 * Findings 2 and 3 are CSS-shaped, so they are pinned by compiling style.scss
 * and asserting on the emitted selectors.
 *
 * Run: `npm run test:web` (node --test).
 */
import { describe, it, before, afterEach, mock } from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { compile } from 'sass';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));

// toolbar.ts is TypeScript bundled into the web app; there is no JS runtime for
// it in unit tests, so — like the other web-viewer harnesses — esbuild it to an
// in-memory ESM module and exercise the real exported functions.
let mod;
before(async () => {
  const out = await build({
    entryPoints: [join(here, '..', 'toolbar.ts')],
    bundle: true,
    format: 'esm',
    write: false,
    logLevel: 'silent',
  });
  mod = await import('data:text/javascript,' + encodeURIComponent(out.outputFiles[0].text));
});

// The probe reads the bare global `document`, so tests install a stub there.
const realDocument = globalThis.document;
afterEach(() => {
  if (realDocument === undefined) delete globalThis.document;
  else globalThis.document = realDocument;
});

/** Minimal classList that records what the probe toggled on <html>. */
function makeClassList() {
  const set = new Set();
  return {
    toggle(name, force) {
      if (force) set.add(name);
      else set.delete(name);
      return set.has(name);
    },
    has: (name) => set.has(name),
  };
}

/**
 * Builds a stub `document`.
 *
 * `canvas` / `span` map a font-family string to the width that engine would
 * report for the probe ligature; pass `null` for either to simulate that
 * measurement path being unavailable (no canvas support, no document.body).
 * Widths are keyed by family so a test can say "canvas measures both families
 * the same but real layout does not" — the system-installed-font case.
 */
function makeDocument({ canvas, span, fonts }) {
  const classList = makeClassList();
  const doc = {
    documentElement: { classList },
    body: span ? {} : null,
    fonts,
    createElement(tag) {
      if (tag === 'canvas') {
        if (!canvas) return {}; // no getContext -> probe returns null
        return {
          getContext(kind) {
            if (kind !== '2d') return null;
            const ctx = {
              font: '',
              measureText() {
                // ctx.font is "<px>px <family list>" — key on the family part.
                const family = ctx.font.slice(ctx.font.indexOf(' ') + 1);
                const w = canvas[family];
                return { width: typeof w === 'number' ? w : 0 };
              },
            };
            return ctx;
          },
        };
      }
      // <span>: width comes from the family assigned to style.fontFamily.
      const el = {
        style: { cssText: '', fontFamily: '' },
        textContent: '',
        parentNode: null,
        getBoundingClientRect() {
          const w = span[el.style.fontFamily];
          return { width: typeof w === 'number' ? w : 0 };
        },
      };
      return el;
    },
  };
  if (span) {
    doc.body.appendChild = (el) => {
      el.parentNode = { removeChild() {} };
    };
  }
  return { doc, classList };
}

// The exact family strings the probe uses (kept in sync with toolbar.ts).
// A `fonts.load()` that never answers — a proxy that black-holes the request
// rather than failing it, which is what the 3s deadline exists for.
const NEVER_SETTLES = { load: () => new Promise(() => {}) };

const ICON_STACK = '"Material Symbols Outlined", "Material Icons", monospace';
const BASE = 'monospace';

// Widths as a real engine reports them: a collapsed ligature is ONE glyph
// (~24px at 24px em), four monospace letters are ~58px.
const COLLAPSED = 24;
const FOUR_LETTERS = 57.6;

describe('bug 081 — icon ligature rendering probe', () => {
  it('reports collapsed when the canvas widths diverge (icon font active)', () => {
    const { doc } = makeDocument({
      canvas: { [ICON_STACK]: COLLAPSED, [BASE]: FOUR_LETTERS },
      span: null,
      fonts: null,
    });
    globalThis.document = doc;
    assert.equal(mod.iconLigatureCollapses(), true);
  });

  it('confirms in real layout when canvas skips ligature shaping', () => {
    // Some engines do not apply the `liga` feature to canvas text: canvas sees
    // four letters in BOTH families, but the live span shows the collapse.
    const { doc } = makeDocument({
      canvas: { [ICON_STACK]: FOUR_LETTERS, [BASE]: FOUR_LETTERS },
      span: { [ICON_STACK]: COLLAPSED, [BASE]: FOUR_LETTERS },
      fonts: null,
    });
    globalThis.document = doc;
    assert.equal(mod.iconLigatureCollapses(), true);
  });

  it('reports NOT collapsed when both engines measure the same width', () => {
    const { doc } = makeDocument({
      canvas: { [ICON_STACK]: FOUR_LETTERS, [BASE]: FOUR_LETTERS },
      span: { [ICON_STACK]: FOUR_LETTERS, [BASE]: FOUR_LETTERS },
      fonts: null,
    });
    globalThis.document = doc;
    assert.equal(mod.iconLigatureCollapses(), false);
  });

  it('returns null (inconclusive) when nothing can be measured', () => {
    const { doc } = makeDocument({ canvas: null, span: null, fonts: null });
    globalThis.document = doc;
    assert.equal(mod.iconLigatureCollapses(), null);
  });
});

/**
 * Runs initIconFontFallback against a `fonts.load()` that NEVER settles and
 * fires the 3s deadline with node:test's fake timers, so the timeout branch is
 * exercised without the suite actually waiting three seconds.
 */
async function runTimeout(doc) {
  mock.timers.enable({ apis: ['setTimeout'] });
  try {
    globalThis.document = doc;
    mod.initIconFontFallback();
    mock.timers.tick(3000);
  } finally {
    mock.timers.reset();
  }
}

/** Runs initIconFontFallback and resolves once its promise chain has settled. */
async function runFallback(doc) {
  globalThis.document = doc;
  mod.initIconFontFallback();
  // Two microtask turns: one for fonts.load(), one for the .then() handler.
  await Promise.resolve();
  await Promise.resolve();
}

describe('bug 081 — initIconFontFallback verdicts', () => {
  it('does NOT degrade when load() returns a face (CDN reached)', async () => {
    const { doc, classList } = makeDocument({
      canvas: { [ICON_STACK]: COLLAPSED, [BASE]: FOUR_LETTERS },
      span: null,
      fonts: { load: () => Promise.resolve([{}]) },
    });
    await runFallback(doc);
    assert.equal(classList.has('icons-unavailable'), false);
  });

  it('does NOT degrade for a system-installed icon font while offline', async () => {
    // THE review finding 1 regression: no @font-face rule matched, so load()
    // resolves EMPTY, yet the glyphs render because the family is installed
    // locally. The old code degraded here and erased working icons.
    const { doc, classList } = makeDocument({
      canvas: { [ICON_STACK]: COLLAPSED, [BASE]: FOUR_LETTERS },
      span: null,
      fonts: { load: () => Promise.resolve([]) },
    });
    await runFallback(doc);
    assert.equal(classList.has('icons-unavailable'), false);
  });

  it('degrades when load() is empty AND the ligature does not collapse', async () => {
    const { doc, classList } = makeDocument({
      canvas: { [ICON_STACK]: FOUR_LETTERS, [BASE]: FOUR_LETTERS },
      span: { [ICON_STACK]: FOUR_LETTERS, [BASE]: FOUR_LETTERS },
      fonts: { load: () => Promise.resolve([]) },
    });
    await runFallback(doc);
    assert.equal(classList.has('icons-unavailable'), true);
  });

  it('stays optimistic when load() is empty and the probe is inconclusive', async () => {
    // Nothing measurable: a false "unavailable" would replace WORKING glyphs
    // with words, which is the worse of the two failures.
    const { doc, classList } = makeDocument({
      canvas: null,
      span: null,
      fonts: { load: () => Promise.resolve([]) },
    });
    await runFallback(doc);
    assert.equal(classList.has('icons-unavailable'), false);
  });

  // --- load() rejection: a face WAS declared but its file could not be
  // fetched. Routed through the same rendering probe as the empty-list path,
  // because the CSS stack's next entry ("Material Icons") can still be
  // installed locally and rendering correct glyphs. The ASYMMETRY between the
  // two branches is deliberate and is pinned by the third test below: an empty
  // list is absence of evidence (inconclusive -> optimistic), a rejection is
  // positive evidence of failure (inconclusive -> pessimistic).
  it('does NOT degrade on rejection when the ligature still collapses', async () => {
    const { doc, classList } = makeDocument({
      canvas: { [ICON_STACK]: COLLAPSED, [BASE]: FOUR_LETTERS },
      span: null,
      fonts: { load: () => Promise.reject(new Error('network')) },
    });
    await runFallback(doc);
    assert.equal(classList.has('icons-unavailable'), false);
  });

  it('degrades on rejection when the ligature does not collapse', async () => {
    const { doc, classList } = makeDocument({
      canvas: { [ICON_STACK]: FOUR_LETTERS, [BASE]: FOUR_LETTERS },
      span: { [ICON_STACK]: FOUR_LETTERS, [BASE]: FOUR_LETTERS },
      fonts: { load: () => Promise.reject(new Error('network')) },
    });
    await runFallback(doc);
    assert.equal(classList.has('icons-unavailable'), true);
  });

  it('degrades on rejection when the probe is inconclusive (asymmetry)', async () => {
    // Same unmeasurable environment as the empty-list test above, which stays
    // optimistic. Here it must degrade: the rejection itself proves the
    // declared face failed to load.
    const { doc, classList } = makeDocument({
      canvas: null,
      span: null,
      fonts: { load: () => Promise.reject(new Error('network')) },
    });
    await runFallback(doc);
    assert.equal(classList.has('icons-unavailable'), true);
  });

  // --- 3s deadline with no answer at all. Follows the EMPTY-LIST rule, not the
  // rejection rule: a hang proves nothing about the face, and inferring "the
  // CDN is unreachable, so there are no icons" is the inference finding 1
  // invalidated. The probe is synchronous, so it costs nothing at the deadline.
  it('does NOT degrade at the deadline when the ligature still collapses', async () => {
    const { doc, classList } = makeDocument({
      canvas: { [ICON_STACK]: COLLAPSED, [BASE]: FOUR_LETTERS },
      span: null,
      fonts: NEVER_SETTLES,
    });
    await runTimeout(doc);
    assert.equal(classList.has('icons-unavailable'), false);
  });

  it('degrades at the deadline when the ligature does not collapse', async () => {
    const { doc, classList } = makeDocument({
      canvas: { [ICON_STACK]: FOUR_LETTERS, [BASE]: FOUR_LETTERS },
      span: { [ICON_STACK]: FOUR_LETTERS, [BASE]: FOUR_LETTERS },
      fonts: NEVER_SETTLES,
    });
    await runTimeout(doc);
    assert.equal(classList.has('icons-unavailable'), true);
  });

  it('stays optimistic at the deadline when the probe is inconclusive', async () => {
    // Same unmeasurable environment as the rejection asymmetry test, opposite
    // expected outcome — this is what pins the timeout to the empty-list row.
    const { doc, classList } = makeDocument({
      canvas: null,
      span: null,
      fonts: NEVER_SETTLES,
    });
    await runTimeout(doc);
    assert.equal(classList.has('icons-unavailable'), false);
  });

  it('leaves the UI alone when there is no CSS Font Loading API', async () => {
    const { doc, classList } = makeDocument({ canvas: null, span: null, fonts: undefined });
    await runFallback(doc);
    assert.equal(classList.has('icons-unavailable'), false);
  });
});

describe('bug 081 — degraded-mode stylesheet contract', () => {
  let css;
  before(() => {
    css = compile(join(here, '..', 'style.scss')).css;
  });

  it('finding 2: the forced labeled layout yields to an explicit density choice', () => {
    // Every `.icons-unavailable #toolbar-bar` rule must carry the
    // `:not(.tb-density-user)` guard, or the density toggle becomes a dead
    // control for the whole degraded session (same defect class as bug 083).
    // Strip CSS comments first: the degraded rules carry long explanatory
    // comments that mention both selector fragments and would false-positive.
    const unguarded = css
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .split(/[{,]/)
      .map((s) => s.trim())
      .filter((s) => s.includes('.icons-unavailable') && s.includes('#toolbar-bar'))
      .filter((s) => !s.includes(':not(.tb-density-user)'));
    assert.deepEqual(unguarded, []);
    assert.ok(css.includes('.icons-unavailable #toolbar-bar:not(.tb-density-user)'));
  });

  it('finding 2: the bullet marker survives an explicit icon-only choice', () => {
    // The bullet suppressor must not match on a bare [data-label]; otherwise a
    // user who stays icon-only while degraded gets neither label nor bullet.
    assert.ok(!css.includes('.icons-unavailable [data-label] .material-symbols-outlined::after'));
    assert.ok(
      css.includes(
        '.icons-unavailable #toolbar-bar:not(.tb-density-user) [data-label] .material-symbols-outlined::after',
      ),
    );
  });

  it('finding 3: degraded-only layout declarations stay off the base icon rule', () => {
    // `display/vertical-align/white-space` guard a fallback STRING from
    // re-flowing its row — impossible once the font loads — so they must not
    // change inline alignment for every icon in the app.
    const base = css.slice(css.indexOf('.material-symbols-outlined {'));
    const body = base.slice(base.indexOf('{') + 1, base.indexOf('}'));
    for (const prop of ['display:', 'vertical-align:', 'white-space:']) {
      assert.ok(!body.includes(prop), `base .material-symbols-outlined must not set ${prop}`);
    }
    const degraded = css.slice(css.indexOf('.icons-unavailable .material-symbols-outlined {'));
    const degradedBody = degraded.slice(degraded.indexOf('{') + 1, degraded.indexOf('}'));
    for (const prop of ['display:', 'vertical-align:', 'white-space:']) {
      assert.ok(degradedBody.includes(prop), `degraded rule must set ${prop}`);
    }
  });
});
