/**
 * Contract tests for Schema Search webview HTML/CSS: always-visible chrome,
 * offline actions, and theme fallbacks (guards against blank/invisible panels).
 */

import * as assert from 'assert';
import { getSchemaSearchHtml } from '../schema-search/schema-search-html';
import { SCHEMA_SEARCH_SCRIPT } from '../schema-search/schema-search-html-content';
import { SCHEMA_SEARCH_STYLE } from '../schema-search/schema-search-html-styles';

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

// ── acquireVsCodeApi single-call contract (regression) ──
//
// Before the fix, the early handshake <script> called acquireVsCodeApi() but
// did NOT store the result globally. The main SCHEMA_SEARCH_SCRIPT then called
// acquireVsCodeApi() a second time, which throws "An API was already acquired".
// The main script's message listener never registered, so connectionState
// messages were silently dropped and Schema Search was stuck on "Waiting for
// the extension" forever.
//
// After the fix: the early script stores in window.__vscodeApi, the main script
// uses window.__vscodeApi || acquireVsCodeApi() to avoid the double call.

describe('acquireVsCodeApi single-call contract', () => {
  it('early handshake stores API in window.__vscodeApi', () => {
    const html = getSchemaSearchHtml('n');
    // The early <script> must assign to window.__vscodeApi so the main script
    // can reuse it instead of calling acquireVsCodeApi() again.
    assert.ok(
      html.includes('window.__vscodeApi=acquireVsCodeApi()'),
      'early script must store API in window.__vscodeApi',
    );
  });

  it('main script reuses window.__vscodeApi instead of calling acquireVsCodeApi again', () => {
    // The main SCHEMA_SEARCH_SCRIPT (injected via ${SCHEMA_SEARCH_SCRIPT})
    // must reference window.__vscodeApi to avoid the double-acquire throw.
    assert.ok(
      SCHEMA_SEARCH_SCRIPT.includes('window.__vscodeApi'),
      'main script must reference window.__vscodeApi for the stored API instance',
    );
  });

  it('acquireVsCodeApi is called at most twice in generated HTML (code, not comments)', () => {
    // Strip HTML and JS comments, then count actual acquireVsCodeApi() calls.
    // Ensures no third call site sneaks in — a third call would throw at runtime.
    const html = getSchemaSearchHtml('n');
    // Remove HTML comments (<!-- ... -->) and JS line comments (// ...).
    const stripped = html
      .replace(/<!--[\s\S]*?-->/g, '')
      .replace(/\/\/[^\n]*/g, '');
    const matches = stripped.match(/acquireVsCodeApi\(\)/g) ?? [];
    assert.ok(
      matches.length <= 2,
      `expected at most 2 acquireVsCodeApi() calls in code, found ${matches.length}`,
    );
    assert.ok(
      matches.length >= 1,
      'at least one acquireVsCodeApi() call must exist',
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
