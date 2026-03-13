/**
 * Webview-to-host message types for the clipboard import panel.
 * Extracted from clipboard-import-panel for modularization.
 */

import type { ImportStrategy } from './clipboard-import-types';

/**
 * Message from webview to update a column mapping.
 */
export interface IUpdateMappingMessage {
  command: 'updateMapping';
  /** Index of the mapping in the mapping array */
  index: number;
  /** Target table column name, or null to skip this column */
  tableColumn: string | null;
}

/**
 * Message from webview to change import strategy.
 */
export interface IUpdateStrategyMessage {
  command: 'updateStrategy';
  /** New import strategy selection */
  strategy: ImportStrategy;
}

/**
 * Message from webview to change match-by setting.
 */
export interface IUpdateMatchByMessage {
  command: 'updateMatchBy';
  /** Column name to match by, or 'pk' for primary key */
  matchBy: string;
}

/**
 * Message from webview to toggle continue-on-error setting.
 */
export interface IUpdateContinueOnErrorMessage {
  command: 'updateContinueOnError';
  /** Whether to continue importing when individual rows fail */
  continueOnError: boolean;
}

/**
 * Simple command messages without additional data.
 */
export interface ISimpleMessage {
  command: 'cancel' | 'validate' | 'import';
}

/**
 * Union type of all possible messages from the webview.
 */
export type PanelMessage =
  | IUpdateMappingMessage
  | IUpdateStrategyMessage
  | IUpdateMatchByMessage
  | IUpdateContinueOnErrorMessage
  | ISimpleMessage;
