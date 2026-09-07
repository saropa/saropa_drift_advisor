/**
 * Mock of the `vscode.commands` namespace, split out of vscode-mock.ts.
 */

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

/** Reset all `commands` mock state between tests. */
export function resetCommandsMocks(): void {
  mockCommands.reset();
  for (const key of Object.keys(registeredCommands)) {
    delete registeredCommands[key];
  }
  for (const key of Object.keys(contextValues)) {
    delete contextValues[key];
  }
}
