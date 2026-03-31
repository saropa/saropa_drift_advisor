import * as assert from 'node:assert';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as sinon from 'sinon';
import {
  commands,
  MockMemento,
  resetMocks,
} from './vscode-mock';
import { activate } from '../extension';
import * as vscode from 'vscode';

describe('Extension manifest validation', () => {
  let subscriptions: vscode.Disposable[];
  let fetchStub: sinon.SinonStub;

  beforeEach(() => {
    resetMocks();
    subscriptions = [];
    fetchStub = sinon.stub(globalThis, 'fetch');
    // Default: server unreachable (tree provider refresh won't hang)
    fetchStub.rejects(new Error('connection refused'));
  });

  afterEach(() => {
    fetchStub.restore();
    subscriptions.forEach((d) => d.dispose());
  });

  function fakeContext(): vscode.ExtensionContext {
    return {
      subscriptions,
      workspaceState: new MockMemento(),
    } as unknown as vscode.ExtensionContext;
  }

  /**
   * Guards sidebar header icon wiring by requiring every view/title menu command
   * declared in package.json to be present in the runtime command registry.
   */
  it('should register every view/title menu command', () => {
    activate(fakeContext());
    const registered = commands.getRegistered();
    const packagePath = path.join(__dirname, '..', '..', 'package.json');
    const raw = fs.readFileSync(packagePath, 'utf-8');
    const pkg = JSON.parse(raw) as {
      contributes?: { menus?: Record<string, Array<{ command?: string }>> };
    };
    const viewTitleCommands = (pkg.contributes?.menus?.['view/title'] ?? [])
      .map((item) => item.command)
      .filter((c): c is string => typeof c === 'string' && c.length > 0);
    for (const commandId of new Set(viewTitleCommands)) {
      assert.ok(
        commandId in registered,
        `view/title command "${commandId}" is contributed but not registered at activation`,
      );
    }
  });

  /**
   * Ensures clicking any Database header icon does not throw due missing wiring.
   * Commands may no-op in mocks, but they should still execute safely.
   */
  it('should execute every view/title menu command without throwing', async () => {
    activate(fakeContext());
    const packagePath = path.join(__dirname, '..', '..', 'package.json');
    const raw = fs.readFileSync(packagePath, 'utf-8');
    const pkg = JSON.parse(raw) as {
      contributes?: { menus?: Record<string, Array<{ command?: string }>> };
    };
    const viewTitleCommands = (pkg.contributes?.menus?.['view/title'] ?? [])
      .map((item) => item.command)
      .filter((c): c is string => typeof c === 'string' && c.length > 0);
    for (const commandId of new Set(viewTitleCommands)) {
      await assert.doesNotReject(
        async () => commands.executeCommand(commandId),
        `view/title command "${commandId}" throws when executed`,
      );
    }
  });

  /**
   * Guards Drift Tools quick menu entries by requiring every commandId in
   * status-bar-tools.ts to be registered at activation time.
   */
  it('should register every Drift Tools quick-menu command target', () => {
    activate(fakeContext());
    const registered = commands.getRegistered();
    const toolsPath = path.join(__dirname, '..', '..', 'src', 'status-bar-tools.ts');
    const source = fs.readFileSync(toolsPath, 'utf-8');
    const commandIds = Array.from(
      source.matchAll(/commandId:\s*'([^']+)'/g),
      (match) => match[1],
    );
    for (const commandId of new Set(commandIds)) {
      assert.ok(
        commandId in registered,
        `Drift Tools item targets "${commandId}" but it is not registered`,
      );
    }
  });

  /**
   * Ensures every command referenced in contributes.menus and viewsWelcome is
   * declared in contributes.commands. VS Code auto-generates onCommand activation
   * events from contributes.commands, so explicit activationEvents entries are not
   * needed — but the command MUST be declared for the auto-generation to work.
   */
  it('package.json menu and viewsWelcome commands should be declared in contributes.commands', () => {
    const packagePath = path.join(__dirname, '..', '..', 'package.json');
    const raw = fs.readFileSync(packagePath, 'utf-8');
    const pkg = JSON.parse(raw) as {
      contributes?: {
        commands?: Array<{ command?: string }>;
        menus?: Record<string, Array<{ command?: string }>>;
        viewsWelcome?: Array<{ contents?: string }>;
      };
    };
    // Build set of all declared commands in contributes.commands
    const declaredCommands = new Set(
      (pkg.contributes?.commands ?? [])
        .map((c) => c.command)
        .filter((c): c is string => typeof c === 'string' && c.length > 0),
    );
    // Collect all commands referenced in menus
    const menuCommands = Object.values(pkg.contributes?.menus ?? {})
      .flat()
      .map((item) => item.command)
      .filter((c): c is string => typeof c === 'string' && c.length > 0);
    // Collect all command: references in viewsWelcome contents
    const welcomeCommands: string[] = [];
    for (const w of pkg.contributes?.viewsWelcome ?? []) {
      const matches = (w.contents ?? '').match(/command:[^\s)]+/g) ?? [];
      for (const m of matches) {
        welcomeCommands.push(m.replace('command:', ''));
      }
    }
    // Only check extension-owned commands; built-in VS Code commands like
    // workbench.action.openSettings are provided by the host, not our extension.
    const allReferencedCommands = new Set(
      [...menuCommands, ...welcomeCommands].filter((c) => c.startsWith('driftViewer.')),
    );
    for (const commandId of allReferencedCommands) {
      assert.ok(
        declaredCommands.has(commandId),
        `"${commandId}" is referenced in menus/viewsWelcome but missing from contributes.commands — VS Code cannot auto-generate onCommand activation for undeclared commands`,
      );
    }
  });

  /**
   * Legacy `"*"` activation was removed (2.9.2): some hosts reject or mishandle it;
   * `onStartupFinished` plus `workspaceContains` cover activation, and VS Code
   * auto-generates `onCommand` hooks from `contributes.commands` declarations.
   */
  it('package.json activationEvents should not use legacy "*" wildcard', () => {
    const packagePath = path.join(__dirname, '..', '..', 'package.json');
    const raw = fs.readFileSync(packagePath, 'utf-8');
    const pkg = JSON.parse(raw) as { activationEvents?: string[] };
    const events = pkg.activationEvents ?? [];
    assert.ok(
      !events.includes('*'),
      'Remove "*" from activationEvents; rely on onStartupFinished and onCommand hooks',
    );
  });

  /**
   * Exhaustive command-wiring check: every command declared in
   * contributes.commands in package.json MUST be registered at activation.
   *
   * If a feature module silently throws during registerAllCommands, the
   * command becomes "command 'X' not found" at runtime. This test catches
   * that class of bug by reading the authoritative list from package.json
   * and asserting every entry is present in the mock command registry.
   */
  it('should register every command declared in contributes.commands', () => {
    activate(fakeContext());
    const registered = commands.getRegistered();
    const packagePath = path.join(__dirname, '..', '..', 'package.json');
    const raw = fs.readFileSync(packagePath, 'utf-8');
    const pkg = JSON.parse(raw) as {
      contributes?: { commands?: Array<{ command?: string }> };
    };
    const declaredCommands = (pkg.contributes?.commands ?? [])
      .map((c) => c.command)
      .filter((c): c is string => typeof c === 'string' && c.length > 0);

    // Sanity check: package.json should declare a meaningful number of
    // commands. If this drops to zero something is wrong with the path.
    assert.ok(
      declaredCommands.length > 50,
      `Expected 50+ declared commands but found ${declaredCommands.length} — is the package.json path correct?`,
    );

    const missing: string[] = [];
    for (const commandId of declaredCommands) {
      if (!(commandId in registered)) {
        missing.push(commandId);
      }
    }
    assert.strictEqual(
      missing.length,
      0,
      `${missing.length} command(s) declared in contributes.commands but NOT registered at activation:\n  ${missing.join('\n  ')}`,
    );
  });

  /**
   * Reverse check: every driftViewer.* command registered at activation
   * must be declared in contributes.commands. Undeclared commands cannot
   * receive onCommand activation events from VS Code, meaning the
   * extension might not activate when the command is invoked from a
   * keybinding, URI handler, or other extension.
   */
  it('should not register driftViewer commands missing from contributes.commands', () => {
    activate(fakeContext());
    const registered = Object.keys(commands.getRegistered())
      .filter((c) => c.startsWith('driftViewer.'));
    const packagePath = path.join(__dirname, '..', '..', 'package.json');
    const raw = fs.readFileSync(packagePath, 'utf-8');
    const pkg = JSON.parse(raw) as {
      contributes?: { commands?: Array<{ command?: string }> };
    };
    const declaredCommands = new Set(
      (pkg.contributes?.commands ?? [])
        .map((c) => c.command)
        .filter((c): c is string => typeof c === 'string' && c.length > 0),
    );

    const undeclared: string[] = [];
    for (const commandId of registered) {
      if (!declaredCommands.has(commandId)) {
        undeclared.push(commandId);
      }
    }
    assert.strictEqual(
      undeclared.length,
      0,
      `${undeclared.length} command(s) registered at activation but NOT declared in contributes.commands (VS Code cannot auto-generate onCommand activation):\n  ${undeclared.join('\n  ')}`,
    );
  });
});
