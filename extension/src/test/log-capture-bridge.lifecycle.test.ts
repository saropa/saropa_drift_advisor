/**
 * Lifecycle tests for LogCaptureBridge setup and disposal behavior.
 */

import * as assert from 'node:assert';
import * as sinon from 'sinon';
import { DriftApiClient } from '../api-client';
import { LogCaptureBridge } from '../debug/log-capture-bridge';
import { extensions } from './vscode-mock';

describe('LogCaptureBridge lifecycle', () => {
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

  it('is a no-op when saropa-log-capture is missing', async () => {
    await bridge.init(fakeContext as any, client);

    bridge.writeSlowQuery({ sql: 'SELECT 1', durationMs: 1000, rowCount: 1, at: '' });
    bridge.writeQuery({ sql: 'SELECT 1', durationMs: 10, rowCount: 1, at: '' });
    bridge.writeConnectionEvent('test');
  });

  it('becomes no-op after dispose', async () => {
    const writeLineSpy = sinon.spy();

    extensions.setExtension('saropa.saropa-log-capture', {
      isActive: true,
      exports: {
        writeLine: writeLineSpy,
        insertMarker: sinon.spy(),
        getSessionInfo: () => ({ isActive: true }),
        registerIntegrationProvider: () => ({ dispose: () => {} }),
      },
    });

    await bridge.init(fakeContext as any, client);
    bridge.dispose();
    bridge.writeSlowQuery({ sql: 'SELECT 1', durationMs: 1000, rowCount: 1, at: '' });
    assert.strictEqual(writeLineSpy.callCount, 0);
  });
});
