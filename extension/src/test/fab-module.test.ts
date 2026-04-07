/**
 * Contract tests for the Super FAB (floating action button) module.
 *
 * Validates that:
 *   1. FAB styles live in _fab.scss and are imported by style.scss
 *   2. FAB UI logic lives in fab.js (self-contained module)
 *   3. The FAB opens upward (trigger first in DOM, column-reverse)
 *   4. Share button lives in the FAB menu, not the header
 *   5. Menu items are right-aligned (flex-end)
 *   6. app.js no longer contains the initSuperFab IIFE
 *
 * Before: FAB styles inline in style.scss, FAB init in app.js,
 *   Share button in header, FAB opened downward, items centered.
 *
 * After: FAB styles in _fab.scss partial, FAB init in fab.js,
 *   Share in FAB menu, FAB opens upward, items right-aligned.
 */
import * as assert from 'assert';
import { readAsset } from './web-theme-test-helpers';

describe('Super FAB module — style.css', () => {
  let css: string;

  before(() => {
    css = readAsset('assets/web/style.css');
  });

  it('FAB container uses column-reverse for upward expansion', () => {
    // The .super-fab container must use column-reverse so the trigger
    // (first in DOM) renders at the bottom and the menu fans upward.
    assert.ok(
      css.includes('.super-fab'),
      'Compiled CSS must contain .super-fab selector',
    );
    // Extract the .super-fab block and verify direction.
    const idx = css.indexOf('.super-fab {');
    assert.ok(idx !== -1, '.super-fab { block not found');
    const block = css.substring(idx, idx + 500);
    assert.ok(
      block.includes('flex-direction: column-reverse'),
      '.super-fab must use flex-direction: column-reverse for upward expansion',
    );
  });

  it('FAB container is right-aligned (flex-end)', () => {
    const idx = css.indexOf('.super-fab {');
    const block = css.substring(idx, idx + 500);
    assert.ok(
      block.includes('align-items: flex-end'),
      '.super-fab must use align-items: flex-end for right alignment',
    );
  });

  it('FAB menu items are right-aligned (flex-end)', () => {
    const idx = css.indexOf('.super-fab-menu {');
    assert.ok(idx !== -1, '.super-fab-menu { block not found');
    const block = css.substring(idx, idx + 300);
    assert.ok(
      block.includes('align-items: flex-end'),
      '.super-fab-menu must use align-items: flex-end for right alignment',
    );
  });

  it('FAB trigger has fixed positioning at bottom-right', () => {
    const idx = css.indexOf('.super-fab {');
    const block = css.substring(idx, idx + 300);
    assert.ok(block.includes('position: fixed'), '.super-fab must be position: fixed');
    assert.ok(block.includes('bottom:'), '.super-fab must have bottom offset');
    assert.ok(block.includes('right:'), '.super-fab must have right offset');
  });

  it('FAB respects reduced motion preference', () => {
    assert.ok(
      css.includes('prefers-reduced-motion'),
      'FAB must include reduced motion media query',
    );
  });
});

describe('Super FAB module — fab.js', () => {
  let fabJs: string;

  before(() => {
    fabJs = readAsset('assets/web/fab.js');
  });

  it('fab.js exists and is self-contained', () => {
    assert.ok(
      fabJs.length > 0,
      'fab.js must exist and have content',
    );
  });

  it('fab.js initializes via IIFE', () => {
    assert.ok(
      fabJs.includes('initSuperFab'),
      'fab.js must contain initSuperFab function',
    );
  });

  it('fab.js toggles open/close via .open class', () => {
    assert.ok(
      fabJs.includes("classList.toggle('open'") || fabJs.includes('classList.contains(\'open\')'),
      'fab.js must toggle the .open class on the FAB container',
    );
  });

  it('fab.js handles Escape key to close', () => {
    assert.ok(
      fabJs.includes("e.key === 'Escape'"),
      'fab.js must close the FAB on Escape key',
    );
  });

  it('fab.js handles outside clicks to close', () => {
    assert.ok(
      fabJs.includes('fab.contains'),
      'fab.js must close the FAB when clicking outside',
    );
  });

  it('fab.js updates aria-expanded and aria-hidden', () => {
    assert.ok(
      fabJs.includes('aria-expanded'),
      'fab.js must toggle aria-expanded on the trigger',
    );
    assert.ok(
      fabJs.includes('aria-hidden'),
      'fab.js must toggle aria-hidden on the menu',
    );
  });
});

describe('Super FAB module — app.js integration', () => {
  let appJs: string;

  before(() => {
    appJs = readAsset('assets/web/app.js');
  });

  it('app.js no longer contains initSuperFab IIFE', () => {
    // The FAB UI init was moved to fab.js; app.js should only
    // contain a comment referencing the move, not the actual code.
    assert.ok(
      !appJs.includes('function initSuperFab()'),
      'app.js must not contain initSuperFab — it belongs in fab.js',
    );
    assert.ok(
      !appJs.includes('function toggleFab()'),
      'app.js must not contain toggleFab — it belongs in fab.js',
    );
  });

  it('app.js references fab-share-btn (not share-btn) for share action', () => {
    assert.ok(
      appJs.includes('fab-share-btn'),
      'app.js must reference fab-share-btn for the share action',
    );
    assert.ok(
      !appJs.includes("'share-btn'"),
      'app.js must not reference the old share-btn ID',
    );
  });

  it('share button reset restores FAB icon+label structure', () => {
    // After a share session completes, the button must restore its
    // icon+label innerHTML, not use plain textContent (which would
    // strip the Material icon span).
    assert.ok(
      appJs.includes('fab-action-label">Share</span>'),
      'Share button reset must restore the fab-action-label structure',
    );
  });
});
