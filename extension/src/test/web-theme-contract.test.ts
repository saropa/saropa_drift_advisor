/**
 * Contract tests for the four-theme system in the web viewer.
 *
 * Verifies that the compiled CSS (style.css), the CDN-only enhanced
 * stylesheet (drift-enhanced.css), and the client JavaScript (app.js)
 * all agree on the theme class names and required variables. These
 * tests catch regressions where one artefact is updated but another
 * is not — e.g. renaming a theme class in CSS without updating JS.
 *
 * Base themes: light (default), dark.
 * Premium themes (CDN-only): showcase (light variant), midnight (dark
 * variant). CSS variables live in style.css; glassmorphism effects
 * live in drift-enhanced.css.
 */
import * as assert from 'assert';
import * as fs from 'fs';
import * as path from 'path';

/** Root of the repository, two levels above extension/src/test/. */
const REPO_ROOT = path.resolve(__dirname, '..', '..', '..');

/** Read a file relative to the repo root, UTF-8. */
function readAsset(relPath: string): string {
  return fs.readFileSync(path.join(REPO_ROOT, relPath), 'utf-8');
}

/**
 * Extract the first CSS rule block for a given selector prefix.
 *
 * Scans `css` for a line containing `selector`, then captures
 * everything up to and including the matching closing `}`. Good
 * enough for single-level blocks with no nested braces.
 */
function extractBlock(css: string, selector: string): string {
  const start = css.indexOf(selector);
  if (start === -1) return '';
  const braceOpen = css.indexOf('{', start);
  if (braceOpen === -1) return '';
  // Simple brace-depth counter for non-nested blocks.
  let depth = 0;
  let end = braceOpen;
  for (let i = braceOpen; i < css.length; i++) {
    if (css[i] === '{') depth++;
    if (css[i] === '}') depth--;
    if (depth === 0) {
      end = i + 1;
      break;
    }
  }
  return css.substring(start, end);
}

describe('Web theme contract — style.css', () => {
  let css: string;

  before(() => {
    css = readAsset('assets/web/style.css');
  });

  // All four theme selectors must be present in the compiled CSS so
  // the body class applied by app.js produces the correct variables.
  const requiredSelectors = [
    'body.theme-dark',
    'body.theme-light',
    'body.theme-showcase',
    'body.theme-midnight',
  ];
  for (const selector of requiredSelectors) {
    it(`contains ${selector} selector`, () => {
      assert.ok(
        css.includes(selector),
        `Compiled style.css must contain "${selector}" — did you forget to add it or recompile SCSS?`,
      );
    });
  }

  // Each theme must define the core CSS custom properties that the
  // layout depends on. Missing variables cause invisible text or
  // broken backgrounds.
  const coreVariables = [
    '--bg',
    '--fg',
    '--bg-pre',
    '--surface',
    '--header-bg',
    '--border',
    '--link',
    '--btn-primary-bg',
    '--sidebar-bg',
  ];

  it('theme-light defines all core CSS variables', () => {
    // Extract the body.theme-light block (first occurrence up to the
    // closing brace) and verify each variable is present.
    const lightBlock = extractBlock(css, 'body.theme-light');
    for (const v of coreVariables) {
      assert.ok(
        lightBlock.includes(v),
        `body.theme-light is missing ${v}`,
      );
    }
  });

  it('theme-dark defines all core CSS variables', () => {
    // Dark variables are on "body.theme-dark" only (light is the
    // bare body default).
    const darkBlock = extractBlock(css, 'body.theme-dark');
    for (const v of coreVariables) {
      assert.ok(
        darkBlock.includes(v),
        `body.theme-dark is missing ${v}`,
      );
    }
  });

  it('theme-showcase defines all core CSS variables', () => {
    const showcaseBlock = extractBlock(css, 'body.theme-showcase');
    for (const v of coreVariables) {
      assert.ok(
        showcaseBlock.includes(v),
        `body.theme-showcase is missing ${v}`,
      );
    }
  });

  it('theme-midnight defines all core CSS variables', () => {
    const midnightBlock = extractBlock(css, 'body.theme-midnight');
    for (const v of coreVariables) {
      assert.ok(
        midnightBlock.includes(v),
        `body.theme-midnight is missing ${v}`,
      );
    }
  });

  it('--btn-primary-bg is a solid colour (not a gradient) in all themes', () => {
    // Gradients in --btn-primary-bg break border-color: var(--btn-primary-bg)
    // used in cell-value-popup-actions. The gradient effect is applied by
    // drift-enhanced.css via background-image overrides.
    for (const selector of requiredSelectors) {
      const block = extractBlock(css, selector);
      const match = block.match(/--btn-primary-bg:\s*([^;]+)/);
      assert.ok(match, `${selector} must define --btn-primary-bg`);
      assert.ok(
        !match![1].includes('gradient'),
        `${selector} --btn-primary-bg must be a solid colour, not a gradient (breaks border-color usage)`,
      );
    }
  });
});

describe('Web theme contract — drift-enhanced.css (CDN-only)', () => {
  let css: string;

  before(() => {
    css = readAsset('web/drift-enhanced.css');
  });

  it('contains showcase glassmorphism effects', () => {
    assert.ok(
      css.includes('backdrop-filter'),
      'drift-enhanced.css must contain backdrop-filter for glassmorphism',
    );
  });

  it('contains animated background keyframes', () => {
    assert.ok(
      css.includes('@keyframes premium-bg-shift'),
      'drift-enhanced.css must contain the background gradient animation',
    );
  });

  it('contains rainbow border animation', () => {
    assert.ok(
      css.includes('@keyframes rainbow-slide'),
      'drift-enhanced.css must contain the rainbow border animation',
    );
  });

  it('contains card entrance animation', () => {
    assert.ok(
      css.includes('@keyframes card-entrance'),
      'drift-enhanced.css must contain the card entrance animation',
    );
  });

  it('contains glass shimmer animation', () => {
    assert.ok(
      css.includes('@keyframes glass-shimmer'),
      'drift-enhanced.css must contain the glass shimmer sweep animation',
    );
  });

  it('contains floating orb animation', () => {
    assert.ok(
      css.includes('@keyframes float-drift'),
      'drift-enhanced.css must contain the floating ambient orb animation',
    );
  });

  it('does NOT redefine core CSS variables (those live in style.css)', () => {
    // The enhanced CSS should only add visual effects — never redefine
    // layout-critical variables, which would cause a flash when it loads.
    assert.ok(
      !css.includes('--bg:') && !css.includes('--fg:'),
      'drift-enhanced.css must not redefine --bg or --fg (layout source of truth is style.css)',
    );
  });

  it('premium section does not contain theme-light or theme-dark selectors', () => {
    // The dark-specific highlight rule is an exception pre-dating this
    // change, but showcase/midnight effects must not bleed into base themes.
    const lines = css.split('\n');
    const premiumStartIdx = lines.findIndex((l) => l.includes('SHOWCASE + MIDNIGHT'));
    assert.ok(premiumStartIdx !== -1, 'drift-enhanced.css must contain a SHOWCASE + MIDNIGHT section');
    const premiumSection = lines.slice(premiumStartIdx);
    for (const line of premiumSection) {
      assert.ok(
        !line.includes('body.theme-dark') && !line.includes('body.theme-light'),
        `Premium section in drift-enhanced.css must not target theme-dark or theme-light: "${line.trim()}"`,
      );
    }
  });

  it('contains midnight theme section with glassmorphism', () => {
    assert.ok(
      css.includes('MIDNIGHT THEME'),
      'drift-enhanced.css must contain a Midnight theme section',
    );
    assert.ok(
      css.includes('body.theme-midnight .app-header'),
      'drift-enhanced.css must style the midnight header',
    );
    assert.ok(
      css.includes('@keyframes midnight-bg-shift'),
      'drift-enhanced.css must contain the midnight background animation',
    );
  });
});

describe('Web theme contract — app.js', () => {
  let js: string;

  before(() => {
    js = readAsset('assets/web/app.js');
  });

  it('applyTheme supports all four theme names', () => {
    // The function must add the correct class to <body>.
    assert.ok(js.includes("'theme-dark'"), 'app.js must reference theme-dark class');
    assert.ok(js.includes("'theme-light'"), 'app.js must reference theme-light class');
    assert.ok(js.includes("'theme-showcase'"), 'app.js must reference theme-showcase class');
    assert.ok(js.includes("'theme-midnight'"), 'app.js must reference theme-midnight class');
  });

  it('theme toggle cycles through themes', () => {
    assert.ok(
      js.includes('nextTheme'),
      'app.js must contain nextTheme function for four-way cycling',
    );
  });

  it('enhanced CSS onload sets _driftEnhancedLoaded flag', () => {
    assert.ok(
      js.includes('_driftEnhancedLoaded'),
      'app.js must set window._driftEnhancedLoaded when enhanced CSS loads',
    );
  });

  it('premium theme applied when enhanced CSS loads and no saved preference', () => {
    // After enhanced CSS loads, if no explicit theme is saved, the
    // onload handler should apply a premium theme (showcase or midnight).
    assert.ok(
      js.includes("applyTheme(cur === 'dark' ? 'midnight' : 'showcase')"),
      'app.js must apply premium theme in enhanced CSS onload when no saved preference',
    );
  });

  it('saved showcase preference degrades to light when enhanced CSS not loaded', () => {
    // If the user saved 'showcase' but enhanced CSS hasn't loaded yet
    // (e.g. CDN blocked), initTheme must fall back to 'light' to avoid
    // a broken experience.
    assert.ok(
      js.includes("saved === 'showcase' && !window._driftEnhancedLoaded"),
      'initTheme must fall back from showcase to light when enhanced CSS is unavailable',
    );
  });

  it('saved midnight preference degrades to dark when enhanced CSS not loaded', () => {
    // If the user saved 'midnight' but enhanced CSS hasn't loaded yet
    // (e.g. CDN blocked), initTheme must fall back to 'dark'.
    assert.ok(
      js.includes("saved === 'midnight' && !window._driftEnhancedLoaded"),
      'initTheme must fall back from midnight to dark when enhanced CSS is unavailable',
    );
  });

  it('markEnhancedReady restores degraded premium theme after CDN loads', () => {
    // When initTheme degrades showcase→light or midnight→dark, the
    // saved localStorage value is still the premium name. When enhanced
    // CSS finally loads, markEnhancedReady must re-apply the saved
    // premium theme instead of leaving the user on the base theme.
    assert.ok(
      js.includes("saved === 'showcase' || saved === 'midnight'"),
      'markEnhancedReady must restore saved premium theme after degradation',
    );
  });

  it('does NOT null link.onload in a timeout (regression: destroyed showcase detection)', () => {
    // Before this fix, a 3-second setTimeout nulled link.onload and
    // link.onload, so if the CDN was slightly slow or the browser
    // never fired onload (VS Code webview), _driftEnhancedLoaded was
    // never set and the showcase theme was permanently locked out.
    assert.ok(
      !js.includes('link.onload = null'),
      'app.js must NOT null link.onload — this destroyed showcase detection in v2.17.0',
    );
  });

  it('uses polling fallback to detect enhanced CSS load', () => {
    // Some browsers/webviews never fire onload for <link> stylesheet
    // elements. The polling fallback checks link.sheet to detect when
    // the CSS is parsed, regardless of whether onload fires.
    assert.ok(
      js.includes('link.sheet'),
      'app.js must poll link.sheet as fallback for onload-less environments',
    );
  });

  it('markEnhancedReady is idempotent', () => {
    // The guard prevents double-applying the showcase theme if both
    // onload and the poll fire.
    assert.ok(
      js.includes('if (window._driftEnhancedLoaded) return'),
      'markEnhancedReady must guard against double invocation',
    );
  });
});
