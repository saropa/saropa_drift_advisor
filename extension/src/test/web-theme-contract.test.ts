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

describe('Web theme contract — theme.ts', () => {
  let js: string;

  before(() => {
    // Theme functions (applyTheme, nextTheme, initTheme) moved to theme.ts
    js = readAsset('assets/web/theme.ts');
  });

  it('applyTheme supports all four theme names', () => {
    // The function must add the correct class to <body>.
    assert.ok(js.includes("'theme-dark'"), 'theme.ts must reference theme-dark class');
    assert.ok(js.includes("'theme-light'"), 'theme.ts must reference theme-light class');
    assert.ok(js.includes("'theme-showcase'"), 'theme.ts must reference theme-showcase class');
    assert.ok(js.includes("'theme-midnight'"), 'theme.ts must reference theme-midnight class');
  });

  it('theme toggle cycles through themes', () => {
    assert.ok(
      js.includes('nextTheme'),
      'theme.ts must contain nextTheme function for four-way cycling',
    );
  });

  it('does NOT reference _driftEnhancedLoaded (all themes inline)', () => {
    // Premium theme effects are now built into style.css. There is no
    // external CDN stylesheet, so the _driftEnhancedLoaded gate and
    // markEnhancedReady logic are removed entirely.
    assert.ok(
      !js.includes('_driftEnhancedLoaded'),
      'theme.ts must not reference _driftEnhancedLoaded (all themes are always available)',
    );
  });

  it('does NOT reference drift-enhanced.css (no CDN dependency)', () => {
    assert.ok(
      !js.includes('drift-enhanced'),
      'theme.ts must not load drift-enhanced.css (effects are inline in style.css)',
    );
  });

  it('initTheme applies saved theme directly without degradation', () => {
    // Previously, initTheme degraded showcase->light and midnight->dark
    // when CDN CSS was not loaded. Now all themes are always available,
    // so initTheme must apply the saved value directly via applyTheme(saved).
    assert.ok(
      js.includes('applyTheme(saved)'),
      'initTheme must apply saved theme directly without CDN checks',
    );
    assert.ok(
      !js.includes("saved === 'showcase' && !window"),
      'initTheme must not degrade showcase to light',
    );
    assert.ok(
      !js.includes("saved === 'midnight' && !window"),
      'initTheme must not degrade midnight to dark',
    );
  });
});
