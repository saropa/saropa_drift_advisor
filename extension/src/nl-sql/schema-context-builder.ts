/**
 * Builds compact schema context text for NL-to-SQL prompts.
 *
 * When {@link SchemaIntelligence} is supplied, uses its cached insights plus
 * per-table FK metadata so we align with dashboard/query-cost features and
 * avoid redundant full-schema fetches when insights are already warm.
 *
 * Table and character caps (`driftViewer.nlSql.maxSchemaTables`,
 * `driftViewer.nlSql.maxSchemaContextChars`) keep very large schemas from
 * blowing the LLM context window.
 */

import * as vscode from 'vscode';
import type { DriftApiClient } from '../api-client';
import type { ForeignKey, TableMetadata } from '../api-types';
import type { ITableInsight, SchemaIntelligence } from '../engines/schema-intelligence';

export class SchemaContextBuilder {
  private readonly _client: DriftApiClient;
  private readonly _schemaIntel: SchemaIntelligence | undefined;

  constructor(client: DriftApiClient, schemaIntel?: SchemaIntelligence) {
    this._client = client;
    this._schemaIntel = schemaIntel;
  }

  /** Fetches schema metadata and returns a compact, prompt-friendly string. */
  async build(): Promise<string> {
    if (this._schemaIntel) {
      return this._buildFromIntelligence();
    }
    return this._buildFromClientOnly();
  }

  private _readCaps(): { maxTables: number; maxChars: number } {
    const cfg = vscode.workspace.getConfiguration('driftViewer.nlSql');
    return {
      maxTables: cfg.get<number>('maxSchemaTables', 80) ?? 80,
      maxChars: cfg.get<number>('maxSchemaContextChars', 32_000) ?? 32_000,
    };
  }

  /** Truncates the final blob so prompts stay within configured token budget. */
  private _capTotal(text: string): string {
    const { maxChars } = this._readCaps();
    if (text.length <= maxChars) {
      return text;
    }
    return `${text.slice(0, maxChars)}\n\n... truncated total schema context to ${maxChars} chars (driftViewer.nlSql.maxSchemaContextChars).`;
  }

  private async _buildFromIntelligence(): Promise<string> {
    const intel = this._schemaIntel!;
    const insights = await intel.getInsights();
    if (insights.tables.length === 0) {
      return 'No tables found.';
    }

    const { maxTables } = this._readCaps();
    const allTables = insights.tables;
    const cappedTables =
      allTables.length > maxTables ? allTables.slice(0, maxTables) : allTables;

    const lines: string[] = [];
    for (const table of cappedTables) {
      const fks = await intel.getForeignKeys(table.name);
      lines.push(this._formatInsightTable(table, fks));
    }
    if (allTables.length > maxTables) {
      lines.push('');
      lines.push(
        `... and ${allTables.length - maxTables} more tables omitted (increase driftViewer.nlSql.maxSchemaTables).`,
      );
    }

    const hints: string[] = [];
    if (insights.tablesWithoutPk.length > 0) {
      const preview = insights.tablesWithoutPk.slice(0, 6).join(', ');
      hints.push(`Tables without explicit PK (sample): ${preview}`);
    }
    if (insights.missingIndexes.length > 0) {
      hints.push(
        `Missing-index suggestions available for ${insights.missingIndexes.length} column(s); prefer indexed columns in WHERE/JOIN when possible.`,
      );
    }
    if (hints.length > 0) {
      lines.push('');
      lines.push('Notes:');
      for (const h of hints) {
        lines.push(`- ${h}`);
      }
    }

    return this._capTotal(lines.join('\n'));
  }

  private _formatInsightTable(table: ITableInsight, fks: ForeignKey[]): string {
    const fkByColumn = new Map<string, ForeignKey>();
    for (const fk of fks) {
      fkByColumn.set(fk.fromColumn, fk);
    }

    const columns = table.columns.map((column) => {
      const parts: string[] = [column.column, column.type];
      if (column.isPrimaryKey) {
        parts.push('PK');
      }
      const fk = fkByColumn.get(column.column);
      if (fk) {
        parts.push(`FK->${fk.toTable}.${fk.toColumn}`);
      }
      return parts.join(' ');
    });

    return `${table.name}(${columns.join(', ')}) [${table.rowCount} rows]`;
  }

  private async _buildFromClientOnly(): Promise<string> {
    const tables = await this._client.schemaMetadata();
    if (tables.length === 0) {
      return 'No tables found.';
    }

    const { maxTables } = this._readCaps();
    const capped =
      tables.length > maxTables ? tables.slice(0, maxTables) : tables;

    const fkPerTable = await Promise.all(
      capped.map((table) => this._client.tableFkMeta(table.name)),
    );

    const lines = capped.map((table, index) =>
      this._formatTableLine(table, fkPerTable[index]),
    );
    if (tables.length > maxTables) {
      lines.push(
        `\n... and ${tables.length - maxTables} more tables omitted (increase driftViewer.nlSql.maxSchemaTables).`,
      );
    }

    return this._capTotal(lines.join('\n'));
  }

  private _formatTableLine(table: TableMetadata, fks: ForeignKey[]): string {
    const fkByColumn = new Map<string, ForeignKey>();
    for (const fk of fks) {
      fkByColumn.set(fk.fromColumn, fk);
    }

    const columns = table.columns.map((column) => {
      const parts: string[] = [column.name, column.type];
      if (column.pk) {
        parts.push('PK');
      }
      const fk = fkByColumn.get(column.name);
      if (fk) {
        parts.push(`FK->${fk.toTable}.${fk.toColumn}`);
      }
      return parts.join(' ');
    });

    return `${table.name}(${columns.join(', ')}) [${table.rowCount} rows]`;
  }
}
