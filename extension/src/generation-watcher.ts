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
    if (this._running) return;
    this._running = true;
    this._poll();
  }

  stop(): void {
    this._running = false;
    if (this._pollTimeout !== undefined) {
      clearTimeout(this._pollTimeout);
      this._pollTimeout = undefined;
    }
  }

  private async _poll(): Promise<void> {
    if (!this._running) return;

    let delay = BASE_POLL_MS;
    try {
      const gen = await this._client.generation(this._generation);
      if (!this._running) return;
      this._consecutiveErrors = 0;

      if (gen !== this._generation) {
        this._generation = gen;
        for (const listener of this._listeners) {
          try { listener(); } catch { /* swallow — listener errors must not corrupt poll state */ }
        }
      }
    } catch (err) {
      this._consecutiveErrors++;
      delay = Math.min(BASE_POLL_MS * Math.pow(2, this._consecutiveErrors), MAX_BACKOFF_MS);
      if (this._consecutiveErrors === 1 || this._consecutiveErrors % 10 === 0) {
        const msg = err instanceof Error ? err.message : String(err);
        this._log?.appendLine(
          `[${new Date().toISOString()}] GenerationWatcher: poll error #${this._consecutiveErrors}: ${msg} (next retry in ${delay}ms)`,
        );
      }
    }

    if (this._running) {
      this._pollTimeout = setTimeout(() => this._poll(), delay);
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
