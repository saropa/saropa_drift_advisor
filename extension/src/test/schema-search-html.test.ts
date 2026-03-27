/**
 * Contract tests for Schema Search webview HTML/CSS: always-visible chrome,
 * offline actions, and theme fallbacks (guards against blank/invisible panels).
 */

import * as assert from 'assert';
import { getSchemaSearchHtml } from '../schema-search/schema-search-html';
import { SCHEMA_SEARCH_STYLE } from '../schema-search/schema-search-html-content';

describe('getSchemaSearchHtml', () => {
  it('includes permanent panel chrome not removed by connection script', () => {
    const html = getSchemaSearchHtml('nonce-test');
    assert.ok(
      html.includes('id="schemaPanelChrome"'),
      'header must stay in DOM for visible pixels when theme vars fail',
    );
    assert.ok(html.includes('panel-chrome-title'), 'chrome title');
    assert.ok(
      html.includes('Never hidden by script'),
      'documents intent for reviewer/reader',
    );
  });

  it('includes bootstrap block and Scan Dart sources control', () => {
    const html = getSchemaSearchHtml('x');
    assert.ok(html.includes('schemaHardFallback'), 'bootstrap until host applies state');
    assert.ok(
      html.includes('btnScanDartSchema'),
      'offline dart schema scan must be reachable from the panel',
    );
  });
});

describe('SCHEMA_SEARCH_STYLE', () => {
  it('uses min body height and foreground fallbacks for webview hosts with missing CSS vars', () => {
    assert.ok(
      SCHEMA_SEARCH_STYLE.includes('min-height: 280px'),
      'sidebar webview can collapse to zero without min-height',
    );
    assert.ok(
      SCHEMA_SEARCH_STYLE.includes('--vscode-foreground, #cccccc'),
      'fallback when --vscode-foreground is unset',
    );
    assert.ok(
      SCHEMA_SEARCH_STYLE.includes('.panel-chrome'),
      'chrome block styles',
    );
  });
});
