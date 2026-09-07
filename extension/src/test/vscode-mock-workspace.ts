/**
 * Mock of the `vscode.workspace` namespace, split out of vscode-mock.ts.
 */

import { writtenFiles } from './vscode-mock-fs';
import {
  MockTextDocument,
  WorkspaceEdit,
  mockTextDocuments,
  appliedEdits,
} from './vscode-mock-textdocument';

export const createdTextDocuments: Array<{ content: string; language: string }> = [];
export const registeredTimelineProviders: Array<{ scheme: string; provider: any }> = [];

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

// Most recently created file-system watcher — tests use this to simulate
// create/change/delete events on the watcher the production code obtained.
let lastCreatedWatcher: any = null;

/** Test helper: return the most recently created FileSystemWatcher mock. */
export function getLastCreatedWatcher(): any {
  return lastCreatedWatcher;
}

/** Fire every `onDidCreate` listener on the most recent watcher. */
export function fireWatcherCreate(uri: any = {}): void {
  if (lastCreatedWatcher) {
    for (const l of lastCreatedWatcher._createListeners) { l(uri); }
  }
}

/** Fire every `onDidChange` listener on the most recent watcher. */
export function fireWatcherChange(uri: any = {}): void {
  if (lastCreatedWatcher) {
    for (const l of lastCreatedWatcher._changeListeners) { l(uri); }
  }
}

/** Fire every `onDidDelete` listener on the most recent watcher. */
export function fireWatcherDelete(uri: any = {}): void {
  if (lastCreatedWatcher) {
    for (const l of lastCreatedWatcher._deleteListeners) { l(uri); }
  }
}

export const workspace = {
  // Empty by default; tests that need readSourceText to find an open dirty
  // document can replace this array for the duration of the test.
  textDocuments: [] as any[],
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
  createFileSystemWatcher: (_pattern: any) => {
    // Capture listeners so tests can simulate file-system events via the
    // exported fire* helpers below.
    const createListeners: Array<(e: any) => void> = [];
    const changeListeners: Array<(e: any) => void> = [];
    const deleteListeners: Array<(e: any) => void> = [];
    const watcher = {
      onDidCreate: (listener: any) => {
        createListeners.push(listener);
        return { dispose: () => { const i = createListeners.indexOf(listener); if (i !== -1) createListeners.splice(i, 1); } };
      },
      onDidChange: (listener: any) => {
        changeListeners.push(listener);
        return { dispose: () => { const i = changeListeners.indexOf(listener); if (i !== -1) changeListeners.splice(i, 1); } };
      },
      onDidDelete: (listener: any) => {
        deleteListeners.push(listener);
        return { dispose: () => { const i = deleteListeners.indexOf(listener); if (i !== -1) deleteListeners.splice(i, 1); } };
      },
      dispose: () => { createListeners.length = 0; changeListeners.length = 0; deleteListeners.length = 0; },
      // Exposed for test helpers — not part of the real VS Code API.
      _createListeners: createListeners,
      _changeListeners: changeListeners,
      _deleteListeners: deleteListeners,
    };
    lastCreatedWatcher = watcher;
    return watcher;
  },
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

/** Reset all `workspace` mock state between tests. */
export function resetWorkspaceMocks(): void {
  createdTextDocuments.length = 0;
  registeredTimelineProviders.length = 0;
  lastCreatedWatcher = null;
}
