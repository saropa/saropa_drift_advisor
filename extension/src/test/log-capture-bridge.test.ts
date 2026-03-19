import * as assert from 'node:assert';
import * as sinon from 'sinon';
import { DriftApiClient } from '../api-client';
import { LogCaptureBridge, type LogCaptureIssueLike } from '../debug/log-capture-bridge';
import { BASE, mockEndContext, stubSessionEndFetch } from './log-capture-bridge-test-helpers';
import { Range, Uri } from './vscode-mock-classes';
import { extensions, workspace } from './vscode-mock';

describe('LogCaptureBridge', () => {
  let fetchStub: sinon.SinonStub;
  let client: DriftApiClient;
  let bridge: LogCaptureBridge;
  let fakeContext: { subscriptions: any[] };

  beforeEach(() => {
    fetchStub = sinon.stub(globalThis, 'fetch');
    client = new DriftApiClient('127.0.0.1', 8642);
    bridge = new LogCaptureBridge();
    fakeContext = { subscriptions: [] };
  });

  afterEach(() => {
    bridge.dispose();
    extensions.clearExtensions();
    fetchStub.restore();
  });

  describe('when saropa-log-capture is installed', () => {
    let writeLineSpy: sinon.SinonSpy;
    let insertMarkerSpy: sinon.SinonSpy;
    let registeredProvider: any;

    beforeEach(async () => {
      writeLineSpy = sinon.spy();
      insertMarkerSpy = sinon.spy();

      const fakeApi = {
        writeLine: writeLineSpy,
        insertMarker: insertMarkerSpy,
        getSessionInfo: () => ({ isActive: true }),
        registerIntegrationProvider: (provider: any) => {
          registeredProvider = provider;
          return { dispose: () => { registeredProvider = null; } };
        },
      };

      extensions.setExtension('saropa.saropa-log-capture', {
        isActive: true,
        exports: fakeApi,
      });

      await bridge.init(fakeContext as any, client);
    });

    it('should register an integration provider', () => {
      assert.ok(registeredProvider);
      assert.strictEqual(registeredProvider.id, 'saropa-drift-advisor');
    });

    it('should report enabled when driftAdvisor is in integrationsAdapters', () => {
      assert.strictEqual(
        registeredProvider.isEnabled({ config: { integrationsAdapters: ['driftAdvisor'] } }),
        true,
      );
    });

    it('should report disabled when driftAdvisor is not in integrationsAdapters', () => {
      assert.strictEqual(registeredProvider.isEnabled({}), false);
      assert.strictEqual(
        registeredProvider.isEnabled({ config: {} }),
        false,
      );
      assert.strictEqual(
        registeredProvider.isEnabled({ config: { integrationsAdapters: [] } }),
        false,
      );
    });

    it('should provide header on session start', () => {
      const contributions = registeredProvider.onSessionStartSync();
      assert.ok(contributions);
      assert.strictEqual(contributions.length, 1);
      assert.strictEqual(contributions[0].kind, 'header');
      assert.ok(contributions[0].lines[0].includes('127.0.0.1:8642'));
    });

    it('should provide header on session end when performance is available', async () => {
      stubSessionEndFetch(fetchStub, {
        performance: {
          totalQueries: 10,
          totalDurationMs: 500,
          avgDurationMs: 50,
          slowQueries: [{ sql: 'SELECT 1', durationMs: 400, rowCount: 1, at: '' }],
          recentQueries: [],
        },
      });

      const context = mockEndContext();
      const contributions = await registeredProvider.onSessionEnd(context);
      assert.ok(contributions);
      const header = contributions!.find((c: any) => c.kind === 'header');
      assert.ok(header);
      assert.ok(header.lines[0].includes('10 total'));
    });

    it('should include meta and sidecar when mode is full', async () => {
      stubSessionEndFetch(fetchStub, {
        performance: {
          totalQueries: 5,
          totalDurationMs: 100,
          avgDurationMs: 20,
          slowQueries: [],
          recentQueries: [],
        },
        anomalies: [{ message: 'Anomaly 1', severity: 'warning' }],
        schema: [{ name: 'users', columns: [], rowCount: 10 }],
        health: { ok: true, extensionConnected: true },
        indexSuggestions: [],
      });

      const context = mockEndContext({ baseFileName: 'mylog' });
      const contributions = await registeredProvider.onSessionEnd(context);
      assert.ok(contributions);

      const meta = contributions!.find((c: any) => c.kind === 'meta');
      assert.ok(meta);
      assert.strictEqual(meta.key, 'saropa-drift-advisor');
      assert.strictEqual(meta.payload.baseUrl, BASE);
      assert.strictEqual(meta.payload.performance.totalQueries, 5);
      assert.strictEqual(meta.payload.anomalies.count, 1);
      assert.strictEqual(meta.payload.schema.tableCount, 1);
      assert.strictEqual(meta.payload.health.ok, true);

      const sidecar = contributions!.find((c: any) => c.kind === 'sidecar');
      assert.ok(sidecar);
      assert.strictEqual(sidecar.filename, 'mylog.drift-advisor.json');
      assert.strictEqual(sidecar.contentType, 'json');
      const sidecarData = JSON.parse(sidecar.content as string);
      assert.strictEqual(sidecarData.baseUrl, BASE);
      assert.ok(Array.isArray(sidecarData.anomalies));
      assert.ok(Array.isArray(sidecarData.schema));
    });

    it('should return only header when includeInLogCaptureSession is header', async () => {
      const origGetConfiguration = workspace.getConfiguration;
      try {
        (workspace as any).getConfiguration = (_section?: string) => ({
          get: (key: string, defaultValue: unknown) => {
            if (key === 'integrations.includeInLogCaptureSession') return 'header';
            if (key === 'performance.slowThresholdMs') return 500;
            if (key === 'performance.logToCapture') return 'slow-only';
            return defaultValue;
          },
        });

        stubSessionEndFetch(fetchStub, {
          performance: {
            totalQueries: 1,
            totalDurationMs: 10,
            avgDurationMs: 10,
            slowQueries: [],
            recentQueries: [],
          },
        });

        const context = mockEndContext();
        const contributions = await registeredProvider.onSessionEnd(context);

        assert.ok(contributions);
        assert.strictEqual(contributions!.filter((c: any) => c.kind === 'header').length, 1);
        assert.strictEqual(contributions!.filter((c: any) => c.kind === 'meta').length, 0);
        assert.strictEqual(contributions!.filter((c: any) => c.kind === 'sidecar').length, 0);
      } finally {
        (workspace as any).getConfiguration = origGetConfiguration;
      }
    });

    it('should return empty array when includeInLogCaptureSession is none', async () => {
      const origGetConfiguration = workspace.getConfiguration;
      try {
        (workspace as any).getConfiguration = (_section?: string) => ({
          get: (key: string, defaultValue: unknown) => {
            if (key === 'integrations.includeInLogCaptureSession') return 'none';
            if (key === 'performance.slowThresholdMs') return 500;
            if (key === 'performance.logToCapture') return 'slow-only';
            return defaultValue;
          },
        });

        const context = mockEndContext();
        const contributions = await registeredProvider.onSessionEnd(context);

        assert.deepStrictEqual(contributions, []);
      } finally {
        (workspace as any).getConfiguration = origGetConfiguration;
      }
    });

    it('should include issuesSummary and issues when getLastCollectedIssues is provided', async () => {
      const getIssues = (): LogCaptureIssueLike[] =>
        [
          {
            code: 'missing-fk-index',
            message: 'Missing index',
            fileUri: Uri.file('/workspace/lib/database.dart'),
            range: new Range(0, 0, 1, 0),
            severity: 1,
          },
        ] as LogCaptureIssueLike[];

      const bridgeWithIssues = new LogCaptureBridge();
      const fakeApi2 = {
        writeLine: sinon.spy(),
        insertMarker: sinon.spy(),
        getSessionInfo: () => ({ isActive: true }),
        registerIntegrationProvider: (provider: any) => {
          registeredProvider = provider;
          return { dispose: () => {} };
        },
      };
      extensions.setExtension('saropa.saropa-log-capture', {
        isActive: true,
        exports: fakeApi2,
      });
      await bridgeWithIssues.init(fakeContext as any, client, {
        getLastCollectedIssues: getIssues,
      });

      stubSessionEndFetch(fetchStub, {});

      const context = mockEndContext();
      const contributions = await registeredProvider.onSessionEnd(context);
      bridgeWithIssues.dispose();

      const meta = contributions!.find((c: any) => c.kind === 'meta');
      assert.ok(meta);
      assert.ok(meta.payload.issuesSummary);
      assert.strictEqual(meta.payload.issuesSummary.count, 1);
      assert.strictEqual(meta.payload.issuesSummary.byCode['missing-fk-index'], 1);

      const sidecar = contributions!.find((c: any) => c.kind === 'sidecar');
      assert.ok(sidecar);
      const sidecarData = JSON.parse(sidecar.content as string);
      assert.ok(Array.isArray(sidecarData.issues));
      assert.strictEqual(sidecarData.issues.length, 1);
      assert.strictEqual(sidecarData.issues[0].code, 'missing-fk-index');
    });

    it('should return meta and sidecar with default data when server calls fail (full mode)', async () => {
      fetchStub.rejects(new Error('connection refused'));

      const context = mockEndContext();
      const contributions = await registeredProvider.onSessionEnd(context);

      assert.ok(contributions);
      const meta = contributions!.find((c: any) => c.kind === 'meta');
      assert.ok(meta);
      assert.strictEqual(meta.payload.performance.totalQueries, 0);
      const sidecar = contributions!.find((c: any) => c.kind === 'sidecar');
      assert.ok(sidecar);
      assert.strictEqual(sidecar.filename, '20250319_120000_app.drift-advisor.json');
    });

    it('should write slow query via writeLine', () => {
      bridge.writeSlowQuery({
        sql: 'SELECT * FROM large_table',
        durationMs: 1200,
        rowCount: 100,
        at: '',
      });

      assert.ok(writeLineSpy.calledOnce);
      const [text, opts] = writeLineSpy.firstCall.args;
      assert.ok(text.includes('1200ms'));
      assert.strictEqual(opts.category, 'drift-perf');
    });

    it('should write connection event via writeLine', () => {
      bridge.writeConnectionEvent('Connected to server');

      assert.ok(writeLineSpy.calledOnce);
      const [text] = writeLineSpy.firstCall.args;
      assert.ok(text.includes('Connected to server'));
    });
  });

});
