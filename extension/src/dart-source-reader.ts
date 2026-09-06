/**
 * Low-overhead helpers for bulk Dart source scanning.
 *
 * These read file text WITHOUT creating a live TextDocument in the extension
 * host (which would fire onDidOpenTextDocument into every listening extension
 * and promote the file with the Dart analysis server). When a file is already
 * open with unsaved edits, the dirty buffer text is returned instead of the
 * on-disk bytes so regex matches stay consistent with what the user sees.
 */

import * as vscode from 'vscode';

/**
 * Exclude glob shared by all bulk Dart-source scans. Skips dot-prefixed
 * directories (.fvm, .git, .idea, .dart_tool, .symlinks, etc.), build
 * output, generated code, and mocks — none of which contain user-authored
 * Drift table definitions.
 */
export const DART_SOURCE_EXCLUDE_GLOB =
  '{**/.*,**/build/**,**/*.g.dart,**/*.freezed.dart,**/*.mocks.dart}';

/**
 * Read a Dart file's text without creating a TextDocument.
 *
 * Checks the already-open document list first so unsaved edits are not lost;
 * falls back to a raw byte read that fires no workspace events.
 */
export async function readSourceText(uri: vscode.Uri): Promise<string> {
  // If the file is already open in an editor tab, honour unsaved edits.
  // Hoist the target string outside .find() to avoid recomputing it per element.
  const uriKey = uri.toString();
  const openDoc = vscode.workspace.textDocuments.find(
    (d) => d.uri.toString() === uriKey,
  );
  if (openDoc) {
    return openDoc.getText();
  }

  // Raw byte read — no TextDocument created, no onDidOpenTextDocument fired.
  const bytes = await vscode.workspace.fs.readFile(uri);
  return new TextDecoder('utf-8').decode(bytes);
}

/**
 * Compute a VS Code Position (line, character) from a flat character offset
 * in a source string. Equivalent to `TextDocument.positionAt()` but works
 * on raw text without needing a document instance.
 */
export function positionFromOffset(
  text: string,
  offset: number,
): vscode.Position {
  // Count \n characters before the offset to derive the line number.
  // CRLF (\r\n) is handled correctly: the \r is a regular character that
  // doesn't affect line counting, and the character offset is measured from
  // the \n position, so the next line starts at \n + 1 regardless.
  let line = 0;
  let lastNewline = -1;
  for (let i = 0; i < offset && i < text.length; i++) {
    if (text[i] === '\n') {
      line++;
      lastNewline = i;
    }
  }
  const character = offset - lastNewline - 1;
  return new vscode.Position(line, character);
}

/** Default batch size for bounded-concurrency reads. */
const DEFAULT_BATCH_SIZE = 20;

/**
 * Read multiple files with bounded concurrency. Processes URIs in batches
 * of `batchSize` via Promise.all, preventing hundreds of simultaneous
 * readFile calls from overwhelming the extension host's I/O.
 */
export async function readSourceTextsInBatches(
  uris: vscode.Uri[],
  batchSize: number = DEFAULT_BATCH_SIZE,
): Promise<Array<{ uri: vscode.Uri; text: string }>> {
  const results: Array<{ uri: vscode.Uri; text: string }> = [];
  for (let i = 0; i < uris.length; i += batchSize) {
    const batch = uris.slice(i, i + batchSize);
    const batchResults = await Promise.all(
      batch.map(async (uri) => ({
        uri,
        text: await readSourceText(uri),
      })),
    );
    results.push(...batchResults);
  }
  return results;
}
