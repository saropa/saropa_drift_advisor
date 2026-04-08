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

  // --- Server-switch tests (new behavior) ---

  it('should reload content when createOrShow is called with a different port', async () => {
    // Before fix: createOrShow with a different port just revealed
    // the stale panel without reloading. Tables from the old project
    // remained visible.
    const htmlA = '<html><head></head><body>Project A</body></html>';
    const htmlB = '<html><head></head><body>Project B</body></html>';
    fetchStub.onFirstCall().resolves(new Response(htmlA, { status: 200 }));

    DriftViewerPanel.createOrShow('127.0.0.1', 8642);
    await new Promise((r) => setTimeout(r, 10));

    // Verify panel shows Project A content
    assert.ok(latestPanel().webview.html.includes('Project A'), 'should show Project A initially');

    // Switch to a different server (different project)
    fetchStub.onSecondCall().resolves(new Response(htmlB, { status: 200 }));
    DriftViewerPanel.createOrShow('127.0.0.1', 9000);
    await new Promise((r) => setTimeout(r, 10));

    // Should NOT create a second panel
    assert.strictEqual(createdPanels.length, 1, 'should reuse existing panel');
    // Should show Project B content, not stale Project A
    assert.ok(latestPanel().webview.html.includes('Project B'), 'should reload with new server content');
    assert.ok(!latestPanel().webview.html.includes('Project A'), 'should not show stale content');
  });

  it('should reload content when createOrShow is called with a different host', async () => {
    const htmlLocal = '<html><head></head><body>Local DB</body></html>';
    const htmlRemote = '<html><head></head><body>Remote DB</body></html>';
    fetchStub.onFirstCall().resolves(new Response(htmlLocal, { status: 200 }));

    DriftViewerPanel.createOrShow('127.0.0.1', 8642);
    await new Promise((r) => setTimeout(r, 10));

    assert.ok(latestPanel().webview.html.includes('Local DB'));

    // Switch to a different host (same port)
    fetchStub.onSecondCall().resolves(new Response(htmlRemote, { status: 200 }));
    DriftViewerPanel.createOrShow('192.168.1.50', 8642);
    await new Promise((r) => setTimeout(r, 10));

    assert.strictEqual(createdPanels.length, 1, 'should reuse existing panel');
    assert.ok(latestPanel().webview.html.includes('Remote DB'), 'should reload for new host');
  });

  it('should not reload when createOrShow is called with same host and port', async () => {
    const serverHtml = '<html><head></head><body>Same Server</body></html>';
    fetchStub.resolves(new Response(serverHtml, { status: 200 }));

    DriftViewerPanel.createOrShow('127.0.0.1', 8642);
    await new Promise((r) => setTimeout(r, 10));

    // Second call with same host/port should NOT trigger another fetch
    const callCountBefore = fetchStub.callCount;
    DriftViewerPanel.createOrShow('127.0.0.1', 8642);

    assert.strictEqual(fetchStub.callCount, callCountBefore, 'should not re-fetch for same server');
  });

  it('should show loading state during server switch', () => {
    // First server connects fine
    fetchStub.onFirstCall().rejects(new Error('connection refused'));
    DriftViewerPanel.createOrShow('127.0.0.1', 8642);

    // Switch to new server — fetch hangs so we can inspect loading state
    fetchStub.onSecondCall().returns(new Promise(() => { /* never resolves */ }));
    DriftViewerPanel.createOrShow('127.0.0.1', 9000);

    const html = latestPanel().webview.html;
    assert.ok(html.includes('Loading Saropa Drift Advisor'), 'should show loading during switch');
    assert.ok(html.includes('127.0.0.1:9000'), 'should show new server URL');
    assert.ok(!html.includes('8642'), 'should not reference old server');
  });

  it('should discard stale fetch when server switches rapidly (race condition guard)', async () => {
    // Scenario: switch to server A (slow), then immediately switch to
    // server B (fast). Server B responds first. When server A finally
    // responds, its HTML must NOT overwrite server B's.
    let resolveA!: (value: Response) => void;
    const htmlA = '<html><head></head><body>Stale Server A</body></html>';
    const htmlB = '<html><head></head><body>Current Server B</body></html>';

    fetchStub.onFirstCall().resolves(new Response('<html><head></head><body>Init</body></html>', { status: 200 }));
    DriftViewerPanel.createOrShow('127.0.0.1', 8000);
    await new Promise((r) => setTimeout(r, 10));

    // Switch to server A (slow — hangs)
    fetchStub.onSecondCall().returns(new Promise<Response>((r) => { resolveA = r; }));
    DriftViewerPanel.createOrShow('127.0.0.1', 9001);

    // Immediately switch to server B (fast — resolves instantly)
    fetchStub.onThirdCall().resolves(new Response(htmlB, { status: 200 }));
    DriftViewerPanel.createOrShow('127.0.0.1', 9002);
    await new Promise((r) => setTimeout(r, 10));

    // Server B should be showing
    assert.ok(latestPanel().webview.html.includes('Current Server B'), 'should show server B');

    // Now server A's slow response arrives — must be discarded
    resolveA(new Response(htmlA, { status: 200 }));
    await new Promise((r) => setTimeout(r, 10));

    assert.ok(latestPanel().webview.html.includes('Current Server B'),
      'stale server A response must not overwrite server B');
    assert.ok(!latestPanel().webview.html.includes('Stale Server A'),
      'stale content from server A must be discarded');
  });

  it('should use current host/port for retry after server switch', async () => {
    // Before fix: retry used closure-captured host/port from the
    // constructor, which pointed to the original server after a switch.
    fetchStub.onFirstCall().resolves(
      new Response('<html><head></head><body>Project A</body></html>', { status: 200 }),
    );
    DriftViewerPanel.createOrShow('127.0.0.1', 8642);
    await new Promise((r) => setTimeout(r, 10));

    // Switch to new server — fails
    fetchStub.onSecondCall().rejects(new Error('connection refused'));
    DriftViewerPanel.createOrShow('127.0.0.1', 9000);
    await new Promise((r) => setTimeout(r, 10));

    assert.ok(latestPanel().webview.html.includes('Cannot connect'));

    // Retry should target port 9000, not the original 8642
    const retryHtml = '<html><head></head><body>Project B Retry</body></html>';
    fetchStub.onThirdCall().resolves(new Response(retryHtml, { status: 200 }));
    latestPanel().webview.simulateMessage({ command: 'retry' });
    await new Promise((r) => setTimeout(r, 10));

    // Verify the retry fetched from the new server (9000), not old (8642)
    const thirdCallUrl = fetchStub.thirdCall.args[0];
    assert.ok(
      thirdCallUrl.includes('9000'),
      'retry should fetch from new port 9000, not original 8642',
    );
    assert.ok(latestPanel().webview.html.includes('Project B Retry'),
      'should show new server content after retry');
  });

  it('should inject correct CSP base URL after server switch', async () => {
    fetchStub.onFirstCall().resolves(
      new Response('<html><head></head><body></body></html>', { status: 200 }),
    );
    DriftViewerPanel.createOrShow('127.0.0.1', 8642);
    await new Promise((r) => setTimeout(r, 10));

    // Switch to different port
    fetchStub.onSecondCall().resolves(
      new Response('<html><head></head><body></body></html>', { status: 200 }),
    );
    DriftViewerPanel.createOrShow('127.0.0.1', 9000);
    await new Promise((r) => setTimeout(r, 10));

    const html = latestPanel().webview.html;
    assert.ok(html.includes('<base href="http://127.0.0.1:9000/"'),
      'base tag should point to new server');
    assert.ok(html.includes('connect-src http://127.0.0.1:9000'),
      'CSP should allow new server');
    assert.ok(!html.includes('8642'),
      'should not reference old server in CSP or base tag');
  });
});
