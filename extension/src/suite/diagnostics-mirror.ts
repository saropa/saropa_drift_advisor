/**
 * Saropa suite integration — offline diagnostics mirror (plan 67 §2.3 / R2).
 *
 * Writes the live `/api/issues` envelope to
 * `<workspace>/.saropa/diagnostics/advisor.json` so the sibling tools (Saropa
 * Lints, Saropa Log Capture) can read Advisor's issues when the debug server is
 * NOT running. The server is debug-only and disappears the moment the app
 * stops, so the mirror is refreshed WHILE the server is reachable (on each
 * data-change generation tick) rather than at session end, when a fetch would
 * already fail.
 *
 * The server owns the live shape (schemaVersion, producer, generatedAt,
 * per-issue id/category/title), but the live `/api/issues` envelope is NOT
 * written verbatim: it uses the legacy carrier key `issues` and sets each
 * entry's `source` to the DETECTOR name (anomaly / index-suggestion / …),
 * whereas the sibling tools read this file with a strict parser that requires
 * the canonical carrier key `diagnostics` and a tool-level `source` of
 * `advisor`. Writing the live shape verbatim parsed to ZERO diagnostics on the
 * consumer side — the mirror existed but rendered nothing. {@link
 * toCanonicalEnvelope} performs that one translation before the write.
 */
import * as vscode from 'vscode';
import type { DriftApiClient } from '../api-client';
import type { GenerationWatcher } from '../generation-watcher';
import { resolveWorkspaceCommit } from './workspace-commit';
import { recordCommitSnapshot } from './commit-history-store';

const MIRROR_DIR = '.saropa/diagnostics';
const MIRROR_FILE = 'advisor.json';

// Coalesce bursts of generation ticks (e.g. a multi-statement import) into one
// write so a busy session does not thrash the disk.
const DEBOUNCE_MS = 1500;

/**
 * Fetches the current issues envelope and writes it to the workspace mirror.
 *
 * Best-effort: returns false (leaving any existing mirror untouched) when there
 * is no workspace folder, the server is unreachable, or the payload does not
 * look like an envelope — a transient fetch failure must never wipe a good
 * mirror that a sibling may be about to read.
 */
export async function writeAdvisorDiagnosticsMirror(
  client: DriftApiClient,
): Promise<boolean> {
  const folder = vscode.workspace.workspaceFolders?.[0];
  if (!folder) return false;

  let envelope: unknown;
  try {
    envelope = await client.issues();
  } catch {
    return false;
  }

  // Structural guard: only persist something that carries an `issues` array, so
  // a proxy/login HTML page or a server error body is never written as the
  // mirror and read back by a sibling as real data.
  if (
    typeof envelope !== 'object'
    || envelope === null
    || !Array.isArray((envelope as { issues?: unknown }).issues)
  ) {
    return false;
  }

  // Translate the live `/api/issues` shape into the canonical envelope the
  // sibling tools' strict on-disk parser accepts (carrier key `diagnostics`,
  // `source: "advisor"`). See toCanonicalEnvelope for why verbatim fails.
  const canonical = toCanonicalEnvelope(envelope as Record<string, unknown>);

  // Stamp the capture commit (plan 67 R6) so a sibling can tell whether these
  // issues match its current checkout. The server cannot know the workspace's
  // git state (it runs inside the app), so the extension adds it here. Best-
  // effort: when the commit can't be resolved, the field is simply absent.
  const commitSha = await resolveWorkspaceCommit();
  const stamped = commitSha === undefined
    ? canonical
    : { ...canonical, commitSha };

  const dirUri = vscode.Uri.joinPath(folder.uri, ...MIRROR_DIR.split('/'));
  const fileUri = vscode.Uri.joinPath(dirUri, MIRROR_FILE);
  await vscode.workspace.fs.createDirectory(dirUri);
  const bytes = new TextEncoder().encode(JSON.stringify(stamped, null, 2));
  await vscode.workspace.fs.writeFile(fileUri, bytes);
  return true;
}

/**
 * Translates the live `/api/issues` envelope into the canonical Saropa
 * Diagnostic Envelope the sibling tools read from disk.
 *
 * Two and only two things change. (1) The carrier array moves from the legacy
 * key `issues` to `diagnostics` — Log Capture's strict mirror parser rejects
 * the WHOLE file when `diagnostics` is not an array, so a verbatim `issues`
 * envelope yields nothing. (2) Each entry's `source` is set to the tool name
 * `advisor`; the live shape puts the DETECTOR (anomaly / index-suggestion / …)
 * there, but the consumer's parser only accepts a `source` of
 * `lints | advisor | log-capture` and drops any other entry. The detector is
 * preserved as `ruleId` (its canonical home — "the Advisor check id") so the
 * relabel loses no information; an entry that already carries an explicit
 * `ruleId` keeps it. Every other field passes through untouched.
 */
export function toCanonicalEnvelope(
  envelope: Record<string, unknown>,
): Record<string, unknown> {
  const rawIssues = Array.isArray(envelope.issues) ? envelope.issues : [];
  const diagnostics = rawIssues.map((entry) => {
    if (typeof entry !== 'object' || entry === null) return entry;
    const e = entry as Record<string, unknown>;
    const detector = typeof e.source === 'string' ? e.source : undefined;
    return {
      ...e,
      source: 'advisor',
      ruleId: e.ruleId ?? detector,
    };
  });

  // Drop the legacy `issues` key so the file carries exactly one carrier the
  // strict parser recognizes (no duplicated source of truth on disk).
  const { issues: _legacyIssues, ...rest } = envelope;
  return { ...rest, diagnostics };
}

/**
 * Registers the offline mirror: a debounced refresh on every data-change tick,
 * one best-effort write at startup, and the manual
 * `driftViewer.writeDiagnosticsMirror` command.
 */
export function registerDiagnosticsMirror(
  context: vscode.ExtensionContext,
  client: DriftApiClient,
  watcher: GenerationWatcher,
): void {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const schedule = (): void => {
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => {
      timer = undefined;
      // Write the mirror first, then record a per-commit snapshot — the snapshot
      // reads Advisor's mirror from disk, so it must run AFTER the write to pick
      // up the current counts (plan 67 R6 timeline). Both are best-effort.
      void (async () => {
        await writeAdvisorDiagnosticsMirror(client);
        await recordCommitSnapshot();
      })();
    }, DEBOUNCE_MS);
  };

  // Each generation change means data moved, so the issue set may have moved
  // too — refresh the mirror while the server is still up to capture it.
  context.subscriptions.push(watcher.onDidChange(() => schedule()));

  // One best-effort write at startup; if the server is not up yet it silently
  // skips and the next generation tick writes instead.
  schedule();

  // Clear a pending timer on deactivate so it cannot fire after disposal.
  context.subscriptions.push({
    dispose: () => {
      if (timer) clearTimeout(timer);
    },
  });

  context.subscriptions.push(
    vscode.commands.registerCommand(
      'driftViewer.writeDiagnosticsMirror',
      async () => {
        const ok = await writeAdvisorDiagnosticsMirror(client);
        if (ok) {
          // Capture a per-commit snapshot for the timeline alongside the mirror
          // (plan 67 R6); best-effort, so a missing commit just skips it.
          await recordCommitSnapshot();
          void vscode.window.showInformationMessage(
            `Wrote Saropa diagnostics mirror to ${MIRROR_DIR}/${MIRROR_FILE}.`,
          );
        } else {
          void vscode.window.showWarningMessage(
            'Could not write the diagnostics mirror — is the Drift debug server '
              + 'running and a workspace folder open?',
          );
        }
      },
    ),
  );
}
