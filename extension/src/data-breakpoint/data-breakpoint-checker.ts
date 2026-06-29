import { DriftApiClient } from '../api-client';
import type { IBreakpointHit, IDataBreakpoint } from './data-breakpoint-types';
import { blobSafeSelectList } from '../sql/blob-safe-select';

/**
 * Evaluates data breakpoints against the live database.
 *
 * Each call to {@link evaluate} runs the appropriate SQL query and
 * compares against the breakpoint's last-known state.
 */
export class DataBreakpointChecker {
  constructor(private readonly _client: DriftApiClient) {}

  /** Returns a hit descriptor if the breakpoint fired, or `null`. */
  async evaluate(bp: IDataBreakpoint): Promise<IBreakpointHit | null> {
    switch (bp.type) {
      case 'conditionMet':
        return this._evalCondition(bp);
      case 'rowInserted':
        return this._evalRowInserted(bp);
      case 'rowDeleted':
        return this._evalRowDeleted(bp);
      case 'rowChanged':
        return this._evalRowChanged(bp);
    }
  }

  // --- Evaluation strategies ------------------------------------------------

  private async _evalCondition(
    bp: IDataBreakpoint,
  ): Promise<IBreakpointHit | null> {
    const result = await this._client.sql(bp.condition!);
    const count = this._extractCount(result);
    if (count > 0) {
      return { breakpoint: bp, matchCount: count, rows: result.rows };
    }
    return null;
  }

  private async _evalRowInserted(
    bp: IDataBreakpoint,
  ): Promise<IBreakpointHit | null> {
    const count = await this._tableRowCount(bp.table);
    if (bp.lastRowCount !== undefined && count > bp.lastRowCount) {
      const delta = count - bp.lastRowCount;
      bp.lastRowCount = count;
      return {
        breakpoint: bp,
        matchCount: delta,
        message: `${delta} row(s) inserted`,
      };
    }
    bp.lastRowCount = count;
    return null;
  }

  private async _evalRowDeleted(
    bp: IDataBreakpoint,
  ): Promise<IBreakpointHit | null> {
    const count = await this._tableRowCount(bp.table);
    if (bp.lastRowCount !== undefined && count < bp.lastRowCount) {
      const delta = bp.lastRowCount - count;
      bp.lastRowCount = count;
      return {
        breakpoint: bp,
        matchCount: delta,
        message: `${delta} row(s) deleted`,
      };
    }
    bp.lastRowCount = count;
    return null;
  }

  private async _evalRowChanged(
    bp: IDataBreakpoint,
  ): Promise<IBreakpointHit | null> {
    // Project BLOB columns as length() rather than SELECT *: pulling raw blob
    // bytes for up to 1000 rows makes the same-isolate host materialize every
    // blob payload (a JSON int-array) into one response and OOM-crash the
    // connected app. The hash only needs to notice a change, and a length delta
    // captures it without moving the bytes. BUG_TIMELINE_CAPTURE_SELECT_STAR_BLOB_OOM.md.
    //
    // The projection needs column types, so resolve them from schema metadata.
    // If that lookup is unavailable (transport error, table absent), fall back to
    // SELECT * rather than failing the evaluation — same behavior as before this
    // guard for any non-BLOB table.
    const selectList = await this._blobSafeSelectList(bp.table);
    const result = await this._client.sql(
      `SELECT ${selectList} FROM "${bp.table}" LIMIT 1000`,
    );
    const hash = this._hashRows(result.rows);
    if (bp.lastRowHash !== undefined && hash !== bp.lastRowHash) {
      bp.lastRowHash = hash;
      return {
        breakpoint: bp,
        matchCount: 0,
        message: 'Data changed',
      };
    }
    bp.lastRowHash = hash;
    return null;
  }

  // --- Helpers --------------------------------------------------------------

  /**
   * Build a BLOB-safe SELECT list for [table] from live schema metadata, or `*`
   * when the metadata cannot be resolved. The fallback keeps the evaluator
   * working (a non-BLOB table reads identically to a plain `SELECT *`); only the
   * blob-OOM protection is lost on the rare metadata-fetch failure.
   */
  private async _blobSafeSelectList(table: string): Promise<string> {
    try {
      const meta = await this._client.schemaMetadata();
      if (!Array.isArray(meta)) return '*';
      const tableMeta = meta.find((t) => t.name === table);
      return tableMeta ? blobSafeSelectList(tableMeta.columns) : '*';
    } catch {
      return '*';
    }
  }

  private async _tableRowCount(table: string): Promise<number> {
    const result = await this._client.sql(
      `SELECT COUNT(*) as cnt FROM "${table}"`,
    );
    return (result.rows[0] as unknown[])[0] as number;
  }

  private _hashRows(rows: unknown[][]): string {
    return JSON.stringify(rows);
  }

  private _extractCount(
    result: { rows: unknown[][] },
  ): number {
    if (result.rows.length === 0) return 0;
    const val = (result.rows[0] as unknown[])[0];
    return typeof val === 'number' ? val : result.rows.length;
  }
}
