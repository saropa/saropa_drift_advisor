/**
 * Contract tests for drift-enhanced.css (CDN-only premium stylesheet).
 *
 * Verifies that the enhanced stylesheet contains the expected
 * glassmorphism effects, animations, and safety constraints for the
 * showcase and midnight premium themes. These tests ensure the
 * enhanced CSS adds visual flair without breaking the base layout
 * defined in style.css.
 *
 * Split from web-theme-contract.test.ts to keep each file under the
 * 300-line threshold. Shared helpers live in web-theme-test-helpers.ts.
 */
import * as assert from 'assert';
import { readAsset, extractBlock } from './web-theme-test-helpers';

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

  it('does NOT override position on .app-header (breaks sticky header)', () => {
    // The base CSS sets .app-header { position: sticky; z-index: 100; }.
    // If drift-enhanced.css sets position: relative or position: absolute
    // on a theme-qualified .app-header selector, it will override sticky
    // because the theme selector has higher specificity. The header will
    // scroll away instead of staying fixed at the top.
    const lines = css.split('\n');
    for (const line of lines) {
      if (line.includes('.app-header') && line.includes('{') && !line.includes('::') && !line.includes('>')) {
        // Found a rule targeting .app-header directly (not ::after or > *)
        // Read ahead to check for position override inside the block
        const blockStart = lines.indexOf(line);
        for (let i = blockStart + 1; i < lines.length && i < blockStart + 15; i++) {
          if (lines[i].includes('}')) break;
          assert.ok(
            !lines[i].match(/^\s*position\s*:\s*(relative|absolute|fixed)/),
            `drift-enhanced.css must not set position on .app-header (found at line ${i + 1}: "${lines[i].trim()}" — this breaks sticky header)`,
          );
        }
      }
    }
  });

  it('clips shimmer on .app-header with overflow:hidden', () => {
    // The shimmer ::after pseudo-element uses translateX(350%) which
    // extends far beyond the header. Without overflow:hidden the
    // shimmer would cause horizontal scrollbar flicker.
    const showcaseHeader = css.indexOf('body.theme-showcase .app-header {');
    const midnightHeader = css.indexOf('body.theme-midnight .app-header {');
    assert.ok(showcaseHeader !== -1, 'showcase header rule must exist');
    assert.ok(midnightHeader !== -1, 'midnight header rule must exist');

    // Check both blocks contain overflow: hidden
    const showcaseBlock = extractBlock(css, 'body.theme-showcase .app-header {');
    const midnightBlock = extractBlock(css, 'body.theme-midnight .app-header {');
    assert.ok(
      showcaseBlock.includes('overflow: hidden') || showcaseBlock.includes('overflow:hidden'),
      'showcase .app-header must have overflow:hidden to clip shimmer',
    );
    assert.ok(
      midnightBlock.includes('overflow: hidden') || midnightBlock.includes('overflow:hidden'),
      'midnight .app-header must have overflow:hidden to clip shimmer',
    );
  });

  it('floating orbs have pointer-events:none', () => {
    // The ::before and ::after on body create floating blurred orbs.
    // They must not intercept clicks or the entire page becomes
    // unresponsive behind the orbs.
    const bodyBefore = extractBlock(css, 'body.theme-showcase::before');
    const bodyAfter = extractBlock(css, 'body.theme-showcase::after');
    assert.ok(
      bodyBefore.includes('pointer-events: none'),
      'showcase ::before orb must have pointer-events:none',
    );
    assert.ok(
      bodyAfter.includes('pointer-events: none'),
      'showcase ::after orb must have pointer-events:none',
    );
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
