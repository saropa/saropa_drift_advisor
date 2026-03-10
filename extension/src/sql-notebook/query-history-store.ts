import * as vscode from 'vscode';
import { IQueryHistoryEntry } from './sql-notebook-panel';

const HISTORY_KEY = 'driftViewer.sqlNotebookHistory';
const DEFAULT_MAX = 200;

/**
 * Wraps globalState persistence for SQL Notebook query history
 * with search, add, delete, and clear operations.
 */
export class QueryHistoryStore {
  private readonly _state: vscode.Memento;

  constructor(state: vscode.Memento) {
    this._state = state;
  }

  /** Return all history entries, newest first. */
  getAll(): IQueryHistoryEntry[] {
    return this._state.get<IQueryHistoryEntry[]>(HISTORY_KEY, []);
  }

  /**
   * Case-insensitive substring search across SQL text and error
   * messages. Returns all entries when query is empty.
   */
  search(query: string): IQueryHistoryEntry[] {
    if (!query) {
      return this.getAll();
    }
    const lower = query.toLowerCase();
    return this.getAll().filter(
      (e) =>
        e.sql.toLowerCase().includes(lower) ||
        (e.error?.toLowerCase().includes(lower) ?? false),
    );
  }

  /** Prepend a new entry and trim to the configured maximum. */
  async add(entry: IQueryHistoryEntry): Promise<void> {
    const entries = [entry, ...this.getAll()].slice(0, this._maxEntries());
    await this._state.update(HISTORY_KEY, entries);
  }

  /** Remove all entries matching the given timestamp. */
  async delete(timestamp: number): Promise<void> {
    const entries = this.getAll().filter((e) => e.timestamp !== timestamp);
    await this._state.update(HISTORY_KEY, entries);
  }

  /** Remove all history entries. */
  async clear(): Promise<void> {
    await this._state.update(HISTORY_KEY, []);
  }

  private _maxEntries(): number {
    return (
      vscode.workspace
        .getConfiguration('driftViewer')
        .get<number>('sqlNotebook.maxHistory', DEFAULT_MAX) ?? DEFAULT_MAX
    );
  }
}
