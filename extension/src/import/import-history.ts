/**
 * Import history tracking for undo support.
 * Stores import records with enough detail to reverse them.
 */

import type * as vscode from 'vscode';
import type {
  ClipboardFormat,
  IClipboardImportResult,
  IImportHistoryEntry,
  ImportStrategy,
  IUpdatedRow,
} from './clipboard-import-types';

export class ImportHistory {
  private _entries: Map<string, IImportHistoryEntry> = new Map();

  constructor(private readonly _storage: vscode.Memento) {
    this._load();
  }

  /**
   * Record a completed import for potential undo.
   */
  recordImport(
    table: string,
    result: IClipboardImportResult,
    strategy: ImportStrategy,
    format: ClipboardFormat,
  ): string {
    const id = this._generateId();

    const entry: IImportHistoryEntry = {
      id,
      table,
      timestamp: new Date(),
      strategy,
      source: 'clipboard',
      format,
      rowCount: result.imported,
      insertedIds: result.insertedIds,
      updatedRows: result.updatedRows,
      canUndo: result.insertedIds.length > 0 || result.updatedRows.length > 0,
    };

    this._entries.set(id, entry);
    this._prune();
    this._save();

    return id;
  }

  /**
   * Get an import history entry by ID.
   */
  getEntry(id: string): IImportHistoryEntry | undefined {
    const entry = this._entries.get(id);
    if (entry) {
      entry.timestamp = new Date(entry.timestamp);
    }
    return entry;
  }

  /**
   * Get recent import history entries for a table.
   */
  getRecentForTable(table: string, limit = 10): IImportHistoryEntry[] {
    const entries = [...this._entries.values()]
      .filter((e) => e.table === table)
      .map((e) => ({ ...e, timestamp: new Date(e.timestamp) }))
      .sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime())
      .slice(0, limit);

    return entries;
  }

  /**
   * Get all recent import history entries.
   */
  getRecent(limit = 20): IImportHistoryEntry[] {
    return [...this._entries.values()]
      .map((e) => ({ ...e, timestamp: new Date(e.timestamp) }))
      .sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime())
      .slice(0, limit);
  }

  /**
   * Mark an import as no longer undoable.
   */
  markNotUndoable(id: string): void {
    const entry = this._entries.get(id);
    if (entry) {
      entry.canUndo = false;
      this._save();
    }
  }

  /**
   * Mark imports as not undoable when their rows have been modified.
   */
  markAffectedImports(table: string, affectedIds: (string | number)[]): void {
    const affectedSet = new Set(affectedIds.map(String));
    let changed = false;

    for (const entry of this._entries.values()) {
      if (entry.table !== table || !entry.canUndo) {
        continue;
      }

      const hasAffectedInsert = entry.insertedIds.some((id) =>
        affectedSet.has(String(id)),
      );
      const hasAffectedUpdate = entry.updatedRows.some((u) =>
        affectedSet.has(String(u.id)),
      );

      if (hasAffectedInsert || hasAffectedUpdate) {
        entry.canUndo = false;
        changed = true;
      }
    }

    if (changed) {
      this._save();
    }
  }

  /**
   * Remove an entry after successful undo.
   */
  removeEntry(id: string): void {
    this._entries.delete(id);
    this._save();
  }

  /**
   * Clear all history.
   */
  clear(): void {
    this._entries.clear();
    this._save();
  }

  private _generateId(): string {
    return `imp_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
  }

  private _prune(): void {
    const maxEntries = 100;
    if (this._entries.size <= maxEntries) {
      return;
    }

    const sorted = [...this._entries.entries()]
      .sort((a, b) => {
        const aTime = new Date(a[1].timestamp).getTime();
        const bTime = new Date(b[1].timestamp).getTime();
        return bTime - aTime;
      });

    const toKeep = sorted.slice(0, maxEntries);
    this._entries = new Map(toKeep);
  }

  private _load(): void {
    const data = this._storage.get<Record<string, IImportHistoryEntry>>(
      'clipboardImportHistory',
      {},
    );
    this._entries = new Map(Object.entries(data));
  }

  private _save(): void {
    const data: Record<string, IImportHistoryEntry> = {};
    for (const [id, entry] of this._entries) {
      data[id] = {
        ...entry,
        timestamp: entry.timestamp instanceof Date
          ? entry.timestamp
          : new Date(entry.timestamp),
      };
    }
    this._storage.update('clipboardImportHistory', data);
  }
}

/**
 * Format an import history entry for display.
 */
export function formatHistoryEntry(entry: IImportHistoryEntry): string {
  const date = entry.timestamp instanceof Date
    ? entry.timestamp
    : new Date(entry.timestamp);

  const time = date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  const action = entry.strategy === 'upsert' ? 'upserted' : 'imported';
  const undoStatus = entry.canUndo ? '(can undo)' : '(cannot undo)';

  return `${time}: ${action} ${entry.rowCount} rows into ${entry.table} ${undoStatus}`;
}
