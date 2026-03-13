/**
 * Grid layout helpers for the dashboard panel.
 * Used to compute next widget position and generate widget IDs.
 */

import type { IDashboardLayout } from '../dashboard-types';

/**
 * Next column for a new widget. Returns 0 if we need a new row (current row full).
 */
export function findNextGridX(layout: IDashboardLayout): number {
  if (layout.widgets.length === 0) return 0;
  const maxX = Math.max(...layout.widgets.map((w) => w.gridX + w.gridW));
  return maxX >= layout.columns ? 0 : maxX;
}

/**
 * Next row (or current row) for a new widget.
 */
export function findNextGridY(layout: IDashboardLayout): number {
  if (layout.widgets.length === 0) return 0;
  const nextX = findNextGridX(layout);
  if (nextX === 0) {
    return Math.max(...layout.widgets.map((w) => w.gridY + w.gridH));
  }
  const maxY = Math.max(...layout.widgets.map((w) => w.gridY));
  const widgetsOnLastRow = layout.widgets.filter((w) => w.gridY === maxY);
  if (widgetsOnLastRow.length > 0) {
    return widgetsOnLastRow[0].gridY;
  }
  return 0;
}

/** Generate a unique widget id. */
export function generateId(): string {
  return `w-${Date.now().toString(36)}-${Math.random().toString(36).substring(2, 7)}`;
}
