import type * as vscode from 'vscode';
import type { ISavedFilter } from './filter-types';

const STORAGE_KEY = 'driftViewer.savedFilters';

/** Generate a compact unique ID. */
function makeId(): string {
  return (
    Date.now().toString(36) + Math.random().toString(36).slice(2, 6)
  );
}

/** CRUD store for saved filters, persisted in workspace state. */
export class FilterStore {
  private _filters: ISavedFilter[] = [];
  private _listeners: Array<() => void> = [];

  constructor(private readonly _state: vscode.Memento) {
    this._filters = _state.get<ISavedFilter[]>(STORAGE_KEY, []);
  }

  /** Subscribe to changes. Returns a disposable. */
  onDidChange(listener: () => void): { dispose: () => void } {
    this._listeners.push(listener);
    return {
      dispose: () => {
        this._listeners = this._listeners.filter((l) => l !== listener);
      },
    };
  }

  get filters(): readonly ISavedFilter[] {
    return this._filters;
  }

  /** All filters for a given table name. */
  forTable(table: string): ISavedFilter[] {
    return this._filters.filter((f) => f.table === table);
  }

  /** Find a filter by ID. */
  getById(id: string): ISavedFilter | undefined {
    return this._filters.find((f) => f.id === id);
  }

  /** Add or update a filter. Returns the filter ID. */
  save(filter: ISavedFilter): string {
    const now = Date.now();
    const idx = this._filters.findIndex((f) => f.id === filter.id);
    let id: string;
    if (idx >= 0) {
      this._filters[idx] = { ...filter, updatedAt: now };
      id = filter.id;
    } else {
      id = makeId();
      this._filters.push({ ...filter, id, createdAt: now, updatedAt: now });
    }
    this._persist();
    return id;
  }

  /** Remove by ID. Returns false if not found. */
  remove(id: string): boolean {
    const before = this._filters.length;
    this._filters = this._filters.filter((f) => f.id !== id);
    if (this._filters.length === before) return false;
    this._persist();
    return true;
  }

  private _persist(): void {
    void this._state.update(STORAGE_KEY, this._filters);
    for (const listener of this._listeners) {
      listener();
    }
  }
}
