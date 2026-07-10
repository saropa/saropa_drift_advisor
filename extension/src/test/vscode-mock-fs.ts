/**
 * Filesystem mock state for testing. The unified `workspace.fs` object in
 * vscode-mock.ts appends written files here so assertions can inspect them.
 */

export const writtenFiles: Array<{ uri: any; content: Uint8Array }> = [];
