/**
 * Type definitions for the Data Story Narrator feature.
 *
 * The narrator builds a human-readable story from a database row,
 * following FK relationships to describe the entity and its connections.
 */

/** The root row being narrated. */
export interface IEntityNode {
  table: string;
  pkColumn: string;
  pkValue: unknown;
  row: Record<string, unknown>;
  columns: string[];
}

/** Related rows from a parent or child table. */
export interface IRelatedData {
  table: string;
  /** 'parent' = this row references it, 'child' = it references this row. */
  direction: 'parent' | 'child';
  /** The FK column involved in the relationship. */
  fkColumn: string;
  /** The fetched rows (limited). */
  rows: Record<string, unknown>[];
  /** Total count of related rows. */
  rowCount: number;
  /** True if more rows exist than the limit. */
  truncated: boolean;
}

/** The full entity graph for narrative generation. */
export interface IEntityGraph {
  root: IEntityNode;
  relatedTables: Map<string, IRelatedData>;
}

/** Generated narrative content in multiple formats. */
export interface INarrativeResult {
  /** Human-readable paragraph text. */
  text: string;
  /** Markdown-formatted version. */
  markdown: string;
  /** The underlying graph data. */
  graph: IEntityGraph;
}

/** Messages from webview to extension. */
export type NarratorToExtensionMessage =
  | { command: 'narrate'; table: string; pkColumn: string; pkValue: unknown }
  | { command: 'copyText' }
  | { command: 'copyMarkdown' }
  | { command: 'regenerate' };

/** Messages from extension to webview. */
export type ExtensionToNarratorMessage =
  | { command: 'narrative'; text: string; markdown: string; graphJson: string }
  | { command: 'generating'; table: string; pkValue: unknown }
  | { command: 'error'; message: string };
