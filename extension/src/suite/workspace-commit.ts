/**
 * Saropa suite integration — resolving the workspace commit (plan 67 R6).
 *
 * The suite correlates the three tools' diagnostics by the commit they were
 * captured at: Advisor stamps its mirror with the current commit, and flags a
 * sibling finding from a different commit as stale. We read `.git/HEAD` directly
 * (dependency-free, works headless) rather than depending on the VS Code Git
 * extension being present/activated.
 *
 * Best-effort throughout: a missing `.git`, a detached/odd HEAD, or any read
 * error yields `undefined`, which callers treat as "commit unknown" (no
 * stamping, no staleness) rather than an error.
 */
import * as vscode from 'vscode';

/**
 * Interprets a `.git/HEAD` file's contents. Pure and exported for tests.
 * Returns either a direct detached-HEAD sha or the ref path to resolve.
 */
export function parseHeadRef(headText: string): { sha?: string; ref?: string } {
  const line = headText.trim();
  const refMatch = /^ref:\s*(.+)$/.exec(line);
  if (refMatch) return { ref: refMatch[1].trim() };
  // Detached HEAD: the file holds a raw 40-hex sha.
  if (/^[0-9a-f]{40}$/i.test(line)) return { sha: line };
  return {};
}

/** Finds a ref's sha in `.git/packed-refs` text. Pure and exported for tests. */
export function findPackedRef(packedRefsText: string, ref: string): string | undefined {
  for (const raw of packedRefsText.split('\n')) {
    const line = raw.trim();
    if (!line || line.startsWith('#') || line.startsWith('^')) continue;
    const sp = line.indexOf(' ');
    if (sp < 0) continue;
    if (line.slice(sp + 1).trim() === ref) return line.slice(0, sp).trim();
  }
  return undefined;
}

/**
 * Resolves the current commit sha of the first workspace folder, or undefined.
 * Tries the loose ref file first, then packed-refs, mirroring how Git stores a
 * branch tip either way.
 */
export async function resolveWorkspaceCommit(): Promise<string | undefined> {
  const folder = vscode.workspace.workspaceFolders?.[0];
  if (!folder) return undefined;
  const gitDir = vscode.Uri.joinPath(folder.uri, '.git');

  let head: { sha?: string; ref?: string };
  try {
    const bytes = await vscode.workspace.fs.readFile(
      vscode.Uri.joinPath(gitDir, 'HEAD'),
    );
    head = parseHeadRef(new TextDecoder().decode(bytes));
  } catch {
    return undefined;
  }
  if (head.sha) return head.sha;
  if (!head.ref) return undefined;

  // Loose ref: .git/<ref>
  try {
    const bytes = await vscode.workspace.fs.readFile(
      vscode.Uri.joinPath(gitDir, ...head.ref.split('/')),
    );
    const sha = new TextDecoder().decode(bytes).trim();
    if (sha) return sha;
  } catch {
    // Fall through to packed-refs.
  }

  // Packed ref: .git/packed-refs
  try {
    const bytes = await vscode.workspace.fs.readFile(
      vscode.Uri.joinPath(gitDir, 'packed-refs'),
    );
    return findPackedRef(new TextDecoder().decode(bytes), head.ref);
  } catch {
    return undefined;
  }
}
