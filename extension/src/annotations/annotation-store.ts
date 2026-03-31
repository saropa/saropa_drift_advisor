import * as vscode from 'vscode';
import type {
  AnnotationIcon,
  IAnnotation,
  IAnnotationExport,
  IAnnotationTarget,
} from './annotation-types';

const STORAGE_KEY = 'driftViewer.annotations';

/** Generate a compact unique ID. */
function makeId(): string {
  return (
    Date.now().toString(36) + Math.random().toString(36).slice(2, 6)
  );
}

/** CRUD store for annotations, persisted in workspace state. */
export class AnnotationStore {
  private _annotations: IAnnotation[] = [];
  private _listeners: Array<() => void> = [];

  constructor(private readonly _state: vscode.Memento) {
    this._annotations = _state.get<IAnnotation[]>(STORAGE_KEY, []);
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

  get annotations(): readonly IAnnotation[] {
    return this._annotations;
  }

  /** Add a new annotation. Returns the generated ID. */
  add(
    target: IAnnotationTarget,
    note: string,
    icon: AnnotationIcon,
  ): string {
    const now = Date.now();
    const id = makeId();
    this._annotations.push({
      id,
      target,
      icon,
      note,
      createdAt: now,
      updatedAt: now,
    });
    this._persist();
    return id;
  }

  /** Update note text and optionally the icon. Returns false if not found. */
  update(id: string, note: string, icon?: AnnotationIcon): boolean {
    const ann = this._annotations.find((a) => a.id === id);
    if (!ann) return false;
    ann.note = note;
    if (icon) ann.icon = icon;
    ann.updatedAt = Date.now();
    this._persist();
    return true;
  }

  /** Remove by ID. Returns false if not found. */
  remove(id: string): boolean {
    const before = this._annotations.length;
    this._annotations = this._annotations.filter((a) => a.id !== id);
    if (this._annotations.length === before) return false;
    this._persist();
    return true;
  }

  /** Remove all annotations. Returns the number removed. */
  clearAll(): number {
    const count = this._annotations.length;
    if (count === 0) return 0;
    this._annotations = [];
    this._persist();
    return count;
  }

  /** Remove all table-level annotations for a given table. Returns count removed. */
  removeForTable(tableName: string): number {
    const before = this._annotations.length;
    this._annotations = this._annotations.filter(
      (a) => !(a.target.kind === 'table' && a.target.table === tableName),
    );
    const removed = before - this._annotations.length;
    if (removed > 0) this._persist();
    return removed;
  }

  /**
   * Remove ALL annotations (table, column, and row) for a given table in a
   * single pass. Returns count removed. Avoids N+1 persist/refresh cascade
   * that would occur if removing each annotation individually.
   */
  removeAllForTable(tableName: string): number {
    const before = this._annotations.length;
    this._annotations = this._annotations.filter(
      (a) => a.target.table !== tableName,
    );
    const removed = before - this._annotations.length;
    if (removed > 0) this._persist();
    return removed;
  }

  /** Remove all column-level annotations for a given column. Returns count removed. */
  removeForColumn(tableName: string, columnName: string): number {
    const before = this._annotations.length;
    this._annotations = this._annotations.filter(
      (a) =>
        !(
          a.target.kind === 'column' &&
          a.target.table === tableName &&
          a.target.column === columnName
        ),
    );
    const removed = before - this._annotations.length;
    if (removed > 0) this._persist();
    return removed;
  }

  /** All annotations targeting the given table (any kind). */
  forTable(tableName: string): IAnnotation[] {
    return this._annotations.filter(
      (a) => a.target.table === tableName,
    );
  }

  /** Annotations targeting a specific column. */
  forColumn(tableName: string, columnName: string): IAnnotation[] {
    return this._annotations.filter(
      (a) =>
        a.target.kind === 'column' &&
        a.target.table === tableName &&
        a.target.column === columnName,
    );
  }

  /** Annotations targeting a specific row by PK. */
  forRow(tableName: string, rowPk: string): IAnnotation[] {
    return this._annotations.filter(
      (a) =>
        a.target.kind === 'row' &&
        a.target.table === tableName &&
        a.target.rowPk === rowPk,
    );
  }

  /** Quick check for tree badge decoration. */
  hasAnnotations(tableName: string, columnName?: string): boolean {
    return this._annotations.some((a) => {
      if (a.target.table !== tableName) return false;
      if (columnName) {
        return (
          a.target.kind === 'column' && a.target.column === columnName
        );
      }
      return true;
    });
  }

  /** Count annotations for a given table (all kinds). */
  countForTable(tableName: string): number {
    return this._annotations.filter(
      (a) => a.target.table === tableName,
    ).length;
  }

  /** Export all annotations as a portable JSON object. */
  exportJson(): IAnnotationExport {
    return {
      version: 1,
      exportedAt: new Date().toISOString(),
      annotations: [...this._annotations],
    };
  }

  /**
   * Import annotations, skipping duplicates (same target + note).
   * Returns the number of newly added annotations.
   */
  importJson(data: IAnnotationExport): number {
    if (!Array.isArray(data?.annotations)) return 0;
    let added = 0;
    for (const ann of data.annotations) {
      const isDuplicate = this._annotations.some(
        (existing) =>
          existing.target.kind === ann.target.kind &&
          existing.target.table === ann.target.table &&
          existing.target.column === ann.target.column &&
          existing.target.rowPk === ann.target.rowPk &&
          existing.note === ann.note,
      );
      if (!isDuplicate) {
        this._annotations.push({ ...ann, id: makeId() });
        added++;
      }
    }
    if (added > 0) this._persist();
    return added;
  }

  private _persist(): void {
    this._state.update(STORAGE_KEY, this._annotations);
    for (const listener of this._listeners) {
      listener();
    }
  }
}
