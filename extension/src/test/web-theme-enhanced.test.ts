/**
 * Contract tests for premium theme effects (showcase + midnight) in style.css.
 *
 * Verifies that the compiled stylesheet contains the expected glassmorphism
 * effects, animations, and safety constraints. All effects are inline in
 * style.css (no external CDN stylesheet). Split from
 * web-theme-contract.test.ts for modularity. Shared helpers live in
 * web-theme-test-helpers.ts.
 */
import * as assert from 'assert';
import { readAsset, extractBlock } from './web-theme-test-helpers';

describe('Web theme contract — premium theme effects in style.css', () => {
  let css: string;

  before(() => {
    css = readAsset('assets/web/style.css');
  });

  // --- Showcase theme: glassmorphism + rainbow accents ---

  it('contains showcase glassmorphism backdrop-filter', () => {
    assert.ok(
      css.includes('backdrop-filter'),
      'style.css must contain backdrop-filter for glassmorphism',
    );
  });

  it('contains showcase animated background keyframes', () => {
    assert.ok(
      css.includes('@keyframes showcase-bg-shift'),
      'style.css must contain the showcase background gradient animation',
    );
  });

  it('contains showcase rainbow border animation', () => {
    assert.ok(
      css.includes('@keyframes showcase-rainbow-border'),
      'style.css must contain the rainbow border animation for expanded cards',
    );
  });

  it('contains card entrance animation', () => {
    assert.ok(
      css.includes('@keyframes fancy-card-enter'),
      'style.css must contain the card entrance animation',
    );
  });

  it('contains header entrance animation', () => {
    assert.ok(
      css.includes('@keyframes fancy-header-enter'),
      'style.css must contain the header entrance animation',
    );
  });

  it('contains sidebar title slide animation', () => {
    assert.ok(
      css.includes('@keyframes fancy-slide-right'),
      'style.css must contain the sidebar title slide-in animation',
    );
  });

  // --- Midnight theme: aurora + glow ---

  it('contains midnight aurora background animation', () => {
    assert.ok(
      css.includes('@keyframes midnight-aurora'),
      'style.css must contain the midnight aurora background animation',
    );
  });

  it('contains midnight floating orb animation', () => {
    assert.ok(
      css.includes('@keyframes midnight-orb-drift'),
      'style.css must contain the midnight floating orb animation',
    );
  });

  it('contains midnight glow border animation', () => {
    assert.ok(
      css.includes('@keyframes midnight-glow-border'),
      'style.css must contain the midnight glow border animation',
    );
  });

  it('midnight header has glassmorphism', () => {
    // Use the MIDNIGHT THEME section marker to find the right header rule.
    // The base .app-header does not have backdrop-filter.
    const midnightIdx = css.indexOf('MIDNIGHT THEME');
    assert.ok(midnightIdx !== -1, 'style.css must contain a MIDNIGHT THEME section');
    const midnightSection = css.substring(midnightIdx);
    const block = extractBlock(midnightSection, 'body.theme-midnight .app-header');
    assert.ok(block.length > 0, 'midnight .app-header rule must exist in theme section');
    assert.ok(
      block.includes('backdrop-filter'),
      'midnight header must use backdrop-filter for glass effect',
    );
  });

  // --- Safety constraints ---

  it('premium effects section does not target base themes', () => {
    const lines = css.split('\n');
    const showcaseIdx = lines.findIndex((l) => l.includes('SHOWCASE THEME'));
    assert.ok(showcaseIdx !== -1, 'style.css must contain a SHOWCASE THEME section');
    const reducedIdx = lines.findIndex(
      (l, i) => i > showcaseIdx && l.includes('prefers-reduced-motion'),
    );
    const premiumSection = lines.slice(
      showcaseIdx,
      reducedIdx === -1 ? undefined : reducedIdx,
    );
    for (const line of premiumSection) {
      assert.ok(
        !line.includes('body.theme-dark ') && !line.includes('body.theme-light '),
        `Premium effects section must not target base themes: "${line.trim()}"`,
      );
    }
  });

  it('midnight ::before orb has pointer-events: none', () => {
    const block = extractBlock(css, 'body.theme-midnight::before');
    assert.ok(block.length > 0, 'body.theme-midnight::before must exist');
    assert.ok(
      block.includes('pointer-events: none'),
      'midnight ::before orb must have pointer-events: none',
    );
  });

  it('expanded card ::before has pointer-events: none', () => {
    const showcaseBlock = extractBlock(
      css,
      'body.theme-showcase .feature-card.expanded::before',
    );
    const midnightBlock = extractBlock(
      css,
      'body.theme-midnight .feature-card.expanded::before',
    );
    assert.ok(showcaseBlock.length > 0, 'showcase expanded ::before must exist');
    assert.ok(midnightBlock.length > 0, 'midnight expanded ::before must exist');
    assert.ok(
      showcaseBlock.includes('pointer-events: none'),
      'showcase expanded ::before must have pointer-events: none',
    );
    assert.ok(
      midnightBlock.includes('pointer-events: none'),
      'midnight expanded ::before must have pointer-events: none',
    );
  });

  it('reduced motion disables all theme animations', () => {
    const lines = css.split('\n');
    // Find the LAST reduced-motion block (the theme one, not the FAB one)
    let lastReducedIdx = -1;
    for (let i = 0; i < lines.length; i++) {
      if (lines[i].includes('prefers-reduced-motion')) lastReducedIdx = i;
    }
    assert.ok(lastReducedIdx > 0, 'reduced-motion media query must exist');
    const block = lines.slice(lastReducedIdx, lastReducedIdx + 30).join('\n');
    assert.ok(
      block.includes('body.theme-showcase'),
      'reduced-motion must target showcase theme',
    );
    assert.ok(
      block.includes('body.theme-midnight'),
      'reduced-motion must target midnight theme',
    );
    assert.ok(
      block.includes('animation: none'),
      'reduced-motion must set animation: none',
    );
  });

  // --- JS integration: no CDN dependency ---

  it('app.js does not reference drift-enhanced.css', () => {
    const js = readAsset('assets/web/app.js');
    assert.ok(
      !js.includes('drift-enhanced'),
      'app.js must not reference drift-enhanced.css (effects are inline)',
    );
  });

  it('app.js does not gate themes behind _driftEnhancedLoaded', () => {
    const js = readAsset('assets/web/app.js');
    assert.ok(
      !js.includes('_driftEnhancedLoaded'),
      'app.js must not use _driftEnhancedLoaded flag',
    );
  });

  it('theme.ts nextTheme always cycles through all four themes', () => {
    // nextTheme moved from app.js to theme.ts
    const js = readAsset('assets/web/theme.ts');
    const nextThemeMatch = js.match(
      /function nextTheme[\s\S]*?var cycle = \[(.*?)\]/,
    );
    assert.ok(nextThemeMatch, 'nextTheme function must define a cycle array');
    const cycle = nextThemeMatch![1];
    assert.ok(cycle.includes('light'), 'cycle must include light');
    assert.ok(cycle.includes('showcase'), 'cycle must include showcase');
    assert.ok(cycle.includes('dark'), 'cycle must include dark');
    assert.ok(cycle.includes('midnight'), 'cycle must include midnight');
  });
});
