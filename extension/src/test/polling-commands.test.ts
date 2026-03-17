/**
 * Tests for the polling toggle command (driftViewer.togglePolling).
 * Covers success path (toggle on/off, refresh tools tree) and error recovery
 * (show error message when API fails).
 */

import * as assert from 'assert';
import * as sinon from 'sinon';
import {
  commands,
  messageMock,
  resetMocks,
} from './vscode-mock';
import { registerPollingCommands } from '../polling/polling-commands';
import { DriftApiClient } from '../api-client';
import { ToolsTreeProvider } from '../tree/tools-tree-provider';

describe('Polling commands', () => {
  let fetchStub: sinon.SinonStub;
  let client: DriftApiClient;
  let toolsProvider: ToolsTreeProvider;

  beforeEach(() => {
    resetMocks();
    messageMock.reset();
    fetchStub = sinon.stub(globalThis, 'fetch');
    client = new DriftApiClient('127.0.0.1', 8642);
    toolsProvider = new ToolsTreeProvider('1.0.0');
  });

  afterEach(() => {
    fetchStub.restore();
  });

  function register(): void {
    const context = { subscriptions: [] } as any;
    registerPollingCommands(context, client, toolsProvider);
  }

  describe('registration', () => {
    it('should register driftViewer.togglePolling', () => {
      register();
      const registered = commands.getRegistered();
      assert.ok('driftViewer.togglePolling' in registered);
    });
  });

  describe('driftViewer.togglePolling — success', () => {
    it('should enable polling and show info when current state is false', async () => {
      fetchStub
        .onFirstCall()
        .resolves(
          new Response(JSON.stringify({ changeDetection: false }), { status: 200 }),
        );
      fetchStub
        .onSecondCall()
        .resolves(
          new Response(JSON.stringify({ changeDetection: true }), { status: 200 }),
        );
      register();
      await commands.executeRegistered('driftViewer.togglePolling');
      assert.ok(
        messageMock.infos.some((m) => m.includes('Database polling enabled')),
        'should show enabled message',
      );
      assert.strictEqual(fetchStub.callCount, 2);
    });

    it('should disable polling and show info when current state is true', async () => {
      fetchStub
        .onFirstCall()
        .resolves(
          new Response(JSON.stringify({ changeDetection: true }), { status: 200 }),
        );
      fetchStub
        .onSecondCall()
        .resolves(
          new Response(JSON.stringify({ changeDetection: false }), { status: 200 }),
        );
      register();
      await commands.executeRegistered('driftViewer.togglePolling');
      assert.ok(
        messageMock.infos.some((m) => m.includes('Database polling disabled')),
        'should show disabled message',
      );
    });
  });

  describe('driftViewer.togglePolling — error', () => {
    it('should show error message when getChangeDetection fails', async () => {
      fetchStub.rejects(new Error('network error'));
      register();
      await commands.executeRegistered('driftViewer.togglePolling');
      assert.ok(
        messageMock.errors.some((m) => m.includes('Toggle polling failed')),
        'should show error',
      );
      assert.ok(
        messageMock.errors.some((m) => m.includes('network error')),
        'error message should include reason',
      );
    });

    it('should show error message when API returns non-200', async () => {
      fetchStub.resolves(new Response('Forbidden', { status: 403 }));
      register();
      await commands.executeRegistered('driftViewer.togglePolling');
      assert.ok(
        messageMock.errors.some((m) => m.includes('Toggle polling failed')),
        'should show error',
      );
    });
  });
});
