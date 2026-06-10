/**
 * Branch manager (Feature 37, Phase 1): capture, list, persist, and delete data branches.
 *
 * A branch is a full snapshot of every user table's rows, stored in workspace state so it
 * survives reloads. Captures honor two caps from configuration: `maxBranches` (oldest pruned
 * first) and `maxRowsPerTable` (a table over the cap is captured up to the cap and flagged
 * `truncated`, so a partial branch is never silently mistaken for a complete one).
 *
 * Diffing and restore live in sibling modules; the manager only owns the branch lifecycle and
 * the live-state capture used both for new branches and for "diff vs current".
 */

import * as vscode from 'vscode';
import type { DriftApiClient } from '../api-client';
import type { IBranchTable, IDataBranch } from './branch-types';

const STATE_KEY = 'driftViewer.branches';

/** Capture a single table's current rows (up to {@link rowLimit}). */
async function captureTable(
  client: DriftApiClient,
  table: { name: string; columns: { name: string; pk: boolean }[] },
  rowLimit: number,
): Promise<{ branchTable: IBranchTable; truncated: boolean }> {
  const pkColumns = table.columns.filter((c) => c.pk).map((c) => c.name);
  // ORDER BY rowid keeps capture deterministic; cap + 1 lets us detect truncation.
  const result = await client.sql(
    `SELECT * FROM "${table.name}" ORDER BY rowid LIMIT ${rowLimit + 1}`,
    { internal: true },
  );
  const allRows = result.rows.map((row) => {
    const obj: Record<string, unknown> = {};
    for (let i = 0; i < result.columns.length; i++) obj[result.columns[i]] = row[i];
    return obj;
  });
  const truncated = allRows.length > rowLimit;
  const rows = truncated ? allRows.slice(0, rowLimit) : allRows;
  return {
    branchTable: {
      name: table.name,
      columns: table.columns as IBranchTable['columns'],
      rows,
      pkColumns,
    },
    truncated,
  };
}

export class BranchManager {
  private _branches: IDataBranch[];

  private readonly _onDidChange = new vscode.EventEmitter<void>();
  readonly onDidChange = this._onDidChange.event;

  constructor(
    private readonly _client: DriftApiClient,
    private readonly _state: vscode.Memento,
  ) {
    this._branches = _state.get<IDataBranch[]>(STATE_KEY, []);
  }

  get branches(): readonly IDataBranch[] {
    return this._branches;
  }

  getBranch(id: string): IDataBranch | undefined {
    return this._branches.find((b) => b.id === id);
  }

  private get _maxBranches(): number {
    return vscode.workspace.getConfiguration('driftViewer').get<number>('branching.maxBranches', 10);
  }

  private get _maxRowsPerTable(): number {
    return vscode.workspace
      .getConfiguration('driftViewer')
      .get<number>('branching.maxRowsPerTable', 10_000);
  }

  /** Capture every non-internal table's current rows into the live-state branch tables. */
  async captureLiveTables(): Promise<{ tables: IBranchTable[]; truncated: boolean }> {
    const meta = await this._client.schemaMetadata();
    const rowLimit = this._maxRowsPerTable;
    const tables: IBranchTable[] = [];
    let truncated = false;
    for (const table of meta) {
      if (table.name.startsWith('sqlite_')) continue;
      try {
        const captured = await captureTable(this._client, table, rowLimit);
        tables.push(captured.branchTable);
        truncated = truncated || captured.truncated;
      } catch {
        // A table may have been dropped between metadata and the SELECT; skip and continue
        // rather than aborting the whole capture.
      }
    }
    return { tables, truncated };
  }

  /** Create and persist a new branch from the current live database state. */
  async createBranch(name: string, description?: string): Promise<IDataBranch> {
    const { tables, truncated } = await this.captureLiveTables();
    const branch: IDataBranch = {
      id: `${name}-${tables.reduce((s, t) => s + t.rows.length, 0)}-${this._branches.length}`,
      name,
      createdAt: new Date().toISOString(),
      description,
      tables,
      metadata: {
        tableCount: tables.length,
        totalRows: tables.reduce((s, t) => s + t.rows.length, 0),
        truncated,
      },
    };
    this._branches.push(branch);
    this._prune();
    await this._persist();
    this._onDidChange.fire();
    return branch;
  }

  /** Delete a branch by id. No-op if the id is unknown. */
  async deleteBranch(id: string): Promise<void> {
    const before = this._branches.length;
    this._branches = this._branches.filter((b) => b.id !== id);
    if (this._branches.length !== before) {
      await this._persist();
      this._onDidChange.fire();
    }
  }

  /** Drop the oldest branches once the configured cap is exceeded (FIFO). */
  private _prune(): void {
    const cap = this._maxBranches;
    if (this._branches.length > cap) {
      this._branches.splice(0, this._branches.length - cap);
    }
  }

  private async _persist(): Promise<void> {
    await this._state.update(STATE_KEY, this._branches);
  }

  dispose(): void {
    this._onDidChange.dispose();
  }
}
