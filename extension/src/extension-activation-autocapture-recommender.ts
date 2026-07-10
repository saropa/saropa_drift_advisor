/**
 * Auto-capture recommendation prompt: offer to enable timeline auto-capture
 * when it is currently off and a live schema is available.
 */
import * as vscode from 'vscode';
import type { DriftApiClient } from './api-client';
import type { FinalPhaseDeps } from './extension-activation-final';

const AUTO_CAPTURE_RECOMMEND_KEY = 'driftViewer.autoCaptureRecommendShown';

/**
 * Creates a recommendation function that offers to enable timeline auto-capture.
 * Gated to once per session; the workspace-state key persists the choice across sessions.
 * Safe on any schema — the capture sweep projects length() over BLOB columns instead
 * of their bytes, so it never materializes blob payloads in the connected app.
 */
export function createAutoCaptureRecommender(d: FinalPhaseDeps) {
  let autoCaptureRecommendChecked = false;

  return (client: typeof d.cachedClient): void => {
    if (autoCaptureRecommendChecked) return;
    autoCaptureRecommendChecked = true;

    const cfg = vscode.workspace.getConfiguration('driftViewer');
    // Already on, or already offered in this workspace — nothing to suggest.
    if (cfg.get<boolean>('timeline.autoCapture', false)) return;
    if (d.context.workspaceState.get<boolean>(AUTO_CAPTURE_RECOMMEND_KEY, false)) return;

    // Metadata-only read (no row payloads); the schema cache is prewarmed on
    // connect, so this is cheap and does not pile onto the app's startup burst.
    void client
      .schemaMetadata()
      .then((metadata) => {
        // An empty metadata result means the schema could not be read — stay silent
        // rather than offer to capture nothing, and free the session guard so a
        // later reconnect with a readable schema can still make the offer.
        if (metadata.length === 0) {
          autoCaptureRecommendChecked = false;
          return;
        }

        // Mark shown before awaiting the choice so a fast reconnect cannot race a
        // second prompt into existence.
        void d.context.workspaceState.update(AUTO_CAPTURE_RECOMMEND_KEY, true);
        void vscode.window
          .showInformationMessage(
            'Timeline auto-capture is off. Enable it to automatically snapshot the database whenever its data changes?',
            'Enable',
            'Not now',
          )
          .then((choice) => {
            if (choice === 'Enable') {
              // Scope to the workspace where the offer was accepted, not globally.
              void vscode.workspace
                .getConfiguration('driftViewer')
                .update('timeline.autoCapture', true, vscode.ConfigurationTarget.Workspace);
            }
          });
      })
      .catch(() => {
        // Schema unreadable (server dropped, auth, etc.) — allow a later
        // reconnect this session to retry the check rather than silently burning it.
        autoCaptureRecommendChecked = false;
      });
  };
}
