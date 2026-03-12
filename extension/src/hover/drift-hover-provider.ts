import * as vscode from 'vscode';
import { DriftApiClient, TableMetadata } from '../api-client';
import type { AnnotationService } from '../annotations/annotation-service';
import { TableNameMapper } from '../codelens/table-name-mapper';

/** Maximum display width for a cell value in the hover table. */
const MAX_CELL_WIDTH = 20;

/** Default TTL for cached hover results (ms). */
const CACHE_TTL_MS = 10_000;

/**
 * TTL cache for built hover cards.
 *
 * Cleared on generation change and debug session lifecycle events
 * so that stale data never lingers.
 */
export class HoverCache {
  private _entries = new Map<
    string,
    { hover: vscode.Hover; expires: number }
  >();

  /** Return the cached hover if still valid, otherwise null. */
  get(key: string): vscode.Hover | null {
    const entry = this._entries.get(key);
    if (!entry) return null;
    if (Date.now() > entry.expires) {
      this._entries.delete(key);
      return null;
    }
    return entry.hover;
  }

  /** Store a hover card with a time-to-live. */
  set(key: string, hover: vscode.Hover, ttlMs: number): void {
    this._entries.set(key, { hover, expires: Date.now() + ttlMs });
  }

  /** Remove all cached entries. */
  clear(): void {
    this._entries.clear();
  }
}

function formatCell(value: unknown, maxLen: number): string {
  const s = value === null || value === undefined ? 'null' : String(value);
  const truncated =
    s.length > maxLen ? s.substring(0, maxLen - 1) + '\u2026' : s;
  // Escape pipes so they don't break the markdown table
  return truncated.replace(/\|/g, '\\|');
}

/**
 * Build a markdown hover card showing table metadata and recent rows.
 *
 * @param table       Schema metadata (name, columns, row count).
 * @param columns     Column names returned by the SQL query.
 * @param rows        Row data as arrays (positional, matching `columns`).
 * @param annotations Optional annotation text to append.
 */
export function buildHoverMarkdown(
  table: TableMetadata,
  columns: string[],
  rows: unknown[][],
  annotations?: string,
): vscode.Hover {
  const parts: string[] = [];

  // Header
  const rowLabel = table.rowCount === 1 ? 'row' : 'rows';
  parts.push(`**${table.name}** \u2014 ${table.rowCount} ${rowLabel}\n\n`);

  // Schema summary
  const schemaLine = table.columns
    .map((c) => `\`${c.name}\` ${c.type}${c.pk ? ' PK' : ''}`)
    .join(', ');
  parts.push(`Schema: ${schemaLine}\n\n`);

  // Recent rows as markdown table
  if (rows.length > 0 && columns.length > 0) {
    parts.push('Recent rows:\n\n');
    parts.push(`| ${columns.join(' | ')} |\n`);
    parts.push(`| ${columns.map(() => '---').join(' | ')} |\n`);
    for (const row of rows) {
      const cells = row.map((v) => formatCell(v, MAX_CELL_WIDTH));
      parts.push(`| ${cells.join(' | ')} |\n`);
    }
    parts.push('\n');
  }

  // Annotations (if any)
  if (annotations) {
    parts.push(annotations);
    parts.push('\n\n');
  }

  // Action links (trusted command URIs)
  const nameArg = encodeURIComponent(JSON.stringify(table.name));
  parts.push(
    `[View All](command:driftViewer.viewTableInPanel?${nameArg})` +
      ' | ' +
      `[Run Query](command:driftViewer.runTableQuery?${nameArg})`,
  );

  const md = new vscode.MarkdownString(parts.join(''));
  md.isTrusted = true;
  return new vscode.Hover(md);
}

/**
 * Shows a live database preview when hovering over Drift table class names.
 *
 * Only active during debug sessions to avoid unnecessary server calls.
 * Includes annotations when available.
 */
export class DriftHoverProvider implements vscode.HoverProvider {
  private _annotationService: AnnotationService | undefined;

  constructor(
    private readonly _client: DriftApiClient,
    private readonly _mapper: TableNameMapper,
    private readonly _cache: HoverCache,
  ) {}

  /** Set the annotation service for displaying notes in hovers. */
  setAnnotationService(service: AnnotationService): void {
    this._annotationService = service;
    service.onDidChange(() => this._cache.clear());
  }

  async provideHover(
    document: vscode.TextDocument,
    position: vscode.Position,
    _token: vscode.CancellationToken,
  ): Promise<vscode.Hover | null> {
    // Gate: only during debug sessions
    if (!vscode.debug.activeDebugSession) return null;

    // Gate: user can disable via settings
    const cfg = vscode.workspace.getConfiguration('driftViewer');
    if (!cfg.get<boolean>('hover.enabled', true)) return null;

    // Get word under cursor
    const wordRange = document.getWordRangeAtPosition(position);
    if (!wordRange) return null;
    const word = document.getText(wordRange);

    // Resolve Dart class name → SQL table name
    const sqlTable = this._mapper.resolve(word);
    if (!sqlTable) return null;

    // Cache hit
    const cached = this._cache.get(sqlTable);
    if (cached) return cached;

    // Fetch live data from server
    try {
      const rawMax = cfg.get<number>('hover.maxRows', 3) ?? 3;
      const maxRows = Math.max(1, Math.min(10, rawMax));
      // Escape double quotes in table name for safe SQL identifier quoting
      const escaped = sqlTable.replace(/"/g, '""');
      const [metadata, result] = await Promise.all([
        this._client.schemaMetadata(),
        this._client.sql(
          `SELECT * FROM "${escaped}" ORDER BY rowid DESC LIMIT ${maxRows}`,
        ),
      ]);

      const table = metadata.find((t) => t.name === sqlTable);
      if (!table) return null;

      // Get annotations for this table
      let annotationText: string | undefined;
      if (this._annotationService) {
        const summary = this._annotationService.getTableSummary(sqlTable);
        annotationText = this._annotationService.formatForHover(summary);
      }

      const hover = buildHoverMarkdown(table, result.columns, result.rows, annotationText);
      this._cache.set(sqlTable, hover, CACHE_TTL_MS);
      return hover;
    } catch {
      return null; // server unreachable — no hover
    }
  }
}
