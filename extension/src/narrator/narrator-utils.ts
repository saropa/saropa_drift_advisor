/**
 * Shared text/SQL formatting utilities for the Data Story Narrator.
 * Extracted for Phase 2 modularization.
 */

/**
 * Singularize a table name using simple heuristics.
 * Not a full NLP stemmer, handles common patterns.
 */
export function singularize(word: string): string {
  if (word.endsWith('ies')) {
    return word.slice(0, -3) + 'y';
  }
  if (word.endsWith('es') && (word.endsWith('sses') || word.endsWith('shes') || word.endsWith('ches') || word.endsWith('xes'))) {
    return word.slice(0, -2);
  }
  if (word.endsWith('us') || word.endsWith('ss')) {
    return word;
  }
  if (word.endsWith('s') && word.length > 2) {
    return word.slice(0, -1);
  }
  return word;
}

/**
 * Capitalize the first letter of a string.
 */
export function capitalize(word: string): string {
  if (!word) return word;
  return word.charAt(0).toUpperCase() + word.slice(1);
}

/**
 * Format a value for display in the narrative.
 */
export function formatValue(value: unknown): string {
  if (value === null) return 'NULL';
  if (value === undefined) return '';
  if (typeof value === 'string') return `"${value}"`;
  if (typeof value === 'boolean') return value ? 'true' : 'false';
  if (typeof value === 'number') return String(value);
  if (value instanceof Date) return value.toISOString();
  return String(value);
}

/**
 * Convert a value to a SQL literal for use in queries.
 */
export function sqlLiteral(value: unknown): string {
  if (value === null || value === undefined) return 'NULL';
  if (typeof value === 'number') return String(value);
  if (typeof value === 'boolean') return value ? '1' : '0';
  return `'${String(value).replace(/'/g, "''")}'`;
}
