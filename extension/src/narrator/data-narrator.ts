/**
 * DataNarrator: Build human-readable stories from database rows.
 *
 * Traverses FK relationships one level deep and generates
 * paragraph-style narratives describing the entity and its connections.
 */

import type { DriftApiClient, ForeignKey, TableMetadata } from '../api-client';
import type {
  IEntityGraph, IEntityNode, INarrativeResult, IRelatedData,
} from './narrator-types';

export class DataNarrator {
  private static readonly _MAX_RELATED_ROWS = 10;
  private static readonly _PREVIEW_COLUMNS = 4;

  constructor(private readonly _client: DriftApiClient) {}

  /**
   * Build the entity graph by fetching the root row and
   * traversing FK relationships in both directions.
   */
  async buildGraph(
    table: string,
    pkColumn: string,
    pkValue: unknown,
  ): Promise<IEntityGraph> {
    const rootResult = await this._client.sql(
      `SELECT * FROM "${table}" WHERE "${pkColumn}" = ${sqlLiteral(pkValue)} LIMIT 1`,
    );

    if (rootResult.rows.length === 0) {
      throw new Error(`Row not found: ${table}.${pkColumn} = ${pkValue}`);
    }

    const row = this._rowToObject(rootResult.columns, rootResult.rows[0]);
    const root: IEntityNode = {
      table,
      pkColumn,
      pkValue,
      row,
      columns: rootResult.columns,
    };

    const related = new Map<string, IRelatedData>();

    await this._fetchParents(root, related);
    await this._fetchChildren(root, related);

    return { root, relatedTables: related };
  }

  /**
   * Generate a human-readable narrative from the entity graph.
   */
  generateNarrative(graph: IEntityGraph): INarrativeResult {
    const parts: string[] = [];
    const mdParts: string[] = [];

    const rootDesc = this._describeRoot(graph.root);
    parts.push(rootDesc.text);
    mdParts.push(rootDesc.markdown);

    const parents = this._getRelatedByDirection(graph, 'parent');
    if (parents.length > 0) {
      const parentDesc = this._describeParents(parents);
      parts.push(parentDesc.text);
      mdParts.push(parentDesc.markdown);
    }

    const children = this._getRelatedByDirection(graph, 'child');
    for (const child of children) {
      const childDesc = this._describeChildren(child);
      parts.push(childDesc.text);
      mdParts.push(childDesc.markdown);
    }

    return {
      text: parts.join('\n\n'),
      markdown: mdParts.join('\n\n'),
      graph,
    };
  }

  private async _fetchParents(
    root: IEntityNode,
    related: Map<string, IRelatedData>,
  ): Promise<void> {
    const fks = await this._client.tableFkMeta(root.table);

    for (const fk of fks) {
      const fkValue = root.row[fk.fromColumn];
      if (fkValue === null || fkValue === undefined) continue;

      try {
        const result = await this._client.sql(
          `SELECT * FROM "${fk.toTable}" WHERE "${fk.toColumn}" = ${sqlLiteral(fkValue)} LIMIT 1`,
        );
        if (result.rows.length > 0) {
          related.set(`parent:${fk.toTable}:${fk.fromColumn}`, {
            table: fk.toTable,
            direction: 'parent',
            fkColumn: fk.fromColumn,
            rows: result.rows.map((r) => this._rowToObject(result.columns, r)),
            rowCount: result.rows.length,
            truncated: false,
          });
        }
      } catch {
        // Skip if query fails (table might not exist at runtime)
      }
    }
  }

  private async _fetchChildren(
    root: IEntityNode,
    related: Map<string, IRelatedData>,
  ): Promise<void> {
    const allMeta = await this._client.schemaMetadata();
    const candidateTables = allMeta.filter(
      (t) => t.name !== root.table && !t.name.startsWith('sqlite_'),
    );

    // Fetch FK metadata in parallel for better performance
    const fkResults = await Promise.all(
      candidateTables.map(async (t) => {
        try {
          const fks = await this._client.tableFkMeta(t.name);
          return { table: t, fks };
        } catch {
          return { table: t, fks: [] as ForeignKey[] };
        }
      }),
    );

    // Process results sequentially to avoid overwhelming the server
    for (const { table: otherTable, fks: otherFks } of fkResults) {
      for (const fk of otherFks) {
        if (fk.toTable !== root.table) continue;
        if (fk.toColumn !== root.pkColumn) continue;

        try {
          const countResult = await this._client.sql(
            `SELECT COUNT(*) as cnt FROM "${otherTable.name}" WHERE "${fk.fromColumn}" = ${sqlLiteral(root.pkValue)}`,
          );
          const count = Number((countResult.rows[0] as unknown[])[0]) || 0;
          if (count === 0) continue;

          const result = await this._client.sql(
            `SELECT * FROM "${otherTable.name}" WHERE "${fk.fromColumn}" = ${sqlLiteral(root.pkValue)} LIMIT ${DataNarrator._MAX_RELATED_ROWS}`,
          );

          related.set(`child:${otherTable.name}:${fk.fromColumn}`, {
            table: otherTable.name,
            direction: 'child',
            fkColumn: fk.fromColumn,
            rows: result.rows.map((r) => this._rowToObject(result.columns, r)),
            rowCount: count,
            truncated: count > DataNarrator._MAX_RELATED_ROWS,
          });
        } catch {
          // Skip if query fails
        }
      }
    }
  }

  private _getRelatedByDirection(
    graph: IEntityGraph,
    direction: 'parent' | 'child',
  ): IRelatedData[] {
    const result: IRelatedData[] = [];
    for (const [, data] of graph.relatedTables) {
      if (data.direction === direction) {
        result.push(data);
      }
    }
    return result;
  }

  private _describeRoot(root: IEntityNode): { text: string; markdown: string } {
    const nameCol = this._findNameColumn(root.columns);
    const name = nameCol ? String(root.row[nameCol]) : null;
    const entityName = singularize(capitalize(root.table));

    let header = `${entityName}`;
    if (name) {
      header += ` "${name}"`;
    }
    header += ` (${root.pkColumn}: ${formatValue(root.pkValue)})`;

    const notable = root.columns
      .filter((c) => !this._isIdColumn(c) && c !== nameCol && root.row[c] != null)
      .slice(0, DataNarrator._PREVIEW_COLUMNS);

    let details = '';
    if (notable.length > 0) {
      const detailParts = notable.map((c) => `${c} = ${formatValue(root.row[c])}`);
      details = ` — ${detailParts.join(', ')}`;
    }

    const text = `${header}${details}.`;
    const markdown = `**${header}**${details}.`;

    return { text, markdown };
  }

  private _describeParents(parents: IRelatedData[]): { text: string; markdown: string } {
    const parts: string[] = [];
    const mdParts: string[] = [];

    for (const parent of parents) {
      if (parent.rows.length === 0) continue;
      const row = parent.rows[0];
      const nameCol = this._findNameColumnFromRow(row);
      const name = nameCol ? String(row[nameCol]) : null;
      const entityName = singularize(capitalize(parent.table));

      let desc = `Belongs to ${entityName}`;
      if (name) {
        desc += ` "${name}"`;
      }
      const pk = this._findPkValue(row);
      if (pk !== undefined) {
        desc += ` (id: ${formatValue(pk)})`;
      }
      desc += ` via ${parent.fkColumn}.`;

      parts.push(desc);
      mdParts.push(desc.replace(`Belongs to ${entityName}`, `Belongs to **${entityName}**`));
    }

    return {
      text: parts.join(' '),
      markdown: mdParts.join(' '),
    };
  }

  private _describeChildren(child: IRelatedData): { text: string; markdown: string } {
    const count = child.rowCount;
    const noun = count === 1 ? singularize(child.table) : child.table;

    let header = `Has ${count} ${noun}`;
    if (child.truncated) {
      header += ` (showing first ${child.rows.length})`;
    }
    header += ':';

    const items = child.rows.map((row) => {
      const summary = this._summarizeRow(row);
      return `  • ${summary}`;
    });

    const text = `${header}\n${items.join('\n')}`;
    const markdown = `**${header}**\n${items.join('\n')}`;

    return { text, markdown };
  }

  private _summarizeRow(row: Record<string, unknown>): string {
    const pk = this._findPkValue(row);
    const nameCol = this._findNameColumnFromRow(row);
    const name = nameCol ? String(row[nameCol]) : null;

    let summary = '';
    if (name) {
      summary = `"${name}"`;
      if (pk !== undefined) {
        summary += ` (id: ${formatValue(pk)})`;
      }
    } else if (pk !== undefined) {
      summary = `id: ${formatValue(pk)}`;
    }

    const otherCols = Object.keys(row)
      .filter((k) => !this._isIdColumn(k) && k !== nameCol)
      .slice(0, 2);

    if (otherCols.length > 0) {
      const extras = otherCols.map((k) => `${k}=${formatValue(row[k])}`);
      summary += summary ? `, ${extras.join(', ')}` : extras.join(', ');
    }

    return summary || '(row)';
  }

  private _findNameColumn(columns: string[]): string | undefined {
    return findNameColumn(columns);
  }

  private _findNameColumnFromRow(row: Record<string, unknown>): string | undefined {
    return findNameColumn(Object.keys(row));
  }

  private _findPkValue(row: Record<string, unknown>): unknown {
    const pkCandidates = ['id', 'rowid', '_rowid_'];
    for (const pk of pkCandidates) {
      if (row[pk] !== undefined) return row[pk];
    }
    const keys = Object.keys(row);
    return keys.length > 0 ? row[keys[0]] : undefined;
  }

  private _isIdColumn(col: string): boolean {
    const lower = col.toLowerCase();
    return lower === 'id' || lower === 'rowid' || lower === '_rowid_' ||
           lower.endsWith('_id') || lower.endsWith('id');
  }

  private _rowToObject(
    columns: string[],
    row: unknown[],
  ): Record<string, unknown> {
    const obj: Record<string, unknown> = {};
    for (let i = 0; i < columns.length; i++) {
      obj[columns[i]] = row[i];
    }
    return obj;
  }
}

/** Common column names that typically contain human-readable identifiers. */
const NAME_COLUMN_CANDIDATES = ['name', 'title', 'label', 'description', 'email', 'username'];

/** Find a column that likely contains a human-readable name. */
function findNameColumn(columns: string[]): string | undefined {
  return columns.find((c) => NAME_COLUMN_CANDIDATES.includes(c.toLowerCase()));
}

/**
 * Singularize a table name using simple heuristics.
 * Not a full NLP stemmer, handles common patterns.
 */
export function singularize(word: string): string {
  if (word.endsWith('ies')) {
    return word.slice(0, -3) + 'y';
  }
  if (word.endsWith('es') && (word.endsWith('sses') || word.endsWith('shes') || word.endsWith('ches') || word.endsWith('xes'))) {
    return word.slice(0, -2);
  }
  if (word.endsWith('us') || word.endsWith('ss')) {
    return word;
  }
  if (word.endsWith('s') && word.length > 2) {
    return word.slice(0, -1);
  }
  return word;
}

/**
 * Capitalize the first letter of a string.
 */
export function capitalize(word: string): string {
  if (!word) return word;
  return word.charAt(0).toUpperCase() + word.slice(1);
}

/**
 * Format a value for display in the narrative.
 */
export function formatValue(value: unknown): string {
  if (value === null) return 'NULL';
  if (value === undefined) return '';
  if (typeof value === 'string') return `"${value}"`;
  if (typeof value === 'boolean') return value ? 'true' : 'false';
  if (typeof value === 'number') return String(value);
  if (value instanceof Date) return value.toISOString();
  return String(value);
}

/**
 * Convert a value to a SQL literal for use in queries.
 */
export function sqlLiteral(value: unknown): string {
  if (value === null || value === undefined) return 'NULL';
  if (typeof value === 'number') return String(value);
  if (typeof value === 'boolean') return value ? '1' : '0';
  return `'${String(value).replace(/'/g, "''")}'`;
}
