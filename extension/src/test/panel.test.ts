import * as assert from 'assert';
import * as sinon from 'sinon';
import { createdPanels, MockWebviewPanel, resetMocks } from './vscode-mock';
import { DriftViewerPanel } from '../panel';

describe('DriftViewerPanel', () => {
  let fetchStub: sinon.SinonStub;

  beforeEach(() => {
    resetMocks();
    // Reset singleton between tests
    (DriftViewerPanel as any).currentPanel = undefined;
    fetchStub = sinon.stub(globalThis, 'fetch');
  });

  afterEach(() => {
    fetchStub.restore();
  });

  function latestPanel(): MockWebviewPanel {
    return createdPanels[createdPanels.length - 1];
  }

  it('should create a new panel when none exists', () => {
    fetchStub.rejects(new Error('connection refused'));
    DriftViewerPanel.createOrShow('127.0.0.1', 8642);

    assert.strictEqual(createdPanels.length, 1);
    assert.ok(DriftViewerPanel.currentPanel);
  });

  it('should reveal existing panel instead of creating a second', () => {
    fetchStub.rejects(new Error('connection refused'));
    DriftViewerPanel.createOrShow('127.0.0.1', 8642);
    DriftViewerPanel.createOrShow('127.0.0.1', 8642);

    assert.strictEqual(createdPanels.length, 1, 'should not create a second panel');
    assert.strictEqual(latestPanel().revealed, true);
  });

  it('should show loading state immediately', () => {
    // Make fetch hang forever so we can inspect the loading state
    fetchStub.returns(new Promise(() => { /* never resolves */ }));
    DriftViewerPanel.createOrShow('127.0.0.1', 8642);

    const html = latestPanel().webview.html;
    assert.ok(html.includes('Loading Saropa Drift Advisor'), 'should show loading message');
    assert.ok(html.includes('127.0.0.1:8642'), 'should show server URL');
  });

  it('should show error HTML when server is unreachable', async () => {
    fetchStub.rejects(new Error('connection refused'));
    DriftViewerPanel.createOrShow('127.0.0.1', 8642);

    // Let the async _loadContent settle
    await new Promise((r) => setTimeout(r, 10));

    const html = latestPanel().webview.html;
    assert.ok(html.includes('Cannot connect'), 'should show error message');
    assert.ok(html.includes('DriftDebugServer.start()'), 'should show help text');
    assert.ok(html.includes('postMessage'), 'retry should use postMessage');
  });

  it('should inject <base> and CSP into fetched HTML', async () => {
    const serverHtml = '<html><head><title>Drift DB</title></head><body>OK</body></html>';
    fetchStub.resolves(new Response(serverHtml, { status: 200 }));

    DriftViewerPanel.createOrShow('127.0.0.1', 8642);
    await new Promise((r) => setTimeout(r, 10));

    const html = latestPanel().webview.html;
    assert.ok(html.includes('<base href="http://127.0.0.1:8642/"'), 'should inject base tag');
    assert.ok(html.includes('Content-Security-Policy'), 'should inject CSP meta tag');
    assert.ok(html.includes("connect-src http://127.0.0.1:8642"), 'CSP should allow server');
  });

  it('should include font-src in CSP', async () => {
    const serverHtml = '<html><head></head><body></body></html>';
    fetchStub.resolves(new Response(serverHtml, { status: 200 }));

    DriftViewerPanel.createOrShow('127.0.0.1', 8642);
    await new Promise((r) => setTimeout(r, 10));

    const html = latestPanel().webview.html;
    assert.ok(html.includes('font-src'), 'CSP should include font-src');
    assert.ok(
      html.includes('https://fonts.gstatic.com'),
      'CSP font-src must allow Google Fonts files (was font-src only baseUrl+data before drift-enhanced/CDN work)',
    );
  });

  it('should allow jsDelivr and font stylesheets in CSP when local /assets/web/* may 404', async () => {
    // When the Dart server cannot serve package files, the HTML shell falls
    // back to jsDelivr; the webview must not block those loads. Before: only
    // 'unsafe-inline' for style-src/script-src — CDN fallbacks were blocked.
    const serverHtml = '<html><head></head><body></body></html>';
    fetchStub.resolves(new Response(serverHtml, { status: 200 }));

    DriftViewerPanel.createOrShow('127.0.0.1', 8642);
    await new Promise((r) => setTimeout(r, 10));

    const html = latestPanel().webview.html;
    const cspMatch = html.match(/Content-Security-Policy" content="([^"]+)"/);
    assert.ok(cspMatch, 'CSP meta content should be present');
    const csp = cspMatch[1];
    assert.ok(
      csp.includes('https://cdn.jsdelivr.net'),
      'style-src and script-src must allow jsDelivr for GitHub-served fallback assets',
    );
    assert.ok(
      csp.includes('https://fonts.googleapis.com'),
      'style-src must allow Google Fonts CSS links from the HTML shell',
    );
    assert.ok(
      csp.includes('style-src') && csp.includes('http://127.0.0.1:8642'),
      'style-src must allow same-origin debug server stylesheets',
    );
  });

  it('should not set HTML after panel is disposed', async () => {
    // Simulate: fetch takes time, panel is closed before response arrives
    let resolveFetch!: (value: Response) => void;
    fetchStub.returns(new Promise<Response>((r) => { resolveFetch = r; }));

    DriftViewerPanel.createOrShow('127.0.0.1', 8642);
    const panel = latestPanel();

    // Capture the loading HTML
    const loadingHtml = panel.webview.html;

    // Close panel before fetch resolves
    panel.simulateClose();

    // Now resolve the fetch
    resolveFetch(new Response('<html><head></head><body>Server HTML</body></html>'));
    await new Promise((r) => setTimeout(r, 10));

    // HTML should still be the loading state (not overwritten after dispose)
    assert.strictEqual(panel.webview.html, loadingHtml, 'should not update HTML after dispose');
  });

  it('should clear singleton on dispose', () => {
    fetchStub.rejects(new Error('connection refused'));
    DriftViewerPanel.createOrShow('127.0.0.1', 8642);
    assert.ok(DriftViewerPanel.currentPanel);

    latestPanel().simulateClose();
    assert.strictEqual(DriftViewerPanel.currentPanel, undefined, 'should clear singleton');
  });

  it('should re-fetch on retry message', async () => {
    // First call: fail
    fetchStub.onFirstCall().rejects(new Error('connection refused'));
    DriftViewerPanel.createOrShow('127.0.0.1', 8642);
    await new Promise((r) => setTimeout(r, 10));

    assert.ok(latestPanel().webview.html.includes('Cannot connect'));

    // Second call: succeed
    const serverHtml = '<html><head></head><body>OK</body></html>';
    fetchStub.onSecondCall().resolves(new Response(serverHtml, { status: 200 }));

    // Simulate the webview sending a retry message
    latestPanel().webview.simulateMessage({ command: 'retry' });
    await new Promise((r) => setTimeout(r, 10));

    assert.ok(latestPanel().webview.html.includes('OK'), 'should show server content after retry');
  });
});
