/**
 * FileSystemWatcher-backed cache for Drift source locator lookups.
 *
 * Without caching, every F12 or tree-node click re-walks the entire workspace
 * to locate a Dart table class or column getter. This cache stores lookup
 * results keyed by (function, arguments) and invalidates the entire cache when
 * any `.dart` file in the workspace is created, changed, or deleted.
 */

import * as vscode from 'vscode';
import {
  ColumnSearchResult,
  findDriftColumnGetterLocation,
  findDriftTableClassLocation,
} from './drift-source-locator';

/** Cache key combining the lookup type and its arguments. */
function tableKey(sqlTableName: string): string {
  return `table:${sqlTableName}`;
}
function columnKey(columnName: string, sqlTableName: string): string {
  return `column:${sqlTableName}:${columnName}`;
}

/**
 * Caches table-class and column-getter lookups, invalidated by a workspace
 * file watcher. Create one instance per extension activation and dispose it
 * on deactivation.
 */
export class DriftSourceLocatorCache implements vscode.Disposable {
  private _tableCache = new Map<
    string,
    { location: vscode.Location | null; filesSearched: number }
  >();
  private _columnCache = new Map<string, ColumnSearchResult>();
  private readonly _watcher: vscode.FileSystemWatcher;

  constructor() {
    // Watch all .dart files — any create/change/delete invalidates the cache
    // because a table class may have been added, moved, renamed, or removed.
    this._watcher = vscode.workspace.createFileSystemWatcher('**/*.dart');
    this._watcher.onDidCreate(() => this._invalidate());
    this._watcher.onDidChange(() => this._invalidate());
    this._watcher.onDidDelete(() => this._invalidate());
  }

  /** Clear all cached lookups. */
  private _invalidate(): void {
    this._tableCache.clear();
    this._columnCache.clear();
  }

  /**
   * Cached version of findDriftTableClassLocation. Returns the cached result
   * if available; otherwise runs the full workspace walk and caches the result.
   */
  async findTableClassLocation(
    sqlTableName: string,
  ): Promise<{ location: vscode.Location | null; filesSearched: number }> {
    const key = tableKey(sqlTableName);
    const cached = this._tableCache.get(key);
    if (cached) {
      return cached;
    }
    const result = await findDriftTableClassLocation(sqlTableName);
    this._tableCache.set(key, result);
    return result;
  }

  /**
   * Cached version of findDriftColumnGetterLocation. Returns the cached result
   * if available; otherwise runs the full workspace walk and caches the result.
   */
  async findColumnGetterLocation(
    columnName: string,
    sqlTableName: string,
  ): Promise<ColumnSearchResult> {
    const key = columnKey(columnName, sqlTableName);
    const cached = this._columnCache.get(key);
    if (cached) {
      return cached;
    }
    const result = await findDriftColumnGetterLocation(
      columnName,
      sqlTableName,
    );
    this._columnCache.set(key, result);
    return result;
  }

  /** Clear the cache manually (e.g. on schema refresh). */
  clearCache(): void {
    this._invalidate();
  }

  dispose(): void {
    this._watcher.dispose();
    this._invalidate();
  }
}
