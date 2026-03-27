/**
 * Tests for deprecated SchemaSearchViewProvider compatibility APIs.
 */
import * as assert from 'assert';
import * as sinon from 'sinon';
import { resetMocks } from './vscode-mock';
import { EventEmitter } from './vscode-mock-classes';
import { MockWebview } from './vscode-mock-types';
import { DriftApiClient } from '../api-client';
import { SchemaSearchViewProvider } from '../schema-search/schema-search-view';

class MockWebviewView {
  webview = new MockWebview();
  visible = true;
  private _onDidChangeVisibility = new EventEmitter();
  onDidChangeVisibility = this._onDidChangeVisibility.event;
  private _onDidDispose = new EventEmitter();
  onDidDispose = this._onDidDispose.event;
}
const cancelToken = { isCancellationRequested: false, onCancellationRequested: () => ({ dispose: () => {} }) };

describe('SchemaSearchViewProvider deprecated setConnected', () => {
  let sandbox: sinon.SinonSandbox;
  let provider: SchemaSearchViewProvider;
  let view: MockWebviewView;
  beforeEach(() => {
    resetMocks();
    sandbox = sinon.createSandbox();
    sandbox.stub(globalThis, 'fetch').resolves(new Response(JSON.stringify({ tables: [] }), { status: 200 }));
    provider = new SchemaSearchViewProvider(new DriftApiClient('127.0.0.1', 8642), async () => {});
    view = new MockWebviewView();
  });
  afterEach(() => sandbox.restore());

  it('converts boolean to a connection presentation', () => {
    provider.setConnected(true);
    const state = provider.getDiagnosticState();
    assert.strictEqual(state.presentationConnected, true);
    assert.strictEqual(state.presentationLabel, 'Connected');
  });

  it('delivers connectionState when webview is ready', () => {
    provider.resolveWebviewView(view as any, {} as any, cancelToken as any);
    view.webview.simulateMessage({ command: 'ready' });
    view.webview.postedMessages.length = 0;
    provider.setConnected(false);
    const stateMessages = view.webview.postedMessages.filter((m: any) => m.command === 'connectionState');
    assert.strictEqual(stateMessages.length, 1);
    assert.strictEqual((stateMessages[0] as any).connected, false);
    assert.strictEqual((stateMessages[0] as any).schemaOperationsEnabled, false);
    assert.strictEqual((stateMessages[0] as any).persistedSchemaAvailable, false);
  });
});
