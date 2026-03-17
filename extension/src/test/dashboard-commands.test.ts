/**
 * Tests for dashboard command handlers (open, save, load, delete).
 * Ensures command registration and execution paths are covered, including
 * error and empty-state branches.
 */

import * as assert from 'assert';
import * as path from 'path';
import * as sinon from 'sinon';
import {
  commands,
  createdPanels,
  dialogMock,
  messageMock,
  resetMocks,
  Uri,
  MockMemento,
} from './vscode-mock';
import { registerDashboardCommands } from '../dashboard/dashboard-commands';
import { DashboardPanel } from '../dashboard/dashboard-panel';
import { DriftApiClient } from '../api-client';

function fakeContext(): { subscriptions: unknown[]; workspaceState: MockMemento; extensionUri: ReturnType<typeof Uri.file> } {
  return {
    subscriptions: [],
    workspaceState: new MockMemento(),
    extensionUri: Uri.file(path.join(__dirname, '..')),
  } as any;
}

describe('Dashboard commands', () => {
  let fetchStub: sinon.SinonStub;
  let client: DriftApiClient;

  beforeEach(() => {
    resetMocks();
    messageMock.reset();
    dialogMock.reset();
    (DashboardPanel as any)._currentPanel = undefined;
    fetchStub = sinon.stub(globalThis, 'fetch');
    fetchStub.rejects(new Error('connection refused'));
    client = new DriftApiClient('127.0.0.1', 8642);
  });

  afterEach(() => {
    fetchStub.restore();
  });

  describe('registration', () => {
    it('should register openDashboard, saveDashboard, loadDashboard, deleteDashboard', () => {
      const context = fakeContext() as any;
      registerDashboardCommands(context, client);
      const registered = commands.getRegistered();
      assert.ok('driftViewer.openDashboard' in registered);
      assert.ok('driftViewer.saveDashboard' in registered);
      assert.ok('driftViewer.loadDashboard' in registered);
      assert.ok('driftViewer.deleteDashboard' in registered);
    });
  });

  describe('driftViewer.openDashboard', () => {
    it('should create a dashboard panel when command is executed', () => {
      const context = fakeContext() as any;
      registerDashboardCommands(context, client);
      commands.executeRegistered('driftViewer.openDashboard');
      assert.strictEqual(createdPanels.length, 1);
      assert.ok(DashboardPanel.currentPanel);
    });

    it('should set webview HTML on the panel', () => {
      const context = fakeContext() as any;
      registerDashboardCommands(context, client);
      commands.executeRegistered('driftViewer.openDashboard');
      const html = createdPanels[0].webview.html;
      assert.ok(html.includes('<!DOCTYPE html>'));
      assert.ok(html.includes('Dashboard'));
    });
  });

  describe('driftViewer.saveDashboard', () => {
    it('should show warning when no dashboard is open', async () => {
      const context = fakeContext() as any;
      registerDashboardCommands(context, client);
      await commands.executeRegistered('driftViewer.saveDashboard');
      assert.ok(
        messageMock.warnings.some((m) => m.includes('No dashboard open')),
        'should show no-dashboard warning',
      );
    });

    it('should prompt for name and save when panel is open and user enters name', async () => {
      const context = fakeContext() as any;
      registerDashboardCommands(context, client);
      commands.executeRegistered('driftViewer.openDashboard'); // sync in mock; panel exists before save
      dialogMock.inputBoxResult = 'my-dashboard';
      await commands.executeRegistered('driftViewer.saveDashboard');
      assert.ok(
        messageMock.infos.some((m) => m.includes('saved')),
        'should show saved confirmation',
      );
    });
  });

  describe('driftViewer.loadDashboard', () => {
    it('should show info when no dashboards are saved', async () => {
      const context = fakeContext() as any;
      registerDashboardCommands(context, client);
      await commands.executeRegistered('driftViewer.loadDashboard');
      assert.ok(
        messageMock.infos.some((m) => m.includes('No saved dashboards')),
        'should show no-saved message',
      );
    });
  });

  describe('driftViewer.deleteDashboard', () => {
    it('should show info when no dashboards to delete', async () => {
      const context = fakeContext() as any;
      registerDashboardCommands(context, client);
      await commands.executeRegistered('driftViewer.deleteDashboard');
      assert.ok(
        messageMock.infos.some((m) => m.includes('No saved dashboards to delete')),
        'should show nothing-to-delete message',
      );
    });
  });
});
