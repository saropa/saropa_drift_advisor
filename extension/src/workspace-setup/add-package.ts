/**
 * Workspace setup: add saropa_drift_advisor to the project's pubspec and run pub get.
 * Installing the extension should install the package in the project, and vice versa.
 */

import { exec } from 'child_process';
import { promisify } from 'util';
import * as vscode from 'vscode';

const execAsync = promisify(exec);

/** Package name as it appears in pubspec dependencies. */
export const PACKAGE_NAME = 'saropa_drift_advisor';
/** Version constraint; keep in sync with repo pubspec when cutting releases. */
export const PACKAGE_VERSION = '^2.14.1';

/** Prevents concurrent runs (double-click or repeated command). */
let addPackageInProgress = false;

export interface AddPackageResult {
  /** True if pubspec was modified (dependency added). */
  pubspecModified: boolean;
  /** True if pub get succeeded. */
  pubGetOk: boolean;
  /** User-facing message for notifications. */
  message: string;
}

/** Progress reporter for optional step messages (e.g. "Running pub get…"). */
export interface AddPackageProgress {
  report(value: { message?: string }): void;
}

/**
 * Returns true if pubspec content already declares this package (any section).
 */
export function hasPackage(pubspecContent: string): boolean {
  return new RegExp(`\\b${PACKAGE_NAME}\\s*:`).test(pubspecContent);
}

/**
 * Extracts the version constraint string for saropa_drift_advisor from pubspec content.
 * Returns null if the package is not found or uses a non-version dependency (path/git/hosted).
 *
 * Matches patterns like:
 *   saropa_drift_advisor: ^1.6.1
 *   saropa_drift_advisor: ">=1.5.0 <2.0.0"
 *   saropa_drift_advisor: 1.6.1
 */
export function extractPackageVersion(pubspecContent: string): string | null {
  // Match the package name followed by a colon, then capture the version constraint
  // on the same line. Handles optional quotes around the constraint.
  const match = pubspecContent.match(
    new RegExp(`\\b${PACKAGE_NAME}\\s*:\\s*["']?([^"'\\n]+?)["']?\\s*$`, 'm'),
  );
  if (!match) return null;

  // If the captured value looks like a version constraint (starts with ^, >=, <, or a digit),
  // return it. Otherwise it might be a path/git/hosted block — return null.
  const value = match[1].trim();
  if (/^[\^>=<\d]/.test(value)) return value;
  return null;
}

/**
 * Extracts the minimum version number from a Dart version constraint.
 * Given "^1.6.1" returns "1.6.1". Given ">=1.5.0 <2.0.0" returns "1.5.0".
 * Given "1.6.1" returns "1.6.1". Returns null for unparseable constraints.
 */
export function parseMinVersion(constraint: string): string | null {
  // Strip leading ^ or >= and grab the first version-like token
  const match = constraint.match(/(\d+\.\d+\.\d+)/);
  return match ? match[1] : null;
}

/**
 * Returns true if versionA is strictly older than versionB.
 * Both inputs must be "X.Y.Z" format. Returns false on parse failure or equality.
 */
export function isVersionOlder(versionA: string, versionB: string): boolean {
  const partsA = versionA.split('.').map(Number);
  const partsB = versionB.split('.').map(Number);
  if (partsA.length !== 3 || partsB.length !== 3) return false;
  if (partsA.some(isNaN) || partsB.some(isNaN)) return false;

  for (let i = 0; i < 3; i++) {
    if (partsA[i] < partsB[i]) return true;
    if (partsA[i] > partsB[i]) return false;
  }
  return false; // equal
}

/**
 * Detects Flutter projects so we run flutter pub get instead of dart pub get.
 * Exported so the package status monitor can determine whether to run
 * `flutter pub get` or `dart pub get` after an upgrade.
 */
export function isFlutterProject(pubspecContent: string): boolean {
  return /^\s*flutter\s*:/m.test(pubspecContent);
}

/**
 * Inserts saropa_drift_advisor into dependencies. Idempotent if already present.
 * @returns modified true when a new dependency line was inserted.
 */
export function addPackageToPubspec(content: string): { modified: boolean; content: string } {
  if (hasPackage(content)) return { modified: false, content };

  const depsMatch = content.match(/(\s*dependencies\s*:\s*\n)/);
  if (!depsMatch) {
    throw new Error('pubspec.yaml has no dependencies section. Add one, then run this command again.');
  }

  const insertLine = `  ${PACKAGE_NAME}: ${PACKAGE_VERSION}\n`;
  const insertAt = depsMatch.index! + depsMatch[0].length;
  const newContent = content.slice(0, insertAt) + insertLine + content.slice(insertAt);
  return { modified: true, content: newContent };
}

/** Run a shell command in the given workspace directory. 2 MB output buffer. */
export async function runInWorkspace(cwd: string, command: string): Promise<{ stdout: string; stderr: string }> {
  const opts = { cwd, maxBuffer: 2 * 1024 * 1024 };
  return execAsync(command, opts) as Promise<{ stdout: string; stderr: string }>;
}

/**
 * Adds saropa_drift_advisor to the project's pubspec.yaml (dependencies) and runs pub get.
 * Uses the first workspace folder only (single-root or primary folder).
 *
 * @param progress — Optional reporter for step messages (e.g. "Running pub get…").
 * @returns Result with pubspecModified, pubGetOk, and a user-facing message.
 */
export async function addPackageToProject(progress?: AddPackageProgress): Promise<AddPackageResult> {
  if (addPackageInProgress) {
    return {
      pubspecModified: false,
      pubGetOk: false,
      message: 'Add package is already running. Wait for it to finish.',
    };
  }
  addPackageInProgress = true;
  try {
    return await addPackageToProjectImpl(progress);
  } finally {
    addPackageInProgress = false;
  }
}

async function addPackageToProjectImpl(progress?: AddPackageProgress): Promise<AddPackageResult> {
  const folders = vscode.workspace.workspaceFolders;
  if (!folders?.length) {
    return {
      pubspecModified: false,
      pubGetOk: false,
      message: 'No workspace folder open. Open a Dart or Flutter project first.',
    };
  }

  const root = folders[0].uri.fsPath;
  const pubspecUri = vscode.Uri.file(`${root}/pubspec.yaml`);

  let doc: vscode.TextDocument;
  try {
    doc = await vscode.workspace.openTextDocument(pubspecUri);
  } catch {
    return {
      pubspecModified: false,
      pubGetOk: false,
      message: `No pubspec.yaml in workspace root. Open a Dart or Flutter project.`,
    };
  }

  const content = doc.getText();

  let pubspecModified: boolean;
  let newContent: string;
  try {
    const result = addPackageToPubspec(content);
    pubspecModified = result.modified;
    newContent = result.content;
  } catch (e) {
    // addPackageToPubspec throws when pubspec is missing a dependencies section
    const msg = e instanceof Error ? e.message : String(e);
    return { pubspecModified: false, pubGetOk: false, message: msg };
  }

  if (pubspecModified) {
    const edit = new vscode.WorkspaceEdit();
    edit.replace(pubspecUri, new vscode.Range(0, 0, doc.lineCount, 0), newContent);
    await vscode.workspace.applyEdit(edit);
  }

  const useFlutter = isFlutterProject(newContent);
  const pubCmd = useFlutter ? 'flutter pub get' : 'dart pub get';
  progress?.report({ message: 'Running pub get…' });
  let pubGetOk = false;
  try {
    await runInWorkspace(root, pubCmd);
    pubGetOk = true;
  } catch (e) {
    const err = e as { message?: string };
    return {
      pubspecModified,
      pubGetOk: false,
      message: pubspecModified
        ? `Added ${PACKAGE_NAME} to pubspec. ${pubCmd} failed: ${err.message ?? String(e)}`
        : `${pubCmd} failed: ${err.message ?? String(e)}`,
    };
  }

  const parts: string[] = [];
  if (pubspecModified) {
    parts.push(`Added ${PACKAGE_NAME} ${PACKAGE_VERSION} to dependencies.`);
  } else {
    parts.push(`${PACKAGE_NAME} is already in pubspec.yaml.`);
  }
  parts.push('Run your app with the Drift debug server to connect.');
  return {
    pubspecModified,
    pubGetOk: true,
    message: parts.join(' '),
  };
}
