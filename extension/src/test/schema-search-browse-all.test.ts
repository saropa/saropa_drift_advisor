/**
 * Tests for the "Browse all tables" feature in Schema Search.
 *
 * Covers two layers:
 *
 * 1. **Webview script contract** — The webview script is a string template
 *    executed inside a browser-like sandbox. These tests verify the presence
 *    of the `browseActive` guard that prevents periodic connectionState
 *    updates from wiping browse results.
 *
 * 2. **Extension host flow** — Verifies that `_doBrowseAll` sends `loading`
 *    then `results` to the webview, and that connectionState messages are
 *    correctly delivered alongside browse requests.
 *
 * Background: Before this fix, every connectionState update (fired by server
 * discovery at ~10 s intervals) called doSearch() when the query box was
 * empty. doSearch() with an empty query replaced the results area with the
 * idle placeholder, immediately wiping any browse-all results.
 */

import * as assert from 'assert';
import * as sinon from 'sinon';
import { resetMocks } from './vscode-mock';
import { EventEmitter } from './vscode-mock-classes';
import { MockWebview } from './vscode-mock-types';
import { DriftApiClient } from '../api-client';
import { SchemaSearchViewProvider } from '../schema-search/schema-search-view';
import { SCHEMA_SEARCH_SCRIPT } from '../schema-search/schema-search-html-content';
import type { DriftConnectionPresentation } from '../connection-ui-state';

// ─── Helpers ──────────────────────────────────────────────────────────

/** Minimal mock for vscode.WebviewView. */
class MockWebviewView {
  webview = new MockWebview();
  visible = true;
  private _onDidChangeVisibility = new EventEmitter();
  onDidChangeVisibility = this._onDidChangeVisibility.event;
  private _onDidDispose = new EventEmitter();
  onDidDispose = this._onDidDispose.event;

  simulateShow(): void {
    this.visible = true;
    this._onDidChangeVisibility.fire();
  }
}

function stubReveal(): { fn: (n: string) => Promise<void>; calls: string[] } {
  const calls: string[] = [];
  return { fn: async (n) => { calls.push(n); }, calls };
}

function connectedPresentation(): DriftConnectionPresentation {
  return {
    connected: true,
    schemaOperationsEnabled: true,
    persistedSchemaAvailable: false,
    label: 'HTTP 127.0.0.1:8642',
    hint: '',
    viaHttp: true,
    viaVm: false,
  };
}

const cancelToken = {
  isCancellationRequested: false,
  onCancellationRequested: () => ({ dispose: () => { /* no-op */ } }),
};

// ─── 1. Webview script contract ───────────────────────────────────────

describe('Schema Search browse-all — webview script contract', () => {
  it('declares browseActive state variable', () => {
    assert.ok(
      SCHEMA_SEARCH_SCRIPT.includes('let browseActive = false'),
      'browseActive flag must exist to guard browse results against connectionState wipes',
    );
  });

  it('sets browseActive = true in the browseAll click handler', () => {
    // The click handler for #browseAll must set browseActive before posting.
    const browseClickIdx = SCHEMA_SEARCH_SCRIPT.indexOf("getElementById('browseAll')");
    assert.ok(browseClickIdx > 0, 'browseAll click handler must exist');

    // browseActive = true should appear between the click handler and the
    // postMessage call (within a reasonable window).
    const afterClick = SCHEMA_SEARCH_SCRIPT.slice(browseClickIdx, browseClickIdx + 200);
    assert.ok(
      afterClick.includes('browseActive = true'),
      'click handler must set browseActive = true before posting searchAll',
    );
  });

  it('guards doSearch() in applyConnectionState with browseActive check', () => {
    // The connectionState handler must NOT call doSearch() when browseActive
    // is true — otherwise periodic discovery updates wipe browse results.
    assert.ok(
      SCHEMA_SEARCH_SCRIPT.includes('&& !browseActive) doSearch()'),
      'applyConnectionState must skip doSearch() when browseActive is true',
    );
  });

  it('clears browseActive when the user types in the search box', () => {
    const inputIdx = SCHEMA_SEARCH_SCRIPT.indexOf("addEventListener('input'");
    assert.ok(inputIdx > 0, 'input event handler must exist');

    // browseActive = false should appear near the input handler.
    const afterInput = SCHEMA_SEARCH_SCRIPT.slice(inputIdx, inputIdx + 200);
    assert.ok(
      afterInput.includes('browseActive = false'),
      'typing in search box must clear browseActive so normal search resumes',
    );
  });

  it('clears browseActive on error to allow idle placeholder to return', () => {
    const errorIdx = SCHEMA_SEARCH_SCRIPT.indexOf("msg.command === 'error'");
    assert.ok(errorIdx > 0, 'error message handler must exist');

    // browseActive = false should appear near the error handler.
    const afterError = SCHEMA_SEARCH_SCRIPT.slice(errorIdx, errorIdx + 200);
    assert.ok(
      afterError.includes('browseActive = false'),
      'error path must clear browseActive so idle message can reappear',
    );
  });

  it('clears browseActive when schemaOps becomes false (disconnect)', () => {
    // If the server disconnects (schemaOps = false), browse results are stale.
    assert.ok(
      SCHEMA_SEARCH_SCRIPT.includes('if (!schemaOps) browseActive = false'),
      'disconnect must clear browseActive to prevent stale browse results',
    );
  });

  it('clears browseActive when scope or type buttons are clicked', () => {
    // Scope and type filter buttons call doSearch() directly, which clears
    // the results area. browseActive must be cleared to keep state consistent.
    const scopeIdx = SCHEMA_SEARCH_SCRIPT.indexOf("scope-btn");
    assert.ok(scopeIdx > 0, 'scope button handler section must exist');

    // Find browseActive = false near the scope handler assignment.
    const scopeSection = SCHEMA_SEARCH_SCRIPT.slice(scopeIdx, scopeIdx + 400);
    assert.ok(
      scopeSection.includes('browseActive = false'),
      'scope button click must clear browseActive',
    );

    const typeIdx = SCHEMA_SEARCH_SCRIPT.indexOf("type-btn");
    assert.ok(typeIdx > 0, 'type button handler section must exist');

    const typeSection = SCHEMA_SEARCH_SCRIPT.slice(typeIdx, typeIdx + 400);
    assert.ok(
      typeSection.includes('browseActive = false'),
      'type button click must clear browseActive',
    );
  });
});

// ─── 2. Extension host: _doBrowseAll flow ─────────────────────────────

describe('Schema Search browse-all — extension host', () => {
  let sandbox: sinon.SinonSandbox;
  let client: DriftApiClient;
  let provider: SchemaSearchViewProvider;
  let view: MockWebviewView;

  beforeEach(() => {
    resetMocks();
    sandbox = sinon.createSandbox();
    client = new DriftApiClient('127.0.0.1', 8642);
    provider = new SchemaSearchViewProvider(client, stubReveal().fn);
    view = new MockWebviewView();

    // Resolve webview and complete the ready handshake.
    provider.resolveWebviewView(view as any, {} as any, cancelToken as any);
    view.webview.simulateMessage({ command: 'ready' });
    view.webview.postedMessages.length = 0;
  });

  afterEach(() => {
    sandbox.restore();
  });

  it('sends loading then results for a successful browse', async () => {
    // Stub fetch to return two tables.
    sandbox.stub(globalThis, 'fetch').resolves(
      new Response(JSON.stringify([
        { name: 'users', rowCount: 10, columns: [{ name: 'id', type: 'INTEGER', pk: true }] },
        { name: 'posts', rowCount: 25, columns: [{ name: 'id', type: 'INTEGER', pk: true }] },
      ]), { status: 200 }),
    );

    // Simulate the webview sending 'searchAll' (click on "Browse all tables").
    view.webview.simulateMessage({ command: 'searchAll' });

    // Allow the async handler to complete.
    await new Promise((r) => setTimeout(r, 50));

    const commands = view.webview.postedMessages.map((m: any) => m.command);
    assert.ok(commands.includes('loading'), 'must send loading indicator');
    assert.ok(commands.includes('results'), 'must send results');

    // loading must come before results.
    const loadingIdx = commands.indexOf('loading');
    const resultsIdx = commands.indexOf('results');
    assert.ok(loadingIdx < resultsIdx, 'loading must precede results');

    // Verify result structure.
    const resultMsg = view.webview.postedMessages.find((m: any) => m.command === 'results') as any;
    assert.strictEqual(resultMsg.result.matches.length, 2);
    assert.strictEqual(resultMsg.result.matches[0].type, 'table');
    assert.strictEqual(resultMsg.result.matches[0].table, 'users');
    assert.strictEqual(resultMsg.result.matches[1].table, 'posts');
  });

  it('sends error when the API call fails', async () => {
    // Stub fetch to fail.
    sandbox.stub(globalThis, 'fetch').rejects(new Error('Connection refused'));

    view.webview.simulateMessage({ command: 'searchAll' });
    await new Promise((r) => setTimeout(r, 1000));

    const commands = view.webview.postedMessages.map((m: any) => m.command);
    assert.ok(commands.includes('loading'), 'must show loading');
    assert.ok(commands.includes('error'), 'must send error on failure');

    const errorMsg = view.webview.postedMessages.find((m: any) => m.command === 'error') as any;
    assert.ok(
      errorMsg.message.includes('Browse failed'),
      `error message should say Browse failed, got: ${errorMsg.message}`,
    );
  });

  it('connectionState after browse does not clear results at host level', async () => {
    // Stub fetch for the browse request.
    sandbox.stub(globalThis, 'fetch').resolves(
      new Response(JSON.stringify([
        { name: 'todos', rowCount: 5, columns: [{ name: 'id', type: 'INTEGER', pk: true }] },
      ]), { status: 200 }),
    );

    // Browse all tables.
    view.webview.simulateMessage({ command: 'searchAll' });
    await new Promise((r) => setTimeout(r, 50));

    // Clear message log and push a connectionState update (simulating discovery).
    view.webview.postedMessages.length = 0;
    provider.setConnectionPresentation(connectedPresentation());

    // The host should post connectionState, NOT a new search/loading/results.
    const commands = view.webview.postedMessages.map((m: any) => m.command);
    assert.ok(
      commands.includes('connectionState'),
      'host must still deliver connectionState',
    );
    assert.ok(
      !commands.includes('loading'),
      'host must NOT trigger a new search after browse (the webview browseActive guard handles this)',
    );
  });

  it('retry after browse replays the browseAll request', async () => {
    // Return a fresh Response on every call — Response body is single-use.
    const body = [{ name: 'items', rowCount: 3, columns: [{ name: 'id', type: 'INTEGER', pk: true }] }];
    const fetchStub = sandbox.stub(globalThis, 'fetch').callsFake(
      () => Promise.resolve(new Response(JSON.stringify(body), { status: 200 })),
    );

    view.webview.simulateMessage({ command: 'searchAll' });
    await new Promise((r) => setTimeout(r, 50));
    view.webview.postedMessages.length = 0;

    // Now retry — should replay browseAll, not a search.
    view.webview.simulateMessage({ command: 'retry' });
    await new Promise((r) => setTimeout(r, 50));

    const commands = view.webview.postedMessages.map((m: any) => m.command);
    assert.ok(commands.includes('loading'), 'retry must show loading');
    assert.ok(commands.includes('results'), 'retry must send results');

    // Verify fetch was called again (browseAllTables → schemaMetadata → fetch).
    assert.ok(fetchStub.callCount >= 2, 'retry must call the API again');
  });
});
