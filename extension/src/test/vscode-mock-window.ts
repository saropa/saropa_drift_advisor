/**
 * Mock of the `vscode.window` namespace, split out of vscode-mock.ts.
 */

import { MockOutputChannel, MockTreeView } from './vscode-mock-classes';
import { MockWebviewPanel } from './vscode-mock-types';
import { dialogResults } from './vscode-mock-dialog';
import { messageMock } from './vscode-mock-message';

export const createdPanels: MockWebviewPanel[] = [];
export const createdTreeViews: MockTreeView[] = [];
export const registeredFileDecorationProviders: any[] = [];
export const registeredTerminalLinkProviders: Array<{ provider: any }> = [];

const activeEditorChangeListeners: Array<(e: any) => void> = [];
const selectionChangeListeners: Array<(e: any) => void> = [];

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
  // A test can set `dialogMock.quickPickResult` to a plain value, or to a
  // function run at pick-resolution time — the latter lets a test perform a
  // side effect (e.g. mutate mockDiagnosticsByUri) exactly at the point the
  // real user's pick would resolve, to exercise races against that await.
  showQuickPick: async (_items: any[], _options?: any) =>
    typeof dialogResults.quickPick === 'function'
      ? dialogResults.quickPick()
      : dialogResults.quickPick,
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
  onDidChangeActiveTextEditor: (listener: (e: any) => void) => {
    activeEditorChangeListeners.push(listener);
    return {
      dispose: () => {
        const i = activeEditorChangeListeners.indexOf(listener);
        if (i !== -1) activeEditorChangeListeners.splice(i, 1);
      },
    };
  },
  onDidChangeTextEditorSelection: (listener: (e: any) => void) => {
    selectionChangeListeners.push(listener);
    return {
      dispose: () => {
        const i = selectionChangeListeners.indexOf(listener);
        if (i !== -1) selectionChangeListeners.splice(i, 1);
      },
    };
  },
};

/** Test helper: fire every registered `onDidChangeTextEditorSelection` listener. */
export function fireSelectionChanged(e: any = {}): void {
  for (const listener of selectionChangeListeners) {
    listener(e);
  }
}

/** Test helper: fire every registered `onDidChangeActiveTextEditor` listener. */
export function fireActiveEditorChanged(e: any = window.activeTextEditor): void {
  for (const listener of activeEditorChangeListeners) {
    listener(e);
  }
}

/** Reset all `window` mock state between tests. */
export function resetWindowMocks(): void {
  createdPanels.length = 0;
  createdTreeViews.length = 0;
  registeredFileDecorationProviders.length = 0;
  registeredTerminalLinkProviders.length = 0;
  activeEditorChangeListeners.length = 0;
  selectionChangeListeners.length = 0;
  window.activeTextEditor = undefined;
}
