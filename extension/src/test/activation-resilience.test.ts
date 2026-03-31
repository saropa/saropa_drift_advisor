/**
 * Activation resilience tests.
 *
 * Verifies that the phased activation in extension-main.ts survives partial
 * failures: if one phase throws, later phases still execute and commands
 * registered by surviving phases remain functional. The outer activate()
 * must NEVER re-throw — doing so causes VS Code to dispose ALL commands.
 */
import * as assert from 'node:assert';
import * as sinon from 'sinon';
import {
  commands,
  messageMock,
  MockMemento,
  resetMocks,
} from './vscode-mock';
import * as vscode from 'vscode';

// Modules whose exports we stub to simulate phase failures.
import * as bootstrapModule from '../extension-bootstrap';
import * as providersModule from '../extension-providers';
import * as diagnosticsModule from '../extension-diagnostics';
import * as editingModule from '../extension-editing';
import * as commandsModule from '../extension-commands';
// The function under test.
import { activate } from '../extension';

describe('Activation resilience — phased isolation', () => {
  let subscriptions: vscode.Disposable[];
  let fetchStub: sinon.SinonStub;

  // Stubs for individual phases; created per-test as needed.
  let bootstrapStub: sinon.SinonStub | undefined;
  let providersStub: sinon.SinonStub | undefined;
  let diagnosticsStub: sinon.SinonStub | undefined;
  let editingStub: sinon.SinonStub | undefined;
  let commandsStub: sinon.SinonStub | undefined;
  let aboutStub: sinon.SinonStub | undefined;

  beforeEach(() => {
    resetMocks();
    messageMock.reset();
    subscriptions = [];
    // Default: server unreachable so HTTP requests don't hang.
    fetchStub = sinon.stub(globalThis, 'fetch');
    fetchStub.rejects(new Error('connection refused'));
  });

  afterEach(() => {
    fetchStub.restore();
    bootstrapStub?.restore();
    providersStub?.restore();
    diagnosticsStub?.restore();
    editingStub?.restore();
    commandsStub?.restore();
    aboutStub?.restore();
    subscriptions.forEach((d) => d.dispose());
  });

  function fakeContext(): vscode.ExtensionContext {
    return {
      subscriptions,
      workspaceState: new MockMemento(),
    } as unknown as vscode.ExtensionContext;
  }

  // -----------------------------------------------------------------------
  // 1. Full activation succeeds — baseline
  // -----------------------------------------------------------------------
  it('full activation: all commands registered, no error toasts', () => {
    activate(fakeContext());
    assert.strictEqual(messageMock.errors.length, 0,
      `Unexpected error toasts: ${messageMock.errors.join('; ')}`);
    // Spot-check a few commands from different phases.
    const registered = commands.getRegistered();
    assert.ok('driftViewer.about' in registered, 'about command should be registered');
    assert.ok('driftViewer.refreshTree' in registered, 'refreshTree should be registered');
    assert.ok('driftViewer.openInBrowser' in registered, 'openInBrowser should be registered');
  });

  // -----------------------------------------------------------------------
  // 2. Bootstrap throws — about commands still registered
  // -----------------------------------------------------------------------
  it('bootstrap failure: does not throw, shows error toast, about commands survive', () => {
    bootstrapStub = sinon.stub(bootstrapModule, 'bootstrapExtension')
      .throws(new Error('simulated bootstrap crash'));

    // activate() must NOT throw — that would kill all commands.
    assert.doesNotThrow(() => activate(fakeContext()));

    // Error toast should be visible to the user.
    assert.ok(
      messageMock.errors.some((m) => m.includes('bootstrap') && m.includes('simulated bootstrap crash')),
      `Expected error toast about bootstrap failure, got: ${messageMock.errors.join('; ')}`,
    );

    // About commands are registered even when bootstrap fails because
    // they only need the extension context, not the client/discovery.
    const registered = commands.getRegistered();
    assert.ok('driftViewer.about' in registered, 'about should survive bootstrap failure');
    assert.ok('driftViewer.aboutSaropa' in registered, 'aboutSaropa should survive bootstrap failure');
  });

  // -----------------------------------------------------------------------
  // 3. setupProviders throws — bootstrap commands stay alive
  // -----------------------------------------------------------------------
  it('providers failure: does not throw, shows error toast, bootstrap still alive', () => {
    providersStub = sinon.stub(providersModule, 'setupProviders')
      .throws(new Error('simulated providers crash'));

    assert.doesNotThrow(() => activate(fakeContext()));

    assert.ok(
      messageMock.errors.some((m) => m.includes('providers') && m.includes('simulated providers crash')),
      `Expected error toast about providers failure, got: ${messageMock.errors.join('; ')}`,
    );

    // About commands should still be registered.
    const registered = commands.getRegistered();
    assert.ok('driftViewer.about' in registered, 'about should survive providers failure');
  });

  // -----------------------------------------------------------------------
  // 4. setupDiagnostics throws — commands still register
  // -----------------------------------------------------------------------
  it('diagnostics failure: does not throw, commands still register', () => {
    diagnosticsStub = sinon.stub(diagnosticsModule, 'setupDiagnostics')
      .throws(new Error('simulated diagnostics crash'));

    assert.doesNotThrow(() => activate(fakeContext()));

    assert.ok(
      messageMock.errors.some((m) => m.includes('diagnostics') && m.includes('simulated diagnostics crash')),
      `Expected error toast about diagnostics failure, got: ${messageMock.errors.join('; ')}`,
    );

    // Commands should still be registered because providers + editing succeeded.
    const registered = commands.getRegistered();
    assert.ok('driftViewer.refreshTree' in registered, 'refreshTree should survive diagnostics failure');
    assert.ok('driftViewer.openInBrowser' in registered, 'openInBrowser should survive diagnostics failure');
  });

  // -----------------------------------------------------------------------
  // 5. setupEditing throws — commands still register (without editing deps)
  // -----------------------------------------------------------------------
  it('editing failure: does not throw, shows error toast', () => {
    editingStub = sinon.stub(editingModule, 'setupEditing')
      .throws(new Error('simulated editing crash'));

    assert.doesNotThrow(() => activate(fakeContext()));

    assert.ok(
      messageMock.errors.some((m) => m.includes('editing') && m.includes('simulated editing crash')),
      `Expected error toast about editing failure, got: ${messageMock.errors.join('; ')}`,
    );

    // About + refreshTree should still work.
    const registered = commands.getRegistered();
    assert.ok('driftViewer.about' in registered, 'about should survive editing failure');
    assert.ok('driftViewer.refreshTree' in registered, 'refreshTree should survive editing failure');
  });

  // -----------------------------------------------------------------------
  // 6. registerAllCommands throws — earlier phases' subscriptions survive
  // -----------------------------------------------------------------------
  it('commands failure: does not throw, about + tree survive', () => {
    commandsStub = sinon.stub(commandsModule, 'registerAllCommands')
      .throws(new Error('simulated commands crash'));

    assert.doesNotThrow(() => activate(fakeContext()));

    assert.ok(
      messageMock.errors.some((m) => m.includes('commands') && m.includes('simulated commands crash')),
      `Expected error toast about commands failure, got: ${messageMock.errors.join('; ')}`,
    );

    // About commands and refreshTree (registered in providers phase) survive.
    const registered = commands.getRegistered();
    assert.ok('driftViewer.about' in registered, 'about should survive commands failure');
    assert.ok('driftViewer.refreshTree' in registered, 'refreshTree should survive commands failure');
  });

  // -----------------------------------------------------------------------
  // 7. Multiple phases fail — each shows its own toast
  // -----------------------------------------------------------------------
  it('multiple failures: each phase shows its own error toast', () => {
    diagnosticsStub = sinon.stub(diagnosticsModule, 'setupDiagnostics')
      .throws(new Error('diag boom'));
    editingStub = sinon.stub(editingModule, 'setupEditing')
      .throws(new Error('edit boom'));

    assert.doesNotThrow(() => activate(fakeContext()));

    // Both failures should produce separate toasts.
    assert.ok(
      messageMock.errors.some((m) => m.includes('diag boom')),
      'Expected diagnostics error toast',
    );
    assert.ok(
      messageMock.errors.some((m) => m.includes('edit boom')),
      'Expected editing error toast',
    );

    // About should still work.
    const registered = commands.getRegistered();
    assert.ok('driftViewer.about' in registered, 'about should survive multiple failures');
  });

  // -----------------------------------------------------------------------
  // 8. Activation log is written to output channel
  // -----------------------------------------------------------------------
  it('activation log: output channel contains phase milestone lines', () => {
    activate(fakeContext());

    // The output channel is created fresh each activation. Find the
    // subscriptions entry that is a MockOutputChannel.
    const channels = subscriptions.filter(
      (d: any) => d && typeof d === 'object' && 'lines' in d && 'name' in d,
    ) as unknown as Array<{ name: string; lines: string[] }>;
    const saropaChannel = channels.find((c) => c.name === 'Saropa Drift Advisor');
    assert.ok(saropaChannel, 'Saropa Drift Advisor output channel should be in subscriptions');

    // Check for activation start and completion lines.
    assert.ok(
      saropaChannel.lines.some((l) => l.includes('activating...')),
      'Should log activation start',
    );
    assert.ok(
      saropaChannel.lines.some((l) => l.includes('Activation complete')),
      'Should log activation completion',
    );
    // Check for at least some phase milestone lines.
    assert.ok(
      saropaChannel.lines.some((l) => l.includes('Phase "bootstrap"')),
      'Should log bootstrap phase',
    );
    assert.ok(
      saropaChannel.lines.some((l) => l.includes('Phase "commands"')),
      'Should log commands phase',
    );
  });
});
