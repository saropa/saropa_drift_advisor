import * as vscode from 'vscode';
import { DriftApiClient, TableMetadata } from '../api-client';
import {
  classifyIdentifier,
  extractEnclosingString,
  getWordAt,
  isInsideSqlString,
} from './sql-string-detector';
import {
  findDriftColumnGetterLocation,
  findDriftTableClassLocation,
} from './drift-source-locator';

/**
 * VS Code DefinitionProvider that resolves SQL table/column names
 * inside Dart string literals to their Drift table class definitions.
 *
 * Works for both Go to Definition (F12) and Peek Definition (Alt+F12).
 */
export class DriftDefinitionProvider implements vscode.DefinitionProvider {
  private _schemaCache: TableMetadata[] | null = null;
  private _schemaCacheTime = 0;
  private static readonly CACHE_TTL_MS = 30_000;

  constructor(private readonly _client: DriftApiClient) {}

  /** Clear cached schema metadata (e.g. on generation change). */
  clearCache(): void {
    this._schemaCache = null;
    this._schemaCacheTime = 0;
  }

  async provideDefinition(
    document: vscode.TextDocument,
    position: vscode.Position,
    _token: vscode.CancellationToken,
  ): Promise<vscode.Location | null> {
    if (document.languageId !== 'dart') return null;

    const lineText = document.lineAt(position.line).text;
    if (!isInsideSqlString(lineText, position.character)) return null;

    const wordInfo = getWordAt(lineText, position.character);
    if (!wordInfo) return null;

    const tables = await this._getSchema();
    if (!tables || tables.length === 0) return null;

    const knownTableNames = tables.map((t) => t.name);
    const knownColumns = new Map(
      tables.map((t) => [t.name, t.columns.map((c) => c.name)] as const),
    );

    const sqlContext =
      extractEnclosingString(lineText, position.character) ?? lineText;

    const classification = classifyIdentifier(
      wordInfo.word,
      sqlContext,
      knownTableNames,
      knownColumns,
    );
    if (!classification) return null;

    if (classification.type === 'table') {
      return findDriftTableClassLocation(wordInfo.word);
    }

    if (classification.type === 'column' && classification.tableName) {
      return findDriftColumnGetterLocation(
        wordInfo.word,
        classification.tableName,
      );
    }

    return null;
  }

  private async _getSchema(): Promise<TableMetadata[] | null> {
    const now = Date.now();
    if (
      this._schemaCache &&
      now - this._schemaCacheTime < DriftDefinitionProvider.CACHE_TTL_MS
    ) {
      return this._schemaCache;
    }
    try {
      this._schemaCache = await this._client.schemaMetadata();
      this._schemaCacheTime = now;
      return this._schemaCache;
    } catch {
      return this._schemaCache; // return stale cache on error
    }
  }
}
