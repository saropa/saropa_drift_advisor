/**
 * Contract tests for double-click "close other tabs" feature.
 *
 * Validates that:
 *   1. tabs.ts exports closeOtherTabs
 *   2. tabs.ts wires dblclick handlers in both createClosableTab and initTabsAndToolbar
 *   3. closeOtherTabs uses window.confirm before closing
 *   4. closeOtherTabs skips tabs without .tab-btn-close (permanent tabs)
 *
 * Before: no way to bulk-close tabs; each must be closed individually.
 * After: double-click any tab to close all other closeable tabs (with confirmation).
 */
import * as assert from 'assert';
import { readAsset } from './web-theme-test-helpers';

describe('Tab close-others — tabs.ts', () => {
  let tabsSrc: string;

  before(() => {
    tabsSrc = readAsset('assets/web/tabs.ts');
  });

  it('exports closeOtherTabs function', () => {
    assert.ok(
      tabsSrc.includes('export function closeOtherTabs'),
      'tabs.ts must export closeOtherTabs',
    );
  });

  it('closeOtherTabs uses window.confirm for user confirmation', () => {
    assert.ok(
      tabsSrc.includes('window.confirm('),
      'closeOtherTabs must prompt the user via window.confirm before closing tabs',
    );
  });

  it('closeOtherTabs only collects tabs with .tab-btn-close', () => {
    // The function must check for .tab-btn-close to skip permanent tabs
    assert.ok(
      tabsSrc.includes(".querySelector('.tab-btn-close')"),
      'closeOtherTabs must filter by .tab-btn-close to avoid closing permanent tabs',
    );
  });

  it('createClosableTab wires a dblclick handler', () => {
    // Extract the createClosableTab function body to check for dblclick
    const fnStart = tabsSrc.indexOf('export function createClosableTab');
    const fnEnd = tabsSrc.indexOf('export function', fnStart + 1);
    const fnBody = tabsSrc.slice(fnStart, fnEnd);
    assert.ok(
      fnBody.includes("addEventListener('dblclick'"),
      'createClosableTab must attach a dblclick listener for closeOtherTabs',
    );
  });

  it('initTabsAndToolbar wires dblclick on permanent tabs', () => {
    // Extract the initTabsAndToolbar function body to check for dblclick
    const fnStart = tabsSrc.indexOf('export function initTabsAndToolbar');
    const fnEnd = tabsSrc.indexOf('export function', fnStart + 1);
    // fnEnd may be -1 if initTabsAndToolbar is the last export; use end of file
    const fnBody = tabsSrc.slice(fnStart, fnEnd === -1 ? undefined : fnEnd);
    assert.ok(
      fnBody.includes("addEventListener('dblclick'"),
      'initTabsAndToolbar must attach a dblclick listener for permanent tabs',
    );
  });

  it('closeOtherTabs early-returns when nothing to close', () => {
    // Verify the guard: if toClose is empty, the function returns without prompting
    assert.ok(
      tabsSrc.includes('if (toClose.length === 0) return'),
      'closeOtherTabs must early-return when no closeable tabs exist (avoids empty confirm dialog)',
    );
  });
});
