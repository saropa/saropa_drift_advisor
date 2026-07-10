import * as vscode from 'vscode';
import { DriftApiClient } from '../api-client';
import { TableNameMapper } from '../codelens/table-name-mapper';

const TABLE_CLASS_RE = /^\s*class\s+(\w+)\s+extends\s+Table\b/gm;

/**
 * Format a row count as a file-decoration badge, GUARANTEED to be at most two
 * characters.
 *
 * VS Code rejects a `FileDecoration.badge` longer than two characters: it drops
 * the whole decoration AND logs an `INVALID decoration … 'badge'-property must
 * be undefined or a short character` warning. The previous implementation
 * rounded (`Math.round`) and emitted multi-digit + suffix strings ("100",
 * "10K", "999K", "10M"), so any table file in the 100-999 / 9 500+ row bands
 * silently lost its badge and flooded the extension-host log on every refresh
 * (one line per offending file, repeated per `refreshBadges()` trigger).
 *
 * Within two characters the exact count can't be shown for n >= 100, so the
 * badge signals MAGNITUDE only and the full per-table counts live in the
 * decoration tooltip. Rule: 0-99 exact; for >=100 a leading significant digit
 * plus a unit suffix when that digit is 1-9 of the unit (e.g. "3H", "5K",
 * "2M"), otherwise the bare unit letter ("K", "M", "B"). `Math.floor` (not
 * round) is used so values like 9 500 stay "9K" instead of overflowing to the
 * 3-char "10K".
 */
export function formatBadge(n: number): string {
  if (!Number.isFinite(n) || n <= 0) return '0';
  const v = Math.floor(n);

  // 0-99 fits in two characters exactly, so show the real count.
  if (v < 100) return String(v);

  // H = hundreds, K = thousands, M = millions, B = billions+. Ordered largest
  // first so the leading digit is the most-significant figure of the count.
  const tiers: Array<[number, string]> = [
    [1_000_000_000, 'B'],
    [1_000_000, 'M'],
    [1_000, 'K'],
    [100, 'H'],
  ];
  for (const [unit, suffix] of tiers) {
    if (v >= unit) {
      const lead = Math.floor(v / unit);
      // "1H".."9H" / "1K".."9K" etc. keep a digit; 10+ of a unit can't show two
      // digits AND the suffix in two chars, so fall back to the bare letter.
      return lead <= 9 ? `${lead}${suffix}` : suffix;
    }
  }

  // Unreachable: v >= 100 always matches the H tier. Kept total-safe regardless.
  return 'H';
}

/**
 * Scan workspace `.dart` files for `class X extends Table` declarations
 * and map each SQL table name to its source file path.
 */
export async function buildTableFileMap(
  mapper: TableNameMapper,
): Promise<Map<string, string>> {
  const result = new Map<string, string>();
  const uris = await vscode.workspace.findFiles('**/*.dart', '**/.*');

  for (const uri of uris) {
    const doc = await vscode.workspace.openTextDocument(uri);
    const text = doc.getText();
    TABLE_CLASS_RE.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = TABLE_CLASS_RE.exec(text)) !== null) {
      const sqlName = mapper.resolve(m[1]);
      if (sqlName) {
        result.set(sqlName, uri.fsPath);
      }
    }
  }

  return result;
}

interface FileAggregation {
  totalRows: number;
  lines: string[];
}

/**
 * Shows row-count badges on `.dart` files that define Drift tables.
 */
export class DriftFileDecorationProvider
  implements vscode.FileDecorationProvider
{
  private readonly _onDidChange =
    new vscode.EventEmitter<vscode.Uri | vscode.Uri[]>();
  readonly onDidChangeFileDecorations = this._onDidChange.event;

  private _decorations = new Map<string, vscode.FileDecoration>();

  provideFileDecoration(
    uri: vscode.Uri,
  ): vscode.FileDecoration | undefined {
    return this._decorations.get(uri.toString());
  }

  /**
   * Refresh badge decorations from live server data.
   *
   * @param client       API client for schema metadata
   * @param tableFileMap SQL table name to file path mapping
   */
  async refresh(
    client: DriftApiClient,
    tableFileMap: Map<string, string>,
  ): Promise<void> {
    const tables = await client.schemaMetadata();

    const perFile = new Map<string, FileAggregation>();
    for (const t of tables) {
      const path = tableFileMap.get(t.name);
      if (!path) continue;
      const entry = perFile.get(path) ?? { totalRows: 0, lines: [] };
      entry.totalRows += t.rowCount;
      entry.lines.push(`${t.name}: ${t.rowCount.toLocaleString()} rows`);
      perFile.set(path, entry);
    }

    const stale = new Set(this._decorations.keys());
    this._decorations.clear();
    const changed: vscode.Uri[] = [];

    for (const [path, data] of perFile) {
      const uri = vscode.Uri.file(path);
      const key = uri.toString();
      stale.delete(key);
      // Defense in depth: formatBadge is already 2-char-safe, but a future
      // regression there must never again leak an oversized badge into VS Code
      // (which would drop the decoration and flood the exthost log). Omit the
      // badge — not the decoration — so the tooltip with full counts survives.
      const badge = formatBadge(data.totalRows);
      const safeBadge = badge.length <= 2 ? badge : undefined;
      this._decorations.set(
        key,
        new vscode.FileDecoration(safeBadge, data.lines.join('\n')),
      );
      changed.push(uri);
    }

    for (const key of stale) {
      changed.push(vscode.Uri.parse(key));
    }

    if (changed.length > 0) {
      this._onDidChange.fire(changed);
    }
  }

  /**
   * Drop every badge immediately (global monitoring kill switch). Unlike
   * [refresh], this touches no server endpoint — the kill switch must clear
   * decorations even while the server is refusing data requests with 403.
   */
  clearAll(): void {
    if (this._decorations.size === 0) return;
    const cleared = Array.from(this._decorations.keys(), (k) =>
      vscode.Uri.parse(k),
    );
    this._decorations.clear();
    this._onDidChange.fire(cleared);
  }

  dispose(): void {
    this._onDidChange.dispose();
  }
}
