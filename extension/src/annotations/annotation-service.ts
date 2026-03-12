/**
 * AnnotationService: Centralized access to annotations for integration.
 *
 * This service provides a simple interface for other features to:
 * - Check if annotations exist for a table/column
 * - Get annotation summaries for display in Hover/CodeLens/Tree
 * - Subscribe to annotation changes
 */

import type { AnnotationStore } from './annotation-store';
import type { AnnotationIcon, IAnnotation } from './annotation-types';

export interface IAnnotationSummary {
  count: number;
  icons: AnnotationIcon[];
  preview: string;
  annotations: IAnnotation[];
}

export class AnnotationService {
  constructor(private readonly _store: AnnotationStore) {}

  /**
   * Check if there are any annotations for a table.
   */
  hasTableAnnotations(table: string): boolean {
    return this._store.hasAnnotations(table);
  }

  /**
   * Check if there are any annotations for a specific column.
   */
  hasColumnAnnotations(table: string, column: string): boolean {
    return this._store.hasAnnotations(table, column);
  }

  /**
   * Get a summary of annotations for a table (for display in tree/hover).
   */
  getTableSummary(table: string): IAnnotationSummary {
    const annotations = this._store.forTable(table);
    return this._buildSummary(annotations);
  }

  /**
   * Get a summary of annotations for a column (for display in hover).
   */
  getColumnSummary(table: string, column: string): IAnnotationSummary {
    const annotations = this._store.forColumn(table, column);
    return this._buildSummary(annotations);
  }

  /**
   * Get a summary of annotations for a row (for display in data grid).
   */
  getRowSummary(table: string, rowPk: string): IAnnotationSummary {
    const annotations = this._store.forRow(table, rowPk);
    return this._buildSummary(annotations);
  }

  /**
   * Format annotations for display in a hover card.
   */
  formatForHover(summary: IAnnotationSummary): string {
    if (summary.count === 0) return '';

    const lines: string[] = ['---', '**Notes:**'];
    for (const ann of summary.annotations.slice(0, 3)) {
      const icon = this._iconToEmoji(ann.icon);
      lines.push(`${icon} ${ann.note}`);
    }
    if (summary.count > 3) {
      lines.push(`_...and ${summary.count - 3} more_`);
    }
    return lines.join('\n\n');
  }

  /**
   * Format annotations for display in CodeLens.
   */
  formatForCodeLens(summary: IAnnotationSummary): string {
    if (summary.count === 0) return '';
    const icons = summary.icons.slice(0, 3).map((i) => this._iconToEmoji(i)).join('');
    return `${icons} ${summary.count} note${summary.count > 1 ? 's' : ''}`;
  }

  /**
   * Format annotations for display in tree view tooltip.
   */
  formatForTreeTooltip(summary: IAnnotationSummary): string {
    if (summary.count === 0) return '';
    const lines = summary.annotations.slice(0, 5).map(
      (a) => `${this._iconToEmoji(a.icon)} ${a.note}`,
    );
    if (summary.count > 5) {
      lines.push(`...and ${summary.count - 5} more`);
    }
    return lines.join('\n');
  }

  /**
   * Subscribe to annotation changes.
   */
  onDidChange(listener: () => void): { dispose: () => void } {
    return this._store.onDidChange(listener);
  }

  private _buildSummary(annotations: IAnnotation[]): IAnnotationSummary {
    const icons = [...new Set(annotations.map((a) => a.icon))];
    const preview = annotations[0]?.note.substring(0, 50) ?? '';
    return {
      count: annotations.length,
      icons,
      preview: preview + (preview.length === 50 ? '...' : ''),
      annotations,
    };
  }

  private _iconToEmoji(icon: AnnotationIcon): string {
    switch (icon) {
      case 'note': return '📝';
      case 'warning': return '⚠️';
      case 'bug': return '🐛';
      case 'todo': return '📋';
      case 'bookmark': return '🔖';
      default: return '📝';
    }
  }
}
