/**
 * Shared test helpers for fs.readFile-based source scanning tests.
 */

/** Encode a string as UTF-8 bytes, matching vscode.workspace.fs.readFile. */
export function encodeUtf8(content: string): Uint8Array {
  return new TextEncoder().encode(content);
}
