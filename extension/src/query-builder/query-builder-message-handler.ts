/**
 * Webview message router for the Visual Query Builder. Dispatches each command
 * to a model-op (mutate the shared [IQueryModel] then re-post state) or an
 * integration handler. Extracted from query-builder-panel.ts via a small
 * context so the panel class holds only lifecycle and the webview wiring.
 */
import type * as vscode from 'vscode';
import type { DriftApiClient } from '../api-client';
import type { QueryIntelligence } from '../engines/query-intelligence';
import { removeTableInstance, type IQueryJoin, type IQueryModel } from './query-model';
import {
  addFilter,
  addGroupBy,
  addJoin,
  addOrderBy,
  removeGroupBy,
  removeOrderBy,
  setAggregation,
  toggleColumn,
} from './query-builder-model-ops';
import {
  addToDashboard,
  analyzeCost,
  copySql,
  openInNotebook,
  runQuery,
  saveAsSnippet,
} from './query-builder-integrations';

/** Panel-provided context the message handler needs to mutate and respond. */
export interface IQbMessageContext {
  readonly model: IQueryModel;
  readonly client: DriftApiClient;
  readonly extensionContext: vscode.ExtensionContext;
  readonly queryIntelligence: QueryIntelligence | undefined;
  /** Add a base table (with auto FK-join) — kept on the panel for initial load. */
  addBaseTable(baseTable: string): Promise<void>;
  post(msg: unknown): void;
  postState(): void;
}

/** Route one webview command to a state mutation or integration. */
export async function handleQbMessage(
  ctx: IQbMessageContext,
  msg: Record<string, unknown>,
): Promise<void> {
  const { model } = ctx;
  switch (msg.command) {
    case 'addTableInstance':
      await ctx.addBaseTable(String(msg.baseTable || ''));
      break;
    case 'removeTable':
      removeTableInstance(model, String(msg.tableId || ''));
      ctx.postState();
      break;
    case 'toggleColumn':
      toggleColumn(model, String(msg.tableId || ''), String(msg.column || ''), Boolean(msg.selected));
      ctx.postState();
      break;
    case 'addJoin':
      addJoin(model, msg.join as Partial<IQueryJoin>);
      ctx.postState();
      break;
    case 'removeJoin':
      model.joins = model.joins.filter((j) => j.id !== String(msg.joinId || ''));
      ctx.postState();
      break;
    case 'addFilter':
      addFilter(model, msg.filter as Record<string, unknown>);
      ctx.postState();
      break;
    case 'removeFilter':
      model.filters = model.filters.filter((f) => f.id !== String(msg.id || ''));
      ctx.postState();
      break;
    case 'setLimit':
      model.limit = typeof msg.limit === 'number' && Number.isFinite(msg.limit) ? msg.limit : null;
      ctx.postState();
      break;
    case 'addGroupBy':
      addGroupBy(model, String(msg.tableId || ''), String(msg.column || ''));
      ctx.postState();
      break;
    case 'removeGroupBy':
      removeGroupBy(model, Number(msg.index));
      ctx.postState();
      break;
    case 'addOrderBy': {
      const dirRaw = String(msg.direction || 'ASC').toUpperCase();
      addOrderBy(
        model,
        String(msg.tableId || ''),
        String(msg.column || ''),
        dirRaw === 'DESC' ? 'DESC' : 'ASC',
      );
      ctx.postState();
      break;
    }
    case 'removeOrderBy':
      removeOrderBy(model, Number(msg.index));
      ctx.postState();
      break;
    case 'setAggregation':
      setAggregation(model, String(msg.tableId || ''), String(msg.column || ''), msg.aggregation);
      ctx.postState();
      break;
    case 'runQuery':
      await runQuery(
        ctx.client,
        model,
        ctx.queryIntelligence,
        String(msg.requestId || ''),
        (m) => ctx.post(m),
        () => ctx.postState(),
      );
      break;
    case 'copySql':
      await copySql(model, (m) => ctx.post(m));
      break;
    case 'openInNotebook':
      await openInNotebook(ctx.extensionContext, ctx.client, model, (m) => ctx.post(m));
      break;
    case 'saveAsSnippet':
      await saveAsSnippet(model, (m) => ctx.post(m));
      break;
    case 'analyzeCost':
      await analyzeCost(model, (m) => ctx.post(m));
      break;
    case 'addToDashboard':
      await addToDashboard(model, (m) => ctx.post(m));
      break;
    default:
      break;
  }
}
