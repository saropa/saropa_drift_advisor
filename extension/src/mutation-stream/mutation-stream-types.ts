/**
 * Types for the Mutation Stream panel webview communication.
 */

import type { MutationEvent } from '../api-types';

export interface MutationStreamFilters {
  table: string; // '' = all
  type: 'all' | MutationEvent['type'];
  mode: 'freeText' | 'columnValue';

  // Free-text filter fields
  search: string;

  // Column-value filter fields
  column: string; // column name selected from schema
  columnValue: string; // user input to match
}

export type MutationStreamWebviewMessage =
  | { command: 'filters'; filters: MutationStreamFilters }
  | { command: 'togglePause'; paused: boolean }
  | { command: 'viewRow'; eventId: number }
  | { command: 'exportJson' }
  | { command: 'ready' };

