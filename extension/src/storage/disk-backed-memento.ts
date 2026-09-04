/**
 * A vscode.Memento implementation backed by JSON files on disk (under
 * context.storageUri) instead of the in-memory workspaceState store.
 *
 * VS Code warns when workspaceState exceeds ~1 MB and recommends storageUri.
 * Heavy stores (BranchManager, SchemaTracker, SchemaCache, analysis history)
 * use this memento so their bulk data lives on disk, not in the renderer heap.
 *
 * Each key maps to a separate JSON file so reads/writes are independent and a
 * corrupt file cannot take down unrelated keys.
 *
 * Lazy-load: files are NOT read at construction. Individual keys are loaded
 * from disk on first get(); keys() triggers a full directory scan only when
 * called. This keeps activation fast when most keys are never accessed.
 */

import * as vscode from 'vscode';
import * as crypto from 'crypto';
import * as fs from 'fs';
import * as path from 'path';

/**
 * Map a memento key to a unique, filesystem-safe filename.
 * Uses a SHA-256 hex prefix to guarantee distinct keys never collide, with
 * a sanitized human-readable suffix for debuggability.
 */
function keyToFilename(key: string): string {
  const hash = crypto.createHash('sha256').update(key).digest('hex').slice(0, 12);
  const safe = key.replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 60);
  return `${hash}_${safe}.json`;
}

/**
 * Drop-in replacement for vscode.Memento that persists values as JSON files
 * under a directory (typically context.storageUri). Reads are lazy — each key
 * is loaded from disk on first access. Writes update the in-memory cache
 * synchronously and flush to disk asynchronously.
 */
export class DiskBackedMemento implements vscode.Memento {
  private readonly _dir: string;
  // In-memory cache keyed by memento key — mirrors what is on disk.
  private readonly _cache = new Map<string, unknown>();
  // Keys we have attempted to load from disk — avoids repeated fs calls.
  private readonly _loadedKeys = new Set<string>();
  // Whether a full directory scan has run (for keys()).
  private _fullScanDone = false;

  constructor(storageDir: string) {
    this._dir = storageDir;
    // Ensure the storage directory exists (sync — runs once at activation).
    fs.mkdirSync(this._dir, { recursive: true });
    // No eager reads — files are loaded lazily on first get().
  }

  /**
   * Load all .json files from disk into the cache. Called lazily on first
   * keys() invocation so that activation pays no cost for this scan.
   * Corrupt files are silently skipped — the key returns its default.
   */
  private _fullScan(): void {
    if (this._fullScanDone) return;
    this._fullScanDone = true;
    let entries: string[];
    try {
      entries = fs.readdirSync(this._dir);
    } catch {
      // Directory unreadable — cache stays as-is.
      return;
    }
    for (const entry of entries) {
      if (!entry.endsWith('.json')) continue;
      try {
        const raw = fs.readFileSync(path.join(this._dir, entry), 'utf-8');
        const parsed = JSON.parse(raw);
        // The key is stored inside the JSON wrapper for reliability.
        if (parsed && typeof parsed === 'object' && 'key' in parsed) {
          const k = parsed.key as string;
          // Don't overwrite values already in cache (e.g. from seedCache).
          if (!this._cache.has(k)) {
            this._cache.set(k, parsed.value);
          }
          this._loadedKeys.add(k);
        }
      } catch {
        // Corrupt file — skip silently, consumer gets the default.
      }
    }
  }

  /**
   * Load a single key from disk if not already cached. Uses the deterministic
   * keyToFilename mapping so no directory scan is needed.
   */
  private _lazyLoad(key: string): void {
    if (this._loadedKeys.has(key)) return;
    this._loadedKeys.add(key);
    const filePath = path.join(this._dir, keyToFilename(key));
    try {
      const raw = fs.readFileSync(filePath, 'utf-8');
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === 'object' && 'key' in parsed) {
        // Don't overwrite values set via seedCache before disk flush.
        if (!this._cache.has(key)) {
          this._cache.set(key, parsed.value);
        }
      }
    } catch {
      // File missing or corrupt — key returns its default.
    }
  }

  /**
   * Returns all keys currently stored. Triggers a full directory scan on
   * first call so all disk-backed keys are discovered. Required by
   * vscode.Memento.
   */
  keys(): readonly string[] {
    this._fullScan();
    return [...this._cache.keys()];
  }

  /** Synchronous read — loads from disk on first access per key. */
  get<T>(key: string): T | undefined;
  get<T>(key: string, defaultValue: T): T;
  get<T>(key: string, defaultValue?: T): T | undefined {
    // Try cache first (covers seedCache and prior get/update).
    if (this._cache.has(key)) {
      return this._cache.get(key) as T;
    }
    // Lazy-load from disk on first access for this key.
    this._lazyLoad(key);
    if (this._cache.has(key)) {
      return this._cache.get(key) as T;
    }
    return defaultValue;
  }

  /**
   * Populate the in-memory cache without touching disk. Used by the migration
   * path to seed all keys synchronously before stores are constructed, so
   * consumers see the data immediately without waiting for async disk writes.
   */
  seedCache(key: string, value: unknown): void {
    this._cache.set(key, value);
    // Mark as loaded so lazy-load won't overwrite with stale disk data.
    this._loadedKeys.add(key);
  }

  /**
   * Write to in-memory cache and flush to disk async.
   * Setting undefined removes the key (mirrors workspaceState semantics).
   *
   * Assumption: values survive JSON round-trip (JSON.stringify → JSON.parse).
   * This matches vscode.Memento's own serialization guarantee. Values with
   * Date objects, undefined fields, or circular refs will lose fidelity.
   */
  async update(key: string, value: unknown): Promise<void> {
    // Mark as loaded so future get() won't re-read stale disk data.
    this._loadedKeys.add(key);
    if (value === undefined) {
      this._cache.delete(key);
      // Remove the file if it exists.
      const filePath = path.join(this._dir, keyToFilename(key));
      try {
        await fs.promises.unlink(filePath);
      } catch {
        // File already gone — fine.
      }
      return;
    }
    this._cache.set(key, value);
    const filePath = path.join(this._dir, keyToFilename(key));
    // Wrap with the key so _fullScan can reverse the filename mapping.
    const payload = JSON.stringify({ key, value });
    await fs.promises.writeFile(filePath, payload, 'utf-8');
  }
}
