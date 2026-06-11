/**
 * Message shapes the editing webview sends to the extension. Extracted from
 * editing-bridge.ts so the validators and the bridge share one definition.
 */

export interface CellEditMsg {
  command: 'cellEdit';
  table: string;
  pkColumn: string;
  pkValue: unknown;
  column: string;
  oldValue: unknown;
  newValue: unknown;
}
export interface RowDeleteMsg {
  command: 'rowDelete';
  table: string;
  pkColumn: string;
  pkValue: unknown;
}
export interface RowInsertMsg {
  command: 'rowInsert';
  table: string;
  values: Record<string, unknown>;
}
export interface UndoMsg { command: 'undo'; }
export interface RedoMsg { command: 'redo'; }
export interface DiscardMsg { command: 'discardAll'; }

export type EditMessage =
  | CellEditMsg | RowDeleteMsg | RowInsertMsg
  | UndoMsg | RedoMsg | DiscardMsg;
