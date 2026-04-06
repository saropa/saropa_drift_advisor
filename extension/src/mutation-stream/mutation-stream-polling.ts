/**
 * Polling logic for the mutation stream panel.
 *
 * Extracted from `mutation-stream-panel.ts` so each file stays focused
 * on a single responsibility: the panel owns UI + state, while this
 * module owns the long-running poll loop and error handling.
 */

import * as vscode from 'vscode';
import type { DriftApiClient } from '../api-client';
import type { MutationEvent } from '../api-types';

/**
 * Maximum number of mutation events to keep in the in-memory buffer.
 * Keeps the UI bounded even if the server ring buffer is larger.
 */
export const MAX_MUTATION_BUFFER_SIZE = 500;

/**
 * Options passed to {@link MutationStreamPoller.start} that let the
 * poller interact with the panel without depending on it directly.
 */
export interface PollCallbacks {
  /** Returns `true` when the panel is paused (skip fetching). */
  isPaused: () => boolean;

  /** Returns the current cursor so the poller knows where to resume. */
  getSince: () => number;

  /**
   * Called whenever the server returns new mutation events.
   * The panel should update its buffer, cursor, and re-render.
   */
  onNewEvents: (events: MutationEvent[], cursor: number) => void;
}

/**
 * Handles the long-running poll loop for the mutation stream panel.
 *
 * Separated from the panel UI so that polling concerns (retry back-off,
 * error toasts, token invalidation) live in their own module.
 */
export class MutationStreamPoller {
  /** Whether the poll loop is currently active. */
  private _polling = false;

  /**
   * Monotonically increasing token used to invalidate stale loops.
   * Each call to {@link start} bumps the token; any in-flight loop
   * whose captured token no longer matches will exit gracefully.
   */
  private _pollToken = 0;

  /**
   * Guards against spamming VS Code warning toasts on every failed
   * poll iteration. Set to `true` after the first warning is shown.
   */
  private _didWarnPollFailure = false;

  constructor(private readonly _client: DriftApiClient) {}

  /** Whether the poller is currently running. */
  get polling(): boolean {
    return this._polling;
  }

  /**
   * Start the poll loop.
   *
   * The loop runs until {@link stop} is called or the poll token is
   * invalidated by a subsequent call to `start`. While paused, the
   * loop sleeps briefly instead of hitting the server.
   */
  start(opts: PollCallbacks): void {
    // Prevent duplicate loops from stacking up.
    if (this._polling) return;
    this._polling = true;

    // Capture a token so we can detect when this loop is stale.
    const token = ++this._pollToken;

    void (async () => {
      while (this._polling && token === this._pollToken) {
        // When the panel is paused, delay briefly and skip the fetch.
        if (opts.isPaused()) {
          await new Promise((r) => setTimeout(r, 250));
          continue;
        }

        // Perform a single poll cycle (fetch + notify or error).
        await this._pollOnce(token, opts);
      }
    })();
  }

  /** Stop polling (idempotent). Safe to call even if already stopped. */
  stop(): void {
    this._polling = false;
  }

  /**
   * Perform a single poll cycle: fetch new events from the server and
   * forward them to the panel via the `onNewEvents` callback.
   */
  private async _pollOnce(
    token: number,
    opts: PollCallbacks,
  ): Promise<void> {
    try {
      const resp = await this._client.mutations(opts.getSince());

      // If the loop was stopped or superseded while we were awaiting
      // the network call, discard the result silently.
      if (!this._polling || token !== this._pollToken) return;

      if (resp.events.length > 0) {
        opts.onNewEvents(resp.events, resp.cursor);
      }
    } catch (err: unknown) {
      await this._handlePollError(err);
    }
  }

  /**
   * Handle a poll error: show a warning toast (once) and optionally
   * stop polling entirely if the server signals 501 (not supported).
   */
  private async _handlePollError(err: unknown): Promise<void> {
    const msg = err instanceof Error ? err.message : 'Unknown error';

    // Only show the first failure to avoid flooding the notification
    // area with repeated toasts on every poll interval.
    if (!this._didWarnPollFailure) {
      void vscode.window
        .showWarningMessage(
          `Mutation stream poll failed: ${msg}`,
          'Retry Discovery',
        )
        .then((choice) => {
          if (choice === 'Retry Discovery') {
            void vscode.commands.executeCommand('driftViewer.retryDiscovery');
          }
        });
      this._didWarnPollFailure = true;
    }

    // A 501 response means the server does not support the mutations
    // endpoint at all, so there is no point in retrying.
    if (msg.includes('501')) {
      this._polling = false;
      return;
    }

    // Back off before the next attempt to avoid hammering the server.
    await new Promise((r) => setTimeout(r, 2000));
  }
}
