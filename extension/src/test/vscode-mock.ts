/**
 * Mock implementation of the vscode API for unit testing outside VS Code.
 * Classes and types are split into vscode-mock-classes.ts, vscode-mock-types.ts,
 * vscode-mock-extras.ts, and feature-specific mocks.
 */

export * from './vscode-mock-classes';
export * from './vscode-mock-types';
export * from './vscode-mock-extras';
export { clipboardMock } from './vscode-mock-clipboard';
export { dialogMock } from './vscode-mock-dialog';
export { messageMock } from './vscode-mock-message';
export { writtenFiles } from './vscode-mock-fs';

import { MockDiagnosticCollection, MockOutputChannel, MockTreeView } from './vscode-mock-classes';
import { MockWebviewPanel } from './vscode-mock-types';
import { clipboardMock, setClipboardText, getClipboardText } from './vscode-mock-clipboard';
import { dialogMock, dialogResults } from './vscode-mock-dialog';
import { messageMock } from './vscode-mock-message';
import { writtenFiles } from './vscode-mock-fs';
import {
  MockTextDocument,
  WorkspaceEdit,
  mockTextDocuments,
  appliedEdits,
  resetTextDocumentMocks,
} from './vscode-mock-textdocument';

export { MockTextDocument, WorkspaceEdit, mockTextDocuments, appliedEdits };

// Track panels, tree views & CodeLens providers created
export const createdPanels: MockWebviewPanel[] = [];
export const createdTreeViews: MockTreeView[] = [];
export const registeredCodeLensProviders: Array<{ selector: any; provider: any }> = [];
export const registeredDefinitionProviders: Array<{ selector: any; provider: any }> = [];
export const registeredHoverProviders: Array<{ selector: any; provider: any }> = [];
export const registeredCodeActionProviders: Array<{ selector: any; provider: any; metadata?: any }> = [];
export const createdDiagnosticCollections: MockDiagnosticCollection[] = [];
export const registeredFileDecorationProviders: any[] = [];
export const registeredTerminalLinkProviders: Array<{ provider: any }> = [];
export const registeredTimelineProviders: Array<{ scheme: string; provider: any }> = [];
export const createdTextDocuments: Array<{ content: string; language: string }> = [];

export const window = {
  createWebviewPanel: (
    _viewType: string,
    _title: string,
    _column: any,
    _options?: any,
  ): MockWebviewPanel => {
    const panel = new MockWebviewPanel();
    createdPanels.push(panel);
    return panel;
  },
  createTreeView: (
    _viewId: string,
    _options: any,
  ): MockTreeView => {
    const tv = new MockTreeView();
    createdTreeViews.push(tv);
    return tv as any;
  },
  registerTreeDataProvider: (
    _viewId: string,
    _provider: any,
  ): { dispose: () => void } => ({ dispose: () => { /* no-op */ } }),
  createOutputChannel: (name: string) => new MockOutputChannel(name),
  createStatusBarItem: (_alignment?: any, _priority?: number) => ({
    text: '',
    command: '',
    tooltip: '',
    backgroundColor: undefined as any,
    show: () => { /* no-op */ },
    hide: () => { /* no-op */ },
    dispose: () => { /* no-op */ },
  }),
  withProgress: async (_options: any, task: (progress: any) => Promise<any>) =>
    task({ report: () => { /* no-op */ } }),
  // Dialog results come from dialogMock (vscode-mock-dialog.ts); the message
  // arrays are tracked in messageMock (vscode-mock-message.ts). The two are
  // coupled here because a shown info/warning both records the message AND
  // returns the pre-set button click.
  showSaveDialog: async (_options?: any) => dialogResults.save,
  showInformationMessage: async (msg: string, ..._items: string[]) => {
    messageMock.infos.push(msg);
    return dialogResults.info;
  },
  showWarningMessage: async (msg: string, ..._items: string[]) => {
    messageMock.warnings.push(msg);
    return dialogResults.warning;
  },
  showErrorMessage: async (msg: string) => {
    messageMock.errors.push(msg);
  },
  showQuickPick: async (_items: any[], _options?: any) => dialogResults.quickPick,
  showInputBox: async (_options?: any) => dialogResults.inputBox,
  showTextDocument: async (_doc: any, _column?: any) => { /* no-op */ },
  registerFileDecorationProvider: (provider: any) => {
    registeredFileDecorationProviders.push(provider);
    return { dispose: () => { /* no-op */ } };
  },
  registerTerminalLinkProvider: (provider: any) => {
    registeredTerminalLinkProviders.push({ provider });
    return { dispose: () => { /* no-op */ } };
  },
  registerWebviewViewProvider: (_viewId: string, _provider: any) => {
    return { dispose: () => { /* no-op */ } };
  },
  activeTextEditor: undefined as any,
  onDidChangeActiveTextEditor: (_listener: any) => ({ dispose: () => { /* no-op */ } }),
  onDidChangeTextEditorSelection: (_listener: any) => ({ dispose: () => { /* no-op */ } }),
};

const registeredCommands: Record<string, (...args: any[]) => any> = {};

const contextValues: Record<string, unknown> = {};

const executedCommands: string[] = [];

export const commands = {
  registerCommand: (id: string, handler: (...args: any[]) => any) => {
    registeredCommands[id] = handler;
    return { dispose: () => { delete registeredCommands[id]; } };
  },
  executeCommand: async (id: string, ...args: any[]) => {
    executedCommands.push(id);
    if (id === 'setContext' && args.length >= 2) {
      contextValues[args[0] as string] = args[1];
      return;
    }
    return registeredCommands[id]?.(...args);
  },
  /** Mirrors vscode.commands.getCommands — the registered command ids. */
  getCommands: async (_filterInternal?: boolean): Promise<string[]> =>
    Object.keys(registeredCommands),
  /** Helper to invoke a registered command in tests. */
  executeRegistered: (id: string, ...args: any[]) => registeredCommands[id]?.(...args),
  getRegistered: () => ({ ...registeredCommands }),
  /** Read a context value set via setContext. */
  getContext: (key: string) => contextValues[key],
};

export const mockCommands = {
  get executed() { return executedCommands; },
  reset() { executedCommands.length = 0; },
};

/**
 * Mirrors vscode.ConfigurationTarget so code that names an explicit settings
 * scope (e.g. the monitoring kill-switch commands) runs under the mock.
 */
export enum ConfigurationTarget {
  Global = 1,
  Workspace = 2,
  WorkspaceFolder = 3,
}

/**
 * Shape returned by the mock `workspace.getConfiguration`. `update` is
 * optional in the TYPE so tests that substitute their own minimal
 * `{ get }` stubs keep compiling, while the default mock supplies it for
 * code paths that write settings (e.g. the monitoring kill-switch commands).
 */
interface MockWorkspaceConfiguration {
  get<T>(key: string, defaultValue?: T): T | undefined;
  update?(key: string, value: unknown, target?: unknown): Promise<void>;
}

export const workspace = {
  getConfiguration: (_section?: string): MockWorkspaceConfiguration => ({
    get: <T>(key: string, defaultValue?: T): T | undefined => defaultValue,
    // Settings writes are accepted and dropped: the mock has no settings
    // store, and callers only need the promise to resolve.
    update: async (_key: string, _value: unknown, _target?: unknown) => { /* no-op */ },
  }),
  onDidChangeConfiguration: (_listener: any) => ({ dispose: () => { /* no-op */ } }),
  onDidChangeTextDocument: (_listener: any) => ({ dispose: () => { /* no-op */ } }),
  onDidSaveTextDocument: (_listener: any) => ({ dispose: () => { /* no-op */ } }),
  onDidOpenTextDocument: (_listener: any) => ({ dispose: () => { /* no-op */ } }),
  onDidCloseTextDocument: (_listener: any) => ({ dispose: () => { /* no-op */ } }),
  onDidCreateFiles: (_listener: any) => ({ dispose: () => { /* no-op */ } }),
  onDidDeleteFiles: (_listener: any) => ({ dispose: () => { /* no-op */ } }),
  openTextDocument: async (options: any) => {
    if (options && typeof options === 'object' && 'content' in options) {
      createdTextDocuments.push(options);
      return options;
    }
    // Called with a Uri (the suppression-commands.ts path): return the
    // fixture a test registered in mockTextDocuments, or an empty document
    // so lineAt()/lineCount don't throw when a test doesn't need line text.
    const key = options?.toString?.() ?? String(options);
    return mockTextDocuments.get(key) ?? new MockTextDocument(options, ['']);
  },
  // Applies only `.insert()` edits (the sole WorkspaceEdit operation this
  // codebase's suppression commands use) by recording them; no test needs
  // the mock document's own text to reflect the edit afterward.
  applyEdit: async (edit: WorkspaceEdit): Promise<boolean> => {
    appliedEdits.push(edit);
    return true;
  },
  findFiles: async (_include: any, _exclude?: any): Promise<any[]> => [],
  registerTimelineProvider: (scheme: string, provider: any) => {
    registeredTimelineProviders.push({ scheme, provider });
    return { dispose: () => { /* no-op */ } };
  },
  createFileSystemWatcher: (_pattern: any) => ({
    onDidCreate: (_listener: any) => ({ dispose: () => { /* no-op */ } }),
    onDidChange: (_listener: any) => ({ dispose: () => { /* no-op */ } }),
    onDidDelete: (_listener: any) => ({ dispose: () => { /* no-op */ } }),
    dispose: () => { /* no-op */ },
  }),
  // File writes are recorded in writtenFiles (vscode-mock-fs.ts) so tests can
  // inspect them; reads return empty and directory creation is a no-op.
  fs: {
    readFile: async (_uri: any): Promise<Uint8Array> => new Uint8Array(),
    writeFile: async (uri: any, content: Uint8Array) => {
      writtenFiles.push({ uri, content });
    },
    createDirectory: async (_uri: any): Promise<void> => { /* no-op */ },
  },
};

export const env = {
  openExternal: async (_uri: any) => true,
  clipboard: {
    writeText: async (text: string) => { setClipboardText(text); },
    readText: async () => getClipboardText(),
  },
};

/**
 * Mock of `vscode.l10n`. With no translation bundle loaded (the test environment),
 * the real `vscode.l10n.t()` returns the English message verbatim, applying only
 * `{0}`/`{1}` positional substitution — so this mock does exactly that. Lets the
 * host l10n runtime (src/l10n.ts) run under the test harness.
 */
export const l10n = {
  t(message: string, ...args: Array<string | number | boolean>): string {
    if (args.length === 0) {
      return message;
    }
    return message.replace(/\{(\d+)\}/g, (match, index) => {
      const i = Number(index);
      return i < args.length ? String(args[i]) : match;
    });
  },
};


/** Registry a test populates so `languages.getDiagnostics(uri)` returns fixtures. */
export const mockDiagnosticsByUri = new Map<string, any[]>();

export const languages = {
  createDiagnosticCollection: (name: string): MockDiagnosticCollection => {
    const col = new MockDiagnosticCollection(name);
    createdDiagnosticCollections.push(col);
    return col;
  },
  registerCodeLensProvider: (selector: any, provider: any) => {
    registeredCodeLensProviders.push({ selector, provider });
    return { dispose: () => { /* no-op */ } };
  },
  registerDefinitionProvider: (selector: any, provider: any) => {
    registeredDefinitionProviders.push({ selector, provider });
    return { dispose: () => { /* no-op */ } };
  },
  registerHoverProvider: (selector: any, provider: any) => {
    registeredHoverProviders.push({ selector, provider });
    return { dispose: () => { /* no-op */ } };
  },
  registerCodeActionsProvider: (selector: any, provider: any, metadata?: any) => {
    registeredCodeActionProviders.push({ selector, provider, metadata });
    return { dispose: () => { /* no-op */ } };
  },
  getDiagnostics: (uri?: any): any[] => {
    if (!uri) {
      return [];
    }
    return mockDiagnosticsByUri.get(uri.toString()) ?? [];
  },
  onDidChangeDiagnostics: (_listener: any) => ({ dispose: () => { /* no-op */ } }),
};

import { resetExtras } from './vscode-mock-extras';

/** Reset all shared mock state between tests. */
export function resetMocks(): void {
  createdPanels.length = 0;
  createdTreeViews.length = 0;
  writtenFiles.length = 0;
  clipboardMock.reset();
  dialogMock.reset();
  messageMock.reset();
  mockCommands.reset();
  registeredCodeLensProviders.length = 0;
  registeredDefinitionProviders.length = 0;
  registeredHoverProviders.length = 0;
  registeredCodeActionProviders.length = 0;
  registeredFileDecorationProviders.length = 0;
  registeredTerminalLinkProviders.length = 0;
  registeredTimelineProviders.length = 0;
  createdDiagnosticCollections.length = 0;
  createdTextDocuments.length = 0;
  mockDiagnosticsByUri.clear();
  resetTextDocumentMocks();
  resetExtras();
  for (const key of Object.keys(registeredCommands)) {
    delete registeredCommands[key];
  }
  for (const key of Object.keys(contextValues)) {
    delete contextValues[key];
  }
  window.activeTextEditor = undefined;
}
