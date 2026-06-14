/**
 * Saropa suite integration — cross-tool discovery nudge (plan 67 Phase 6).
 *
 * Grows suite adoption from a real signal, not spam: when the workspace's
 * pubspec.yaml already depends on a sibling Saropa Dart package but that tool's
 * VS Code extension is NOT installed, offer to install the extension — once,
 * ever, per tool. A user who depends on `saropa_lints` but has no Lints
 * extension is missing inline diagnostics they have already opted into; this
 * closes that gap without nagging users who do not use the package.
 *
 * Gated like the l10n coverage notice: the gate is marked BEFORE the toast, so a
 * missed or ignored offer never re-nags. Fire-and-forget from activation — it
 * must never throw into the activation path.
 */
import * as vscode from 'vscode';
import { t } from '../l10n';

/** A sibling tool recommendable when its package is used but its extension is absent. */
interface SiblingTool {
  /** Dart package name to look for in pubspec.yaml. */
  package: string;
  /** VS Code extension id to check for and install. */
  extensionId: string;
  /** globalState key — recommended at most once, ever. */
  gateKey: string;
  /** t() key for the recommendation message body. */
  messageKey: string;
}

const SIBLINGS: readonly SiblingTool[] = [
  {
    package: 'saropa_lints',
    extensionId: 'saropa.saropa-lints',
    gateKey: 'suite.crossRecommend.saropa-lints',
    messageKey: 'host.suite.recommend.lints',
  },
  {
    package: 'saropa_log_capture',
    extensionId: 'saropa.saropa-log-capture',
    gateKey: 'suite.crossRecommend.saropa-log-capture',
    messageKey: 'host.suite.recommend.logCapture',
  },
];

/** Escapes a string for safe literal use inside a RegExp. */
function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * True when [pubspecText] declares [pkg] as a dependency — a `<pkg>:` entry on an
 * indented line. Pure and exported for tests. Requires the `:` right after the
 * name so a longer package (`saropa_lints_extra`) or a mention inside a comment
 * does not false-positive.
 */
export function pubspecDeclaresPackage(pubspecText: string, pkg: string): boolean {
  return new RegExp(`^\\s+${escapeRegExp(pkg)}\\s*:`, 'm').test(pubspecText);
}

/**
 * Pure selection: the siblings whose package is declared, whose extension is not
 * installed, and which have not yet been offered. Exported for tests — the
 * install/IO side stays in {@link maybeRecommendSuiteTools}.
 */
export function recommendableSiblings(
  pubspecText: string,
  isInstalled: (extensionId: string) => boolean,
  isGated: (gateKey: string) => boolean,
): SiblingTool[] {
  return SIBLINGS.filter(
    (s) =>
      pubspecDeclaresPackage(pubspecText, s.package)
      && !isInstalled(s.extensionId)
      && !isGated(s.gateKey),
  );
}

/** Installs an extension by id, falling back to its marketplace page. */
async function installSiblingExtension(extensionId: string): Promise<void> {
  try {
    await vscode.commands.executeCommand(
      'workbench.extensions.installExtension',
      extensionId,
    );
  } catch {
    // Programmatic install isn't available in every editor fork — open the
    // marketplace page so the user can install manually.
    await vscode.env.openExternal(
      vscode.Uri.parse(
        `https://marketplace.visualstudio.com/items?itemName=${extensionId}`,
      ),
    );
  }
}

/**
 * Reads pubspec.yaml, finds an eligible sibling to recommend, and offers to
 * install it once. Offers at most ONE per activation so two missing tools never
 * stack toasts (the second is offered on a later window). Best-effort: a missing
 * pubspec, no workspace, or any failure simply shows nothing.
 */
export async function maybeRecommendSuiteTools(
  context: vscode.ExtensionContext,
): Promise<void> {
  const folder = vscode.workspace.workspaceFolders?.[0];
  if (!folder) return;

  let pubspecText: string;
  try {
    const uri = vscode.Uri.joinPath(folder.uri, 'pubspec.yaml');
    pubspecText = new TextDecoder().decode(
      await vscode.workspace.fs.readFile(uri),
    );
  } catch {
    // No pubspec → not a Dart project we can reason about; stay silent.
    return;
  }

  const eligible = recommendableSiblings(
    pubspecText,
    (id) => vscode.extensions.getExtension(id) !== undefined,
    (key) => context.globalState.get<boolean>(key) === true,
  );
  if (eligible.length === 0) return;

  const tool = eligible[0];
  try {
    // Mark first: an ignored/auto-dismissed offer must not re-nag next launch.
    await context.globalState.update(tool.gateKey, true);
    const install = t('host.suite.recommend.install');
    const choice = await vscode.window.showInformationMessage(
      t(tool.messageKey),
      install,
    );
    if (choice === install) {
      await installSiblingExtension(tool.extensionId);
    }
  } catch {
    // Advisory only — never surface into the activation path.
  }
}
