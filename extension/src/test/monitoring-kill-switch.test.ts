/**
 * Global monitoring & logging kill switch (plans/PLAN_BUILD a KILL SWITCH.md):
 * client endpoints for /api/monitoring, the central 403 interception that
 * turns the server's kill-switch refusal into its informative message, the
 * config read-side defaults, and the hub status card composition.
 */
import * as assert from 'assert';
import * as sinon from 'sinon';
import { DriftApiClient } from '../api-client';
import { fetchWithRetry } from '../transport/fetch-utils';
import {
  MONITORING_CONFIG_KEY,
  isMonitoringEnabled,
  isMonitoringKilled,
} from '../monitoring/monitoring-state';
import { buildHubDocument } from '../hub/hub-html';

describe('monitoring kill switch', () => {
  let fetchStub: sinon.SinonStub;

  beforeEach(() => {
    fetchStub = sinon.stub(globalThis, 'fetch');
  });

  afterEach(() => {
    fetchStub.restore();
  });

  describe('DriftApiClient monitoring endpoints', () => {
    let client: DriftApiClient;

    beforeEach(() => {
      client = new DriftApiClient('127.0.0.1', 8642);
    });

    it('getMonitoring returns the server state', async () => {
      fetchStub.resolves(
        new Response(JSON.stringify({ monitoringEnabled: false }), { status: 200 }),
      );
      assert.strictEqual(await client.getMonitoring(), false);
    });

    it('getMonitoring treats a missing field as enabled', async () => {
      fetchStub.resolves(new Response(JSON.stringify({}), { status: 200 }));
      assert.strictEqual(await client.getMonitoring(), true);
    });

    it('setMonitoring POSTs the flag and returns the new state', async () => {
      fetchStub.resolves(
        new Response(JSON.stringify({ monitoringEnabled: true }), { status: 200 }),
      );
      assert.strictEqual(await client.setMonitoring(true), true);
      const [url, init] = fetchStub.firstCall.args as [string, RequestInit];
      assert.ok(url.endsWith('/api/monitoring'));
      assert.strictEqual(init.method, 'POST');
      assert.deepStrictEqual(JSON.parse(String(init.body)), { enabled: true });
    });
  });

  describe('central 403 interception (fetchWithRetry)', () => {
    it('surfaces the kill-switch error body instead of a bare status', async () => {
      const message =
        'Access Denied: All monitoring and data inspection has been halted by the global kill switch.';
      fetchStub.resolves(
        new Response(JSON.stringify({ error: message }), { status: 403 }),
      );
      await assert.rejects(
        fetchWithRetry('http://127.0.0.1:8642/api/tables'),
        (err: Error) => err.message === message,
      );
    });

    it('passes a non-JSON 403 through untouched (not the kill switch shape)', async () => {
      // Existing per-endpoint handlers format their own "… failed: 403" for
      // plain 403s — only the kill switch's structured JSON error is
      // intercepted, so this response must come back, not throw.
      fetchStub.resolves(new Response('nope', { status: 403 }));
      const resp = await fetchWithRetry('http://127.0.0.1:8642/api/tables');
      assert.strictEqual(resp.status, 403);
    });

    it('does not touch non-403 responses', async () => {
      fetchStub.resolves(new Response(JSON.stringify({ ok: true }), { status: 200 }));
      const resp = await fetchWithRetry('http://127.0.0.1:8642/api/health');
      assert.strictEqual(resp.status, 200);
    });
  });

  describe('config read-side', () => {
    it('defaults to enabled (matching the package.json default)', () => {
      // No workspace override in the test host, so this exercises the
      // code-side fallback — which must be `true` per the convention that
      // reading-site defaults equal manifest defaults.
      assert.strictEqual(isMonitoringEnabled(), true);
      assert.strictEqual(isMonitoringKilled(), false);
      assert.strictEqual(MONITORING_CONFIG_KEY, 'enableMonitoringAndLogging');
    });
  });

  describe('hub status card composition', () => {
    const failed = { ok: false as const };

    it('renders the green Active card with the kill command while enabled', () => {
      const html = buildHubDocument(failed, failed, true);
      assert.ok(html.includes('kill-switch-card'));
      assert.ok(!html.includes('kill-switch-card killed'));
      assert.ok(html.includes('driftViewer.monitoring.kill'));
      assert.ok(html.includes('Monitoring Active'));
    });

    it('renders the red Suppressed card with the resume command while killed', () => {
      const html = buildHubDocument(failed, failed, false);
      assert.ok(html.includes('kill-switch-card killed'));
      assert.ok(html.includes('driftViewer.monitoring.resume'));
      assert.ok(html.includes('Monitoring Suppressed'));
    });

    it('defaults to the enabled card when the argument is omitted', () => {
      const html = buildHubDocument(failed, failed);
      assert.ok(html.includes('driftViewer.monitoring.kill'));
    });
  });
});
