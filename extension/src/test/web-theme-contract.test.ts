/**
 * Contract tests for the four-theme system in the web viewer.
 *
 * Verifies that the compiled CSS (style.css) and the client JavaScript
 * (app.js) agree on the theme class names and required variables.
 * These tests catch regressions where one artefact is updated but
 * another is not — e.g. renaming a theme class in CSS without
 * updating JS.
 *
 * Base themes: light (default), dark.
 * Premium themes (CDN-only): showcase (light variant), midnight (dark
 * variant). CSS variables live in style.css; glassmorphism effects
 * live in drift-enhanced.css (tested separately in
 * web-theme-enhanced.test.ts).
 *
 * Shared helpers (REPO_ROOT, readAsset, extractBlock) live in
 * web-theme-test-helpers.ts.
 */
import * as assert from 'assert';
import { readAsset, extractBlock } from './web-theme-test-helpers';

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
