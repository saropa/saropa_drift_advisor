/**
 * Composed widget registry: aggregates all widget definitions and exposes lookup.
 */

import type { IWidgetTypeInfo, WidgetType } from './dashboard-types';
import type { IWidgetDefinition } from './dashboard-types';
import { DATA_WIDGETS } from './widgets/data-widgets';
import { MONITORING_WIDGETS } from './widgets/monitoring-widgets';
import { QUERY_WIDGETS } from './widgets/query-widgets';
import { UTILITY_WIDGETS } from './widgets/utility-widgets';
import { DISCOVERY_WIDGETS } from './widgets/discovery-widget';

export type { IWidgetDefinition } from './dashboard-types';

/** Registry of all available widget types. */
export const WIDGET_REGISTRY: IWidgetDefinition[] = [
  ...DATA_WIDGETS,
  ...QUERY_WIDGETS,
  ...MONITORING_WIDGETS,
  ...UTILITY_WIDGETS,
  ...DISCOVERY_WIDGETS,
];

/** Get widget type info for the add widget picker. */
export function getWidgetTypeInfoList(): IWidgetTypeInfo[] {
  return WIDGET_REGISTRY.map((def) => ({
    type: def.type,
    label: def.label,
    icon: def.icon,
    description: def.description,
  }));
}

/** Find a widget definition by type. */
export function getWidgetDefinition(type: WidgetType): IWidgetDefinition | undefined {
  return WIDGET_REGISTRY.find((def) => def.type === type);
}
