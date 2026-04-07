/**
 * Contract tests for the table-def-toggle.js module.
 *
 * Verifies that the self-contained collapsible toggle script:
 *  - exists on disk and is non-empty
 *  - injects its own <style> with the required CSS rules
 *  - uses event delegation on .table-definition-heading
 *  - toggles the .td-collapsed class on .table-definition-wrap
 *  - references the correct DOM classes that app.js emits
 *
 * Also verifies that the Dart loader (html_content.dart) references
 * the script so it gets loaded in the web viewer.
 */
import * as assert from 'assert';
import { readAsset } from './web-theme-test-helpers';

describe('table-def-toggle.js — self-contained collapsible module', () => {
  let js: string;

  before(() => {
    js = readAsset('assets/web/table-def-toggle.js');
  });

  it('file exists and is non-empty', () => {
    assert.ok(js.length > 0, 'table-def-toggle.js should not be empty');
  });

  // The module injects its own <style> so no edits to style.scss are needed.
  it('injects a <style> element with collapsible CSS', () => {
    assert.ok(
      js.includes("document.createElement('style')"),
      'should create a <style> element for self-contained styles',
    );
  });

  // Heading must become a clickable toggle with link color.
  it('styles .table-definition-heading as a clickable toggle', () => {
    assert.ok(js.includes('.table-definition-heading'), 'should reference heading class');
    assert.ok(js.includes('cursor: pointer'), 'heading should have pointer cursor');
    assert.ok(js.includes('var(--link)'), 'heading should use --link color');
  });

  // The collapsed state hides .table-definition-scroll inside .td-collapsed.
  it('hides .table-definition-scroll when .td-collapsed is set', () => {
    assert.ok(
      js.includes('.td-collapsed .table-definition-scroll'),
      'should hide scroll container via .td-collapsed parent class',
    );
    assert.ok(
      js.includes('display: none'),
      'hidden state should use display: none',
    );
  });

  // Uses event delegation so it works with dynamically injected HTML.
  it('uses document-level event delegation for click handling', () => {
    assert.ok(
      js.includes("document.addEventListener('click'"),
      'should use document-level click delegation',
    );
  });

  // Toggles .td-collapsed on the .table-definition-wrap container.
  it('toggles .td-collapsed class on .table-definition-wrap', () => {
    assert.ok(
      js.includes('.table-definition-wrap'),
      'should target .table-definition-wrap container',
    );
    assert.ok(
      js.includes("'td-collapsed'"),
      'should toggle td-collapsed class',
    );
  });

  // Arrow characters: ▼ (collapsed) and ▲ (expanded).
  it('swaps ▼/▲ arrow in heading text', () => {
    assert.ok(js.includes('\u25BC'), 'should contain ▼ (down arrow for collapsed)');
    assert.ok(js.includes('\u25B2'), 'should contain ▲ (up arrow for expanded)');
  });

  // Applies collapsed state to existing panels on load.
  it('collapses existing panels on initial load', () => {
    assert.ok(
      js.includes('.table-definition-wrap'),
      'should query existing wraps on load',
    );
    assert.ok(
      js.includes("'td-collapsed'"),
      'should add td-collapsed class to existing panels',
    );
  });
});

describe('table-def-toggle.js — Dart loader integration', () => {
  let htmlContent: string;
  let genHandler: string;

  before(() => {
    htmlContent = readAsset('lib/src/server/html_content.dart');
    genHandler = readAsset('lib/src/server/generation_handler.dart');
  });

  it('html_content.dart accepts inlineTableDefToggleJs parameter', () => {
    assert.ok(
      htmlContent.includes('inlineTableDefToggleJs'),
      'buildIndexHtml should accept inlineTableDefToggleJs parameter',
    );
  });

  it('html_content.dart emits the table-def-toggle script tag', () => {
    assert.ok(
      htmlContent.includes('tableDefToggleJsTag'),
      'should reference tableDefToggleJsTag in the HTML template',
    );
    assert.ok(
      htmlContent.includes('table-def-toggle.js'),
      'CDN fallback should reference table-def-toggle.js',
    );
  });

  it('generation_handler.dart caches table-def-toggle.js', () => {
    assert.ok(
      genHandler.includes('_cachedTableDefToggleJs'),
      'should have a cache field for table-def-toggle.js',
    );
    assert.ok(
      genHandler.includes("'assets/web/table-def-toggle.js'"),
      'should read table-def-toggle.js from disk',
    );
  });

  it('generation_handler.dart passes cached JS to buildIndexHtml', () => {
    assert.ok(
      genHandler.includes('inlineTableDefToggleJs: _cachedTableDefToggleJs'),
      'should pass cached JS to buildIndexHtml',
    );
  });
});

describe('table-def-toggle.js — app.js DOM contract', () => {
  let appJs: string;

  before(() => {
    appJs = readAsset('assets/web/app.js');
  });

  // The toggle module targets .table-definition-heading and
  // .table-definition-wrap — these classes must exist in app.js output.
  it('app.js emits .table-definition-wrap', () => {
    assert.ok(
      appJs.includes('table-definition-wrap'),
      'buildTableDefinitionHtml should emit table-definition-wrap class',
    );
  });

  it('app.js emits .table-definition-heading', () => {
    assert.ok(
      appJs.includes('table-definition-heading'),
      'buildTableDefinitionHtml should emit table-definition-heading class',
    );
  });

  it('app.js emits .table-definition-scroll', () => {
    assert.ok(
      appJs.includes('table-definition-scroll'),
      'buildTableDefinitionHtml should emit table-definition-scroll class',
    );
  });
});
