/**
 * Webview message routing for the dashboard panel.
 * Dispatches incoming messages to widget CRUD, refresh, and config handlers.
 */

import * as vscode from 'vscode';
import type {
  IDashboardLayout,
  WebviewToExtensionMessage,
  WidgetType,
} from '../dashboard-types';
import type { IWidgetCrudContext } from './widget-crud';
import * as widgetCrud from './widget-crud';

/** Context provided by the panel for message handling (CRUD + refresh + config). */
export interface IDashboardMessageContext extends IWidgetCrudContext {
  state: IWidgetCrudContext['state'] & {
    load: (name: string) => IDashboardLayout | undefined;
  };
  getDefaultWidgetConfig: (type: WidgetType) => Record<string, unknown>;
  getTableNames: () => Promise<string[]>;
  refreshWidget: (id: string) => Promise<void>;
  refreshAllWidgets: () => Promise<void>;
  updateLayout: (layout: IDashboardLayout) => void;
  sendConfigSchema: (
    type: WidgetType,
    existingConfig: Record<string, unknown>,
  ) => Promise<void>;
  saveAs: (name: string) => void;
}

/**
 * Handle a single message from the dashboard webview.
 * Delegates to widget CRUD or panel refresh/config/state methods.
 */
export async function handleDashboardMessage(
  msg: WebviewToExtensionMessage,
  ctx: IDashboardMessageContext,
): Promise<void> {
  switch (msg.command) {
    case 'addWidget': {
      const newWidget = widgetCrud.addWidget(ctx, msg.type, msg.config);
      if (newWidget) {
        await ctx.refreshWidget(newWidget.id);
      }
      break;
    }

    case 'removeWidget':
      widgetCrud.removeWidget(ctx, msg.id);
      break;

    case 'swapWidgets':
      widgetCrud.swapWidgets(ctx, msg.idA, msg.idB);
      break;

    case 'resizeWidget':
      widgetCrud.resizeWidget(ctx, msg.id, msg.w, msg.h);
      break;

    case 'editWidget': {
      widgetCrud.editWidget(ctx, msg.id, msg.config);
      await ctx.refreshWidget(msg.id);
      break;
    }

    case 'refreshAll':
      await ctx.refreshAllWidgets();
      break;

    case 'refreshWidget':
      await ctx.refreshWidget(msg.id);
      break;

    case 'saveLayout':
      ctx.saveAs(msg.name);
      break;

    case 'loadLayout': {
      const layout = ctx.state.load(msg.name);
      if (layout) {
        ctx.updateLayout(layout);
      }
      break;
    }

    case 'getConfigSchema':
      await ctx.sendConfigSchema(msg.type, msg.existingConfig);
      break;

    case 'executeAction':
      // Allowlist: only this extension's own commands may be invoked from the
      // webview. Without this, an XSS in a dashboard widget (DB-derived content
      // is rendered here) could postMessage any registered VS Code command —
      // escalating script injection into editor-level actions.
      // See plans/history/2026.06/2026.06.12/full-codebase-audit-2026.06.12.md C2.
      if (
        typeof msg.actionCommand === 'string' &&
        msg.actionCommand.startsWith('driftViewer.')
      ) {
        await vscode.commands.executeCommand(msg.actionCommand, msg.args);
      }
      break;
  }
}
