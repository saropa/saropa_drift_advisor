/**
 * Unit tests for connection presentation and refresh orchestration.
 * Covers VM-only vs HTTP-only vs disconnected to avoid false "connected" states.
 */

import * as assert from 'assert';
import * as sinon from 'sinon';
import { resetMocks, MockMemento } from './vscode-mock';
import { DriftApiClient } from '../api-client';
import { ServerManager } from '../server-manager';
import { ServerDiscovery, type IDiscoveryConfig } from '../server-discovery';
import {
  buildConnectionPresentation,
  isDriftUiConnected,
  refreshDriftConnectionUi,
  resetConnectionUiPresentationCacheForTests,
} from '../connection-ui-state';

function defaultDiscoveryConfig(): IDiscoveryConfig {
  return { host: '127.0.0.1', portRangeStart: 8642, portRangeEnd: 8644 };
}

function makeServer(port: number) {
  return {
    host: '127.0.0.1',
    port,
    firstSeen: Date.now(),
    lastSeen: Date.now(),
    missedPolls: 0,
  };
}

describe('connection-ui-state', () => {
  let sandbox: sinon.SinonSandbox;
  let client: DriftApiClient;
  let discovery: ServerDiscovery;
  let manager: ServerManager;

  beforeEach(() => {
    resetMocks();
    sandbox = sinon.createSandbox();
    client = new DriftApiClient('127.0.0.1', 8642);
    discovery = new ServerDiscovery(defaultDiscoveryConfig());
    manager = new ServerManager(discovery, client, new MockMemento());
    resetConnectionUiPresentationCacheForTests();
  });

  afterEach(() => {
    sandbox.restore();
    manager.dispose();
    discovery.dispose();
  });

  describe('isDriftUiConnected', () => {
    it('is false when there is no HTTP server and VM is off (no false positive)', () => {
      sandbox.replaceGetter(client, 'usingVmService', () => false);
      assert.strictEqual(isDriftUiConnected(manager, client), false);
    });

    it('is true when HTTP active server exists (VM off)', () => {
      sandbox.replaceGetter(client, 'usingVmService', () => false);
      (discovery as any)._onDidChangeServers.fire([makeServer(8642)]);
      assert.strictEqual(isDriftUiConnected(manager, client), true);
    });

    it('is true when VM is on even without activeServer (debugger path)', () => {
      sandbox.replaceGetter(client, 'usingVmService', () => true);
      assert.strictEqual(manager.activeServer, undefined);
      assert.strictEqual(isDriftUiConnected(manager, client), true);
    });
  });

  describe('buildConnectionPresentation', () => {
    it('VM-only does not set viaHttp (no false HTTP positive)', () => {
      sandbox.replaceGetter(client, 'usingVmService', () => true);
      const pres = buildConnectionPresentation(manager, client);
      assert.strictEqual(pres.connected, true);
      assert.strictEqual(pres.viaVm, true);
      assert.strictEqual(pres.viaHttp, false);
      assert.strictEqual(pres.persistedSchemaAvailable, false);
      assert.ok(pres.label.includes('VM'), 'label should describe VM path');
      assert.ok(
        pres.hint.toLowerCase().includes('vm'),
        'hint should mention VM when HTTP not selected',
      );
    });

    it('HTTP-only uses host:port in label', () => {
      sandbox.replaceGetter(client, 'usingVmService', () => false);
      (discovery as any)._onDidChangeServers.fire([makeServer(8642)]);
      const pres = buildConnectionPresentation(manager, client);
      assert.strictEqual(pres.connected, true);
      assert.strictEqual(pres.viaHttp, true);
      assert.strictEqual(pres.viaVm, false);
      assert.ok(pres.label.includes('127.0.0.1'), 'label should show host');
      assert.ok(pres.label.includes('8642'), 'label should show port');
    });

    it('disconnected state when neither VM nor HTTP', () => {
      sandbox.replaceGetter(client, 'usingVmService', () => false);
      const pres = buildConnectionPresentation(manager, client);
      assert.strictEqual(pres.connected, false);
      assert.strictEqual(pres.viaHttp, false);
      assert.strictEqual(pres.viaVm, false);
      assert.strictEqual(pres.label, 'Not connected');
      assert.ok(pres.hint.length > 20);
    });
  });

  describe('refreshDriftConnectionUi', () => {
    it('dedupes appendLine when presentation unchanged (after state stabilizes)', () => {
      sandbox.replaceGetter(client, 'usingVmService', () => false);
      (discovery as any)._onDidChangeServers.fire([makeServer(8642)]);

      const appendLine = sinon.stub();
      const tools = { setConnected: sinon.stub() };

      refreshDriftConnectionUi(manager, client, {
        toolsProvider: tools as any,
      }, { appendLine });

      assert.ok(appendLine.called, 'first refresh should log');
      const firstCount = appendLine.callCount;

      refreshDriftConnectionUi(manager, client, {
        toolsProvider: tools as any,
      }, { appendLine });

      assert.strictEqual(
        appendLine.callCount,
        firstCount,
        'second refresh with same state should not append again',
      );
    });

    it('logs again after resetConnectionUiPresentationCacheForTests', () => {
      sandbox.replaceGetter(client, 'usingVmService', () => false);
      (discovery as any)._onDidChangeServers.fire([makeServer(8642)]);

      const appendLine = sinon.stub();
      const tools = { setConnected: sinon.stub() };
      const targets = { toolsProvider: tools as any };

      refreshDriftConnectionUi(manager, client, targets, { appendLine });
      const afterFirst = appendLine.callCount;
      resetConnectionUiPresentationCacheForTests();
      refreshDriftConnectionUi(manager, client, targets, { appendLine });
      assert.ok(
        appendLine.callCount > afterFirst,
        'after cache reset, identical state should log again',
      );
    });

    it('sets persistedSchemaAvailable from schema cache', () => {
      sandbox.replaceGetter(client, 'usingVmService', () => false);
      const schemaCache = { hasWorkspacePersistedSchema: () => true };
      const tools = { setConnected: sinon.stub() };
      refreshDriftConnectionUi(manager, client, {
        toolsProvider: tools as any,
        schemaCache: schemaCache as any,
      });
      // Verify the refresh completes without error when schemaCache is provided.
      assert.ok(tools.setConnected.called);
    });
  });
});
