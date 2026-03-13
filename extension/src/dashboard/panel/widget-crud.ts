/**
 * Widget CRUD operations for the dashboard panel.
 * Add, remove, swap, resize, and edit widgets; persists via context.
 */

import type {
  IDashboardLayout,
  IWidgetConfig,
  WidgetType,
} from '../dashboard-types';
import type { IWidgetDefinition } from '../widget-registry';
import { findNextGridX, findNextGridY, generateId } from './widget-layout';

/** Minimal context needed for widget CRUD (layout, state, panel, and helpers). */
export interface IWidgetCrudContext {
  layout: IDashboardLayout;
  state: { save: (layout: IDashboardLayout) => void };
  panel: { webview: { postMessage: (msg: unknown) => void } };
  saveAndNotify: () => void;
  getWidgetDefinition: (type: WidgetType) => IWidgetDefinition | undefined;
  findNextGridX: () => number;
  findNextGridY: () => number;
  generateId: () => string;
}

/**
 * Add a new widget to the layout, save, and return it for the caller to refresh.
 */
export function addWidget(
  ctx: IWidgetCrudContext,
  type: WidgetType,
  config: Record<string, unknown>,
): IWidgetConfig | null {
  const def = ctx.getWidgetDefinition(type);
  if (!def) return null;

  const newWidget: IWidgetConfig = {
    id: ctx.generateId(),
    type,
    title: (config.title as string) || def.label,
    gridX: ctx.findNextGridX(),
    gridY: ctx.findNextGridY(),
    gridW: def.defaultSize.w,
    gridH: def.defaultSize.h,
    config,
  };

  ctx.layout.widgets.push(newWidget);
  ctx.saveAndNotify();
  return newWidget;
}

/** Remove a widget by id. */
export function removeWidget(ctx: IWidgetCrudContext, id: string): void {
  ctx.layout.widgets = ctx.layout.widgets.filter((w) => w.id !== id);
  ctx.saveAndNotify();
}

/** Swap grid positions of two widgets. */
export function swapWidgets(
  ctx: IWidgetCrudContext,
  idA: string,
  idB: string,
): void {
  const widgetA = ctx.layout.widgets.find((w) => w.id === idA);
  const widgetB = ctx.layout.widgets.find((w) => w.id === idB);
  if (!widgetA || !widgetB) return;

  const tempX = widgetA.gridX;
  const tempY = widgetA.gridY;
  widgetA.gridX = widgetB.gridX;
  widgetA.gridY = widgetB.gridY;
  widgetB.gridX = tempX;
  widgetB.gridY = tempY;

  ctx.saveAndNotify();
}

/** Resize a widget; clamps to layout columns and max height 3. */
export function resizeWidget(
  ctx: IWidgetCrudContext,
  id: string,
  w: number,
  h: number,
): void {
  const widget = ctx.layout.widgets.find((wgt) => wgt.id === id);
  if (!widget) return;

  widget.gridW = Math.max(1, Math.min(ctx.layout.columns, w));
  widget.gridH = Math.max(1, Math.min(3, h));
  ctx.saveAndNotify();
}

/** Update a widget's config and title. */
export function editWidget(
  ctx: IWidgetCrudContext,
  id: string,
  config: Record<string, unknown>,
): void {
  const widget = ctx.layout.widgets.find((w) => w.id === id);
  if (!widget) return;

  widget.config = { ...widget.config, ...config };
  if (config.title !== undefined) {
    widget.title = String(config.title);
  }
  ctx.saveAndNotify();
}
