import * as vscode from 'vscode';

/** Storage key for NL-to-SQL history in workspace state. */
const HISTORY_KEY = 'driftViewer.nlSqlHistory';
const MAX_ENTRIES = 50;

/** Persisted NL-to-SQL history entry. */
export interface INlSqlEntry {
  question: string;
  sql: string;
  timestamp: number;
}

/**
 * Stores NL-to-SQL prompts and generated SQL for quick reuse.
 * Entries are de-duplicated on exact question+sql matches.
 */
export class NlSqlHistory {
  private _entries: INlSqlEntry[];
  private readonly _state: vscode.Memento;

  constructor(state: vscode.Memento) {
    this._state = state;
    this._entries = state.get<INlSqlEntry[]>(HISTORY_KEY, []);
  }

  /** Adds a new history entry, deduplicating exact duplicates. */
  add(question: string, sql: string): void {
    this._entries = this._entries.filter(
      (entry) => !(entry.question === question && entry.sql === sql),
    );
    this._entries.unshift({ question, sql, timestamp: Date.now() });
    if (this._entries.length > MAX_ENTRIES) {
      this._entries.length = MAX_ENTRIES;
    }
    void this._state.update(HISTORY_KEY, this._entries);
  }

  /** Returns history entries in newest-first order. */
  get entries(): readonly INlSqlEntry[] {
    return this._entries;
  }
}
