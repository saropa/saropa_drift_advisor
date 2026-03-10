/** A single entry in the FK navigation history. */
export interface INavigationEntry {
  table: string;
  filter?: { column: string; value: unknown };
}

/** FK link metadata for a single column. */
export interface IFkLink {
  fromTable: string;
  fromColumn: string;
  toTable: string;
  toColumn: string;
}

/** Webview → extension: navigate to a FK target row. */
export interface IFkNavigateMsg {
  command: 'fkNavigate';
  toTable: string;
  toColumn: string;
  value: unknown;
}

/** Webview → extension: go back in FK history. */
export interface IFkBackMsg { command: 'fkBack'; }

/** Webview → extension: go forward in FK history. */
export interface IFkForwardMsg { command: 'fkForward'; }

/** Webview → extension: request FK metadata for a table. */
export interface IFkGetColumnsMsg {
  command: 'fkGetColumns';
  table: string;
}

/** Discriminated union of all FK-related webview messages. */
export type FkMessage =
  | IFkNavigateMsg | IFkBackMsg | IFkForwardMsg | IFkGetColumnsMsg;
