/**
 * Mock of the `vscode.languages` namespace, split out of vscode-mock.ts.
 */

import { MockDiagnosticCollection } from './vscode-mock-classes';

export const createdDiagnosticCollections: MockDiagnosticCollection[] = [];
export const registeredCodeLensProviders: Array<{ selector: any; provider: any }> = [];
export const registeredDefinitionProviders: Array<{ selector: any; provider: any }> = [];
export const registeredHoverProviders: Array<{ selector: any; provider: any }> = [];
export const registeredCodeActionProviders: Array<{ selector: any; provider: any; metadata?: any }> = [];

/** Registry a test populates so `languages.getDiagnostics(uri)` returns fixtures. */
export const mockDiagnosticsByUri = new Map<string, any[]>();

/** Listeners registered via `languages.onDidChangeDiagnostics`, so a test can fire the event. */
const diagnosticsChangeListeners: Array<(e: { uris: any[] }) => void> = [];

/** Test helper: invoke every registered `onDidChangeDiagnostics` listener with the given uris. */
export function fireDiagnosticsChanged(uris: any[]): void {
  for (const listener of diagnosticsChangeListeners) {
    listener({ uris });
  }
}

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
  onDidChangeDiagnostics: (listener: (e: { uris: any[] }) => void) => {
    diagnosticsChangeListeners.push(listener);
    return {
      dispose: () => {
        const i = diagnosticsChangeListeners.indexOf(listener);
        if (i !== -1) {
          diagnosticsChangeListeners.splice(i, 1);
        }
      },
    };
  },
};

/** Reset all `languages` mock state between tests. */
export function resetLanguagesMocks(): void {
  registeredCodeLensProviders.length = 0;
  registeredDefinitionProviders.length = 0;
  registeredHoverProviders.length = 0;
  registeredCodeActionProviders.length = 0;
  createdDiagnosticCollections.length = 0;
  mockDiagnosticsByUri.clear();
  diagnosticsChangeListeners.length = 0;
}
