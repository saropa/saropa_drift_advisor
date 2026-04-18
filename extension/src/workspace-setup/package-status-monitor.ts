/**
 * Monitors the workspace pubspec.yaml for saropa_drift_advisor presence and version.
 * Sets context keys for conditional UI (hiding the "Add Package" button when already
 * installed) and offers to upgrade when an outdated version is detected.
 *
 * Lifecycle: instantiate once in activate(), dispose via context.subscriptions.
 * All network errors are silently swallowed — this is a background convenience
 * feature that must never interrupt the user.
 */

import * as vscode from 'vscode';
import { fetchWithTimeout } from '../transport/fetch-utils';
import { isDriftProject } from '../diagnostics/dart-file-parser';
import {
  PACKAGE_NAME,
  hasPackage,
  extractPackageVersion,
  parseMinVersion,
  isVersionOlder,
  isFlutterProject,
  runInWorkspace,
} from './add-package';

/** pub.dev API endpoint for package metadata. */
const PUB_DEV_API_URL = `https://pub.dev/api/packages/${PACKAGE_NAME}`;

/** Delay before first check after activation (ms). Lets VS Code finish loading. */
const INITIAL_CHECK_DELAY_MS = 5_000;

/** Minimum interval between pub.dev fetches to avoid hammering the API (ms). */
const MIN_FETCH_INTERVAL_MS = 60 * 60 * 1_000; // 1 hour

/** Escape special regex characters in a string for use in RegExp constructor. */
function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export class PackageStatusMonitor implements vscode.Disposable {
  private readonly _disposables: vscode.Disposable[] = [];
  private _initialTimer: ReturnType<typeof setTimeout> | undefined;

  /** Timestamp of the last successful pub.dev fetch. */
  private _lastFetchTime = 0;
  /** Cached latest version from pub.dev (null if never fetched). */
  private _lastLatestVersion: string | null = null;
  /** Tracks whether we've already shown the upgrade prompt this session. */
  private _upgradePromptShown = false;
  /** Previous installed state, used to detect transitions. */
  private _wasInstalled: boolean | undefined;

  /** Event fired when the package-installed state changes. */
  private readonly _onDidChangeInstalled = new vscode.EventEmitter<boolean>();
  readonly onDidChangeInstalled = this._onDidChangeInstalled.event;

  /**
   * Start monitoring. Creates a file system watcher for pubspec.yaml
   * and schedules the initial check after a short delay.
   */
  start(): void {
    // Watch pubspec.yaml for create/change/delete events in the workspace
    const watcher = vscode.workspace.createFileSystemWatcher('**/pubspec.yaml');
    const handleChange = (): void => { this._checkPubspec().catch(() => {}); };

    this._disposables.push(
      watcher,
      watcher.onDidCreate(handleChange),
      watcher.onDidChange(handleChange),
      watcher.onDidDelete(handleChange),
    );

    // Delayed initial check so we don't slow down activation
    this._initialTimer = setTimeout(() => {
      this._initialTimer = undefined;
      this._checkPubspec().catch(() => {});
    }, INITIAL_CHECK_DELAY_MS);
  }

  dispose(): void {
    if (this._initialTimer !== undefined) {
      clearTimeout(this._initialTimer);
      this._initialTimer = undefined;
    }
    this._onDidChangeInstalled.dispose();
    for (const d of this._disposables) {
      d.dispose();
    }
  }

  // ── Core logic ───────────────────────────────────────────────────────

  /**
   * Read pubspec, set context key, optionally fetch latest and offer upgrade.
   * Entirely fire-and-forget; all errors are caught and silently ignored.
   */
  private async _checkPubspec(): Promise<void> {
    const folders = vscode.workspace.workspaceFolders;
    if (!folders?.length) {
      // No workspace — not a Drift project, package not installed
      void vscode.commands.executeCommand('setContext', 'driftViewer.isDriftProject', false);
      this._setInstalled(false);
      return;
    }

    const root = folders[0].uri;
    const pubspecUri = vscode.Uri.joinPath(root, 'pubspec.yaml');

    let content: string;
    try {
      const bytes = await vscode.workspace.fs.readFile(pubspecUri);
      content = Buffer.from(bytes).toString('utf-8');
    } catch {
      // pubspec.yaml doesn't exist or can't be read — not a Drift project
      void vscode.commands.executeCommand('setContext', 'driftViewer.isDriftProject', false);
      this._setInstalled(false);
      return;
    }

    // Update isDriftProject context key so sidebar views hide/show when the
    // user adds or removes drift from pubspec.yaml while VS Code is open.
    void vscode.commands.executeCommand(
      'setContext', 'driftViewer.isDriftProject', isDriftProject(content),
    );

    // --- Feature 2: set the packageInstalled context key ---
    const installed = hasPackage(content);
    this._setInstalled(installed);

    // Nothing more to do if package isn't in pubspec
    if (!installed) return;

    // --- Feature 1: check if outdated ---
    const constraint = extractPackageVersion(content);
    // git/path dep or unparseable — skip version check
    if (!constraint) return;

    const installedMinVersion = parseMinVersion(constraint);
    if (!installedMinVersion) return;

    // Fetch latest from pub.dev (throttled, silent on failure)
    const latestVersion = await this._fetchLatestVersion();
    if (!latestVersion) return;

    // Compare and optionally prompt (once per session)
    if (isVersionOlder(installedMinVersion, latestVersion) && !this._upgradePromptShown) {
      this._upgradePromptShown = true;
      this._offerUpgrade(pubspecUri, constraint, latestVersion);
    }
  }

  /**
   * Update the context key and fire the change event when the installed state
   * actually transitions.
   */
  private _setInstalled(installed: boolean): void {
    void vscode.commands.executeCommand('setContext', 'driftViewer.packageInstalled', installed);
    if (installed !== this._wasInstalled) {
      this._wasInstalled = installed;
      this._onDidChangeInstalled.fire(installed);
    }
  }

  // ── pub.dev version fetch ────────────────────────────────────────────

  /**
   * Fetch latest version from pub.dev. Returns null on any error.
   * Throttled to at most one network call per hour; returns the cached
   * value between fetches.
   */
  private async _fetchLatestVersion(): Promise<string | null> {
    const now = Date.now();
    // Return cached value if within the throttle window
    if (now - this._lastFetchTime < MIN_FETCH_INTERVAL_MS && this._lastLatestVersion) {
      return this._lastLatestVersion;
    }

    try {
      const resp = await fetchWithTimeout(PUB_DEV_API_URL, { timeoutMs: 8_000 });
      if (!resp.ok) return this._lastLatestVersion;

      const json = await resp.json() as { latest?: { version?: string } };
      const version = json?.latest?.version ?? null;
      if (version) {
        this._lastFetchTime = now;
        this._lastLatestVersion = version;
      }
      return version;
    } catch {
      // Network error, timeout, parse error — all silently ignored
      return this._lastLatestVersion;
    }
  }

  // ── Upgrade prompt ───────────────────────────────────────────────────

  /**
   * Show an information message offering to upgrade the package.
   * Fire-and-forget: the user can dismiss or act on it.
   *
   * Re-reads pubspec.yaml when the user clicks "Upgrade" to avoid overwriting
   * manual edits made between the notification appearing and the user clicking.
   */
  private _offerUpgrade(
    pubspecUri: vscode.Uri,
    currentConstraint: string,
    latestVersion: string,
  ): void {
    void vscode.window.showInformationMessage(
      `Saropa Drift Advisor v${latestVersion} is available (you have ${currentConstraint}).`,
      'Upgrade',
      'Dismiss',
    ).then(async (choice) => {
      if (choice !== 'Upgrade') return;

      try {
        const folders = vscode.workspace.workspaceFolders;
        if (!folders?.length) return;

        // Re-read pubspec.yaml fresh to avoid overwriting manual edits the user
        // may have made between the notification appearing and clicking Upgrade.
        const freshBytes = await vscode.workspace.fs.readFile(pubspecUri);
        const freshContent = Buffer.from(freshBytes).toString('utf-8');

        // Re-extract the constraint from the fresh content in case the user
        // already changed it manually.
        const freshConstraint = extractPackageVersion(freshContent);
        if (!freshConstraint) return;
        const freshMin = parseMinVersion(freshConstraint);
        if (!freshMin || !isVersionOlder(freshMin, latestVersion)) {
          // Already up to date (user may have upgraded manually)
          void vscode.window.showInformationMessage(
            `${PACKAGE_NAME} is already up to date.`,
          );
          return;
        }

        // Replace the old constraint with ^latestVersion
        const newConstraint = `^${latestVersion}`;
        const escapedOld = escapeRegex(freshConstraint);
        const newContent = freshContent.replace(
          new RegExp(`(\\b${PACKAGE_NAME}\\s*:\\s*)["']?${escapedOld}["']?`),
          `$1${newConstraint}`,
        );

        // Write the updated pubspec
        const encoder = new TextEncoder();
        await vscode.workspace.fs.writeFile(pubspecUri, encoder.encode(newContent));

        // Run pub get with a progress notification
        const useFlutter = isFlutterProject(newContent);
        const pubCmd = useFlutter ? 'flutter pub get' : 'dart pub get';
        const root = folders[0].uri.fsPath;

        await vscode.window.withProgress(
          {
            location: vscode.ProgressLocation.Notification,
            title: `Upgrading ${PACKAGE_NAME} to ${newConstraint}`,
            cancellable: false,
          },
          async (progress) => {
            progress.report({ message: `Running ${pubCmd}…` });
            await runInWorkspace(root, pubCmd);
          },
        );

        void vscode.window.showInformationMessage(
          `Upgraded ${PACKAGE_NAME} to ${newConstraint}. Restart your app to use the new version.`,
        );
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        void vscode.window.showErrorMessage(`Failed to upgrade ${PACKAGE_NAME}: ${msg}`);
      }
    });
  }
}
