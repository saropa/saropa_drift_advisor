/**
 * Mock implementation of the vscode API for unit testing outside VS Code.
 * Classes and types are split into vscode-mock-classes.ts, vscode-mock-types.ts,
 * vscode-mock-extras.ts, and feature-specific mocks (window/workspace/commands/
 * languages, plus clipboard/dialog/message/fs/textdocument).
 */

export * from './vscode-mock-classes';
export * from './vscode-mock-types';
export * from './vscode-mock-extras';
export { clipboardMock } from './vscode-mock-clipboard';
export { dialogMock } from './vscode-mock-dialog';
export { messageMock } from './vscode-mock-message';
export { writtenFiles } from './vscode-mock-fs';
export {
  createdPanels,
  createdTreeViews,
  registeredFileDecorationProviders,
  registeredTerminalLinkProviders,
  window,
  fireSelectionChanged,
  fireActiveEditorChanged,
} from './vscode-mock-window';
export {
  createdTextDocuments,
  registeredTimelineProviders,
  ConfigurationTarget,
  workspace,
  getLastCreatedWatcher,
  fireWatcherCreate,
  fireWatcherChange,
  fireWatcherDelete,
} from './vscode-mock-workspace';
export { commands, mockCommands } from './vscode-mock-commands';
export {
  createdDiagnosticCollections,
  registeredCodeLensProviders,
  registeredDefinitionProviders,
  registeredHoverProviders,
  registeredCodeActionProviders,
  mockDiagnosticsByUri,
  fireDiagnosticsChanged,
  languages,
} from './vscode-mock-languages';

import { clipboardMock, setClipboardText, getClipboardText } from './vscode-mock-clipboard';
import { dialogMock } from './vscode-mock-dialog';
import { messageMock } from './vscode-mock-message';
import { writtenFiles } from './vscode-mock-fs';
import { resetWindowMocks } from './vscode-mock-window';
import { resetWorkspaceMocks } from './vscode-mock-workspace';
import { resetCommandsMocks } from './vscode-mock-commands';
import { resetLanguagesMocks } from './vscode-mock-languages';
import {
  MockTextDocument,
  WorkspaceEdit,
  mockTextDocuments,
  appliedEdits,
  resetTextDocumentMocks,
} from './vscode-mock-textdocument';
import { resetExtras } from './vscode-mock-extras';

export { MockTextDocument, WorkspaceEdit, mockTextDocuments, appliedEdits };

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

/** Reset all shared mock state between tests. */
export function resetMocks(): void {
  writtenFiles.length = 0;
  clipboardMock.reset();
  dialogMock.reset();
  messageMock.reset();
  resetWindowMocks();
  resetWorkspaceMocks();
  resetCommandsMocks();
  resetLanguagesMocks();
  resetTextDocumentMocks();
  resetExtras();
}
