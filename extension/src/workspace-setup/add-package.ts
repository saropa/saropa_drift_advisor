/**
 * Workspace setup: add saropa_drift_advisor to the project's pubspec and run pub get.
 * Installing the extension should install the package in the project, and vice versa.
 */

import { exec } from 'child_process';
import { promisify } from 'util';
import * as vscode from 'vscode';

const execAsync = promisify(exec);

/** Package name as it appears in pubspec dependencies. */
const PACKAGE_NAME = 'saropa_drift_advisor';
/** Version constraint; keep in sync with repo pubspec when cutting releases. */
const PACKAGE_VERSION = '^1.3.1';

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
function hasPackage(pubspecContent: string): boolean {
  return new RegExp(`\\b${PACKAGE_NAME}\\s*:`).test(pubspecContent);
}

/**
 * Detects Flutter projects so we run flutter pub get instead of dart pub get.
 */
function isFlutterProject(pubspecContent: string): boolean {
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

async function runInWorkspace(cwd: string, command: string): Promise<{ stdout: string; stderr: string }> {
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
  const { modified: pubspecModified, content: newContent } = addPackageToPubspec(content);

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
  if (pubspecModified) parts.push(`Added ${PACKAGE_NAME} to dependencies.`);
  parts.push('Run your app with the Drift debug server to connect.');
  return {
    pubspecModified,
    pubGetOk: true,
    message: parts.join(' '),
  };
}
