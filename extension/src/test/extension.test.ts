import * as assert from 'node:assert';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as sinon from 'sinon';
import {
  commands,
  MockMemento,
  registeredCodeActionProviders,
  registeredCodeLensProviders,
  registeredHoverProviders,
  resetMocks,
  tasks,
} from './vscode-mock';
import { activate, deactivate } from '../extension';
import * as vscode from 'vscode';

describe('Extension activation', () => {
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

  it('should register driftViewer.openInBrowser command', () => {
    activate(fakeContext());
    const registered = commands.getRegistered();
    assert.ok('driftViewer.openInBrowser' in registered, 'openInBrowser should be registered');
  });

  it('should register driftViewer.openInPanel command', () => {
    activate(fakeContext());
    const registered = commands.getRegistered();
    assert.ok('driftViewer.openInPanel' in registered, 'openInPanel should be registered');
  });

  it('should register tree view commands', () => {
    activate(fakeContext());
    const registered = commands.getRegistered();
    assert.ok('driftViewer.refreshTree' in registered);
    assert.ok('driftViewer.viewTableData' in registered);
    assert.ok('driftViewer.copyTableName' in registered);
    assert.ok('driftViewer.exportTable' in registered);
    assert.ok('driftViewer.copyColumnName' in registered);
    assert.ok('driftViewer.filterByColumn' in registered);
  });

  it('should push expected disposables', () => {
    activate(fakeContext());
    // Providers: treeView, definitionProvider, codeLensProvider, hoverProvider,
    //   diagnosticCollection, codeActionProvider, fileDecoProvider, taskProvider,
    //   terminalLinkProvider, timelineProvider (10)
    // Discovery: discovery, serverManager (2)
    // Lifecycle: watcher, statusBar, perfView, logBridge, 2 debug listeners,
    //   perf cleanup, snapshotStore (8)
    // Codegen: generateDart (1)
    // Auth: onDidChangeConfiguration (1)
    // Gap closures: exportDump, downloadDatabase, schemaDiagram, compareReport,
    //   migrationPreview, sizeAnalytics, importData, shareSession, openSession,
    //   annotateSession (10)
    // Data management: clearTable, clearAllTables, clearTableGroup,
    //   importDataset, exportDataset (5)
    // Global search: globalSearch (1)
    // Row comparator: compareRows (1)
    // Schema docs: generateSchemaDocs (1)
    // Column profiler: profileColumn (1)
    // Snapshot changelog: snapshotChangelog (1)
    // Data breakpoints: dbpProvider, addDataBreakpoint,
    //   removeDataBreakpoint, toggleDataBreakpoint (4)
    // Annotations: annotateTable, annotateColumn, openBookmarks,
    //   exportAnnotations, importAnnotations (5)
    // Seeder: seedTable, seedAllTables (2)
    // Constraint wizard: constraintWizard (1)
    // Isar-to-Drift: isarToDrift (1)
    // Snippet library: openSnippetLibrary, saveAsSnippet (2)
    // FK navigation: fkNavigator (1)
    // Saved filters: filterBridge (1)
    // Schema search: schemaSearchViewProvider, onDidChangeActive connection listener (2)
    // Pin store: pinTable, unpinTable, onDidChange, dispose (4)
    // Source navigation: goToDriftTableDefinition, goToDriftColumnDefinition (2)
    // Health score: healthScore (1)
    // Impact analysis: analyzeRowImpact (1)
    // Query cost: analyzeQueryCost (1)
    // Portable report: exportReport (1)
    // Perf regression: resetPerfBaseline, resetAllPerfBaselines (2)
    // Rollback generator: schemaTracker, generateRollback (2)
    // ADB forward: onDidStartDebugSession, timer cleanup (2)
    // Discoverability: toolsView, healthStatusBar, toolsQuickPick,
    //   openWalkthrough, showToolsQuickPick (5)
    // About: about, aboutSaropa (2)
    // Troubleshooting: showTroubleshooting (1)
    // Package status monitor: packageMonitor, onDidChangeInstalled listener (2)
    // Snapshot/explain: onDidChangeActiveTextEditor, onDidChangeTextEditorSelection, debounce dispose (3)
    // Log Capture integration: session-end export + optional API (1)
    // Schema Search: attachDiscoveryMonitor dispose (1)
    // Nav: pauseDiscovery, resumeDiscovery, openConnectionHelp (3)
    // Editing: pendingChangesPersistence debounce, pendingEditsStatusBar (2)
    // Total grows as new features/commands are added; update when adding registrations
    assert.strictEqual(subscriptions.length, 200, `expected 200 disposables, got ${subscriptions.length}`);
  });

  it('should register driftViewer.viewTableInPanel command', () => {
    activate(fakeContext());
    const registered = commands.getRegistered();
    assert.ok('driftViewer.viewTableInPanel' in registered);
  });

  it('should register driftViewer.runTableQuery command', () => {
    activate(fakeContext());
    const registered = commands.getRegistered();
    assert.ok('driftViewer.runTableQuery' in registered);
  });

  it('should register driftViewer.aboutSaropa command', () => {
    activate(fakeContext());
    const registered = commands.getRegistered();
    assert.ok('driftViewer.aboutSaropa' in registered, 'aboutSaropa (Database header (i) icon) should be registered');
  });

  it('should register driftViewer.about command', () => {
    activate(fakeContext());
    const registered = commands.getRegistered();
    assert.ok('driftViewer.about' in registered, 'about (Drift Tools / changelog) should be registered');
  });

  it('should register driftViewer.saveFilter command', () => {
    activate(fakeContext());
    const registered = commands.getRegistered();
    assert.ok('driftViewer.saveFilter' in registered, 'saveFilter should be registered');
  });

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
   * Ensures package.json declares onCommand activation for every command entry
   * and every menu-referenced command so VS Code always activates before
   * command execution, including toolbar/status-bar icon paths.
   */
  it('package.json should include onCommand activation for all contributed and menu commands', () => {
    const packagePath = path.join(__dirname, '..', '..', 'package.json');
    const raw = fs.readFileSync(packagePath, 'utf-8');
    const pkg = JSON.parse(raw) as {
      activationEvents?: string[];
      contributes?: {
        commands?: Array<{ command?: string }>;
        menus?: Record<string, Array<{ command?: string }>>;
      };
    };
    const events = new Set(pkg.activationEvents ?? []);
    const contributedCommands = (pkg.contributes?.commands ?? [])
      .map((c) => c.command)
      .filter((c): c is string => typeof c === 'string' && c.length > 0);
    const menuCommands = Object.values(pkg.contributes?.menus ?? {})
      .flat()
      .map((item) => item.command)
      .filter((c): c is string => typeof c === 'string' && c.length > 0);
    const allCommandIds = new Set([...contributedCommands, ...menuCommands]);
    for (const commandId of allCommandIds) {
      const activationEvent = `onCommand:${commandId}`;
      assert.ok(
        events.has(activationEvent),
        `activationEvents should include "${activationEvent}" to avoid command-not-found before non-command activation triggers`,
      );
    }
  });

  /**
   * Legacy `"*"` activation was removed (2.9.2): some hosts reject or mishandle it;
   * `onStartupFinished` plus explicit `onCommand` / view hooks cover activation.
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

  it('should register a CodeLens provider for Dart files', () => {
    activate(fakeContext());
    assert.strictEqual(registeredCodeLensProviders.length, 1);
    assert.deepStrictEqual(registeredCodeLensProviders[0].selector, {
      language: 'dart',
      scheme: 'file',
    });
  });

  it('should register a drift task provider', () => {
    activate(fakeContext());
    const providers = tasks.getRegisteredProviders();
    assert.strictEqual(providers.length, 1);
    assert.strictEqual(providers[0].type, 'drift');
  });

  it('should register performance commands', () => {
    activate(fakeContext());
    const registered = commands.getRegistered();
    assert.ok('driftViewer.refreshPerformance' in registered);
    assert.ok('driftViewer.clearPerformance' in registered);
    assert.ok('driftViewer.showQueryDetail' in registered);
  });

  it('should register schema linter commands', () => {
    activate(fakeContext());
    const registered = commands.getRegistered();
    assert.ok('driftViewer.runLinter' in registered);
    assert.ok('driftViewer.copySuggestedSql' in registered);
  });

  it('should register discovery commands', () => {
    activate(fakeContext());
    const registered = commands.getRegistered();
    assert.ok('driftViewer.selectServer' in registered);
    assert.ok('driftViewer.retryDiscovery' in registered);
    assert.ok('driftViewer.pauseDiscovery' in registered);
    assert.ok('driftViewer.resumeDiscovery' in registered);
    assert.ok('driftViewer.openConnectionHelp' in registered);
    assert.ok('driftViewer.forwardPortAndroid' in registered);
    assert.ok('driftViewer.showConnectionLog' in registered);
    assert.ok('driftViewer.refreshConnectionUi' in registered);
    assert.ok('driftViewer.diagnoseConnection' in registered);
  });

  it('should register addPackageToProject command', () => {
    activate(fakeContext());
    const registered = commands.getRegistered();
    assert.ok('driftViewer.addPackageToProject' in registered, 'addPackageToProject should be registered');
  });

  it('should register snapshot commands', () => {
    activate(fakeContext());
    const registered = commands.getRegistered();
    assert.ok('driftViewer.captureSnapshot' in registered);
    assert.ok('driftViewer.showSnapshotDiff' in registered);
  });

  it('should register watch commands', () => {
    activate(fakeContext());
    const registered = commands.getRegistered();
    assert.ok('driftViewer.watchTable' in registered);
    assert.ok('driftViewer.watchQuery' in registered);
    assert.ok('driftViewer.openWatchPanel' in registered);
  });

  it('should register driftViewer.openSqlNotebook command', () => {
    activate(fakeContext());
    const registered = commands.getRegistered();
    assert.ok('driftViewer.openSqlNotebook' in registered);
  });

  it('should register driftViewer.commitPendingEdits command', () => {
    activate(fakeContext());
    const registered = commands.getRegistered();
    assert.ok('driftViewer.commitPendingEdits' in registered);
  });

  it('should register driftViewer.editTableData command', () => {
    activate(fakeContext());
    const registered = commands.getRegistered();
    assert.ok('driftViewer.editTableData' in registered);
  });

  it('should register driftViewer.globalSearch command', () => {
    activate(fakeContext());
    const registered = commands.getRegistered();
    assert.ok('driftViewer.globalSearch' in registered);
  });

  it('should register a HoverProvider for Dart files', () => {
    activate(fakeContext());
    assert.strictEqual(registeredHoverProviders.length, 1);
    assert.deepStrictEqual(registeredHoverProviders[0].selector, {
      language: 'dart',
      scheme: 'file',
    });
  });

  it('should register a CodeAction provider for Dart files', () => {
    activate(fakeContext());
    assert.ok(registeredCodeActionProviders.length >= 1, 'Should register at least one CodeAction provider');
    const dartProvider = registeredCodeActionProviders.find(
      (p) => p.selector?.language === 'dart' && p.selector?.scheme === 'file',
    );
    assert.ok(dartProvider, 'Should register a CodeAction provider for Dart files');
  });

  it('should register rollback generator command', () => {
    activate(fakeContext());
    const registered = commands.getRegistered();
    assert.ok('driftViewer.generateRollback' in registered, 'generateRollback should be registered');
  });

  it('deactivate should not throw', () => {
    assert.doesNotThrow(() => deactivate());
  });
});
