import type { IDiscoveryLog } from './server-discovery';
import { DriftApiClient } from './api-client';

type Listener = () => void;

const BASE_POLL_MS = 1000;
const MAX_BACKOFF_MS = 30000;

/**
 * Polls the server's `/api/generation` endpoint and fires listeners when the
 * generation number changes (indicating schema mutation). Uses exponential
 * backoff on consecutive errors: 1s → 2s → 4s → … → 30s cap, resetting
 * immediately on success.
 */
export class GenerationWatcher {
  private readonly _client: DriftApiClient;
  private _generation = 0;
  private _running = false;
  private _consecutiveErrors = 0;
  private _listeners: Listener[] = [];
  private _pollTimeout: ReturnType<typeof setTimeout> | undefined;
  private _log: IDiscoveryLog | undefined;

  /**
   * Monotonic polling-session id. stop() bumps it so an in-flight poll that
   * resolves after a stop/start cycle (the server-switch race) sees a stale id
   * and discards its result instead of forking a duplicate poll chain.
   * Mirrors ServerDiscovery._pollId.
   */
  private _pollId = 0;

  /** True after dispose() — prevents restart from stale references. */
  private _disposed = false;

  /** Aborts the in-flight HTTP request on stop() so the network connection is
   *  freed immediately instead of waiting for the server's long-poll timeout. */
  private _abortController: AbortController | undefined;

  constructor(client: DriftApiClient) {
    this._client = client;
  }

  /** Attach a log sink for diagnostics. */
  setLog(log: IDiscoveryLog): void {
    this._log = log;
  }

  onDidChange(listener: Listener): { dispose: () => void } {
    this._listeners.push(listener);
    return {
      dispose: () => {
        this._listeners = this._listeners.filter((l) => l !== listener);
      },
    };
  }

  start(): void {
    // Prevent restart after dispose() — stale references must not revive polling
    if (this._running || this._disposed) return;
    this._running = true;
    // Capture current epoch so this chain retires if stop() is called
    void this._poll(this._pollId);
  }

  stop(): void {
    this._running = false;
    // Retire this polling session so any in-flight await discards its result
    this._pollId++;
    // Cancel the in-flight HTTP request immediately so the network connection
    // is freed instead of waiting for the server's 30 s long-poll timeout.
    if (this._abortController) {
      this._abortController.abort();
      this._abortController = undefined;
    }
    if (this._pollTimeout !== undefined) {
      clearTimeout(this._pollTimeout);
      this._pollTimeout = undefined;
    }
  }

  /** Permanently stop polling and detach all listeners. */
  dispose(): void {
    this._disposed = true;
    this.stop();
    this._listeners = [];
  }

  private async _poll(id: number): Promise<void> {
    // Stale session — a stop/start cycle retired this chain
    if (!this._running || id !== this._pollId) return;

    let delay = BASE_POLL_MS;
    try {
      // Fresh controller per request so stop() can abort the in-flight fetch
      this._abortController = new AbortController();
      const gen = await this._client.generation(
        this._generation,
        this._abortController.signal,
      );
      this._abortController = undefined;
      // Re-check after the await: stop() or a new start() may have bumped _pollId
      if (!this._running || id !== this._pollId) return;
      this._consecutiveErrors = 0;

      if (gen !== this._generation) {
        this._generation = gen;
        // Snapshot the array so a listener calling stop() mid-iteration
        // doesn't corrupt the loop or skip subsequent listeners.
        const snapshot = this._listeners.slice();
        for (const listener of snapshot) {
          try { listener(); } catch { /* swallow — listener errors must not corrupt poll state */ }
        }
      }
    } catch (err) {
      this._abortController = undefined;
      // Intentional abort from stop() — not a server error, don't count it
      if (err instanceof Error && err.name === 'AbortError') return;
      // Superseded while awaiting — discard without touching error counters
      if (!this._running || id !== this._pollId) return;
      this._consecutiveErrors++;
      delay = Math.min(BASE_POLL_MS * Math.pow(2, this._consecutiveErrors), MAX_BACKOFF_MS);
      if (this._consecutiveErrors === 1 || this._consecutiveErrors % 10 === 0) {
        const msg = err instanceof Error ? err.message : String(err);
        this._log?.appendLine(
          `[${new Date().toISOString()}] GenerationWatcher: poll error #${this._consecutiveErrors}: ${msg} (next retry in ${delay}ms)`,
        );
      }
    }

    // Only schedule continuation if this session is still current
    if (this._running && id === this._pollId) {
      this._pollTimeout = setTimeout(() => this._poll(id), delay);
    }
  }

  /** Reset the generation counter (e.g., after active server changes). */
  reset(): void {
    this._generation = 0;
    this._consecutiveErrors = 0;
  }

  get generation(): number {
    return this._generation;
  }
}
