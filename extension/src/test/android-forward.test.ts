/**
 * Unit tests for Android adb forward and auto-forward throttle.
 */
import * as assert from 'assert';
import * as sinon from 'sinon';
import * as vscode from 'vscode';
import {
  hasFlutterOrDartDebugSession,
  runAdbForward,
  tryAdbForwardAndRetry,
} from '../android-forward';
import { resetMocks } from './vscode-mock';
import type { ServerDiscovery } from '../server-discovery';

const vscodeMock = vscode as any;

describe('android-forward', () => {
  beforeEach(() => {
    resetMocks();
  });

  describe('hasFlutterOrDartDebugSession', () => {
    it('returns false when no debug session', () => {
      vscodeMock.debug.activeDebugSession = undefined;
      assert.strictEqual(hasFlutterOrDartDebugSession(), false);
    });

    it('returns true for dart session', () => {
      vscodeMock.debug.activeDebugSession = { type: 'dart' };
      assert.strictEqual(hasFlutterOrDartDebugSession(), true);
    });

    it('returns true for flutter session', () => {
      vscodeMock.debug.activeDebugSession = { type: 'flutter' };
      assert.strictEqual(hasFlutterOrDartDebugSession(), true);
    });

    it('returns false for other session type', () => {
      vscodeMock.debug.activeDebugSession = { type: 'node' };
      assert.strictEqual(hasFlutterOrDartDebugSession(), false);
    });

    it('treats session type case-insensitively', () => {
      vscodeMock.debug.activeDebugSession = { type: 'Dart' };
      assert.strictEqual(hasFlutterOrDartDebugSession(), true);
    });
  });

  describe('runAdbForward', () => {
    it('calls execOverride when provided', async () => {
      const execOverride = sinon.stub().resolves();
      await runAdbForward(8642, execOverride);
      assert.strictEqual(execOverride.callCount, 1);
      assert.strictEqual(
        execOverride.firstCall.args[0],
        'adb forward tcp:8642 tcp:8642',
      );
    });

    it('throws when execOverride rejects', async () => {
      const execOverride = sinon.stub().rejects(new Error('adb not found'));
      await assert.rejects(
        () => runAdbForward(8642, execOverride),
        /adb not found/,
      );
    });
  });

  describe('tryAdbForwardAndRetry', () => {
    let discovery: ServerDiscovery;
    let workspaceState: vscode.Memento;

    beforeEach(() => {
      discovery = {
        retry: sinon.stub(),
      } as unknown as ServerDiscovery;
      workspaceState = {
        get: sinon.stub().returns(0),
        update: sinon.stub().resolves(undefined),
      } as unknown as vscode.Memento;
    });

    it('runs forward and retries when throttle allows', async () => {
      const execOverride = sinon.stub().resolves();
      const result = await tryAdbForwardAndRetry(
        8642,
        discovery,
        workspaceState,
        execOverride,
      );
      assert.strictEqual(result, true);
      assert.strictEqual(execOverride.callCount, 1);
      assert.strictEqual((discovery.retry as sinon.SinonStub).callCount, 1);
      assert.strictEqual((workspaceState.update as sinon.SinonStub).callCount, 1);
    });

    it('skips when within throttle window', async () => {
      const execOverride = sinon.stub().resolves();
      (workspaceState.get as sinon.SinonStub).returns(Date.now() - 30_000);
      const result = await tryAdbForwardAndRetry(
        8642,
        discovery,
        workspaceState,
        execOverride,
      );
      assert.strictEqual(result, false);
      assert.strictEqual(execOverride.callCount, 0);
      assert.strictEqual((discovery.retry as sinon.SinonStub).callCount, 0);
      assert.strictEqual((workspaceState.update as sinon.SinonStub).callCount, 0);
    });

    it('returns false and does not retry when exec fails', async () => {
      const execOverride = sinon.stub().rejects(new Error('no device'));
      const result = await tryAdbForwardAndRetry(
        8642,
        discovery,
        workspaceState,
        execOverride,
      );
      assert.strictEqual(result, false);
      assert.strictEqual((discovery.retry as sinon.SinonStub).callCount, 0);
      assert.strictEqual((workspaceState.update as sinon.SinonStub).callCount, 0);
    });
  });
});
