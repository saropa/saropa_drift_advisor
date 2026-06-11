/**
 * WHERE operator options per column type for the visual query builder (Feature
 * 21, Phase 1). Drives the operator dropdown; shared by the extension webview and
 * the debug web builder so both offer the same operators for a given SQLite type.
 *
 * Self-contained (no imports) so it bundles into both surfaces.
 */

/** WHERE operator options for a column type. */
export function getWhereOpsForType(columnType: string): Array<{ val: string; label: string }> {
  const type = (columnType || '').toUpperCase();
  if (type === 'TEXT' || type.indexOf('VARCHAR') >= 0 || type.indexOf('CHAR') >= 0) {
    return [
      { val: 'LIKE', label: 'contains' },
      { val: '=', label: 'equals' },
      { val: '!=', label: '!=' },
      { val: 'IS NULL', label: 'is null' },
      { val: 'IS NOT NULL', label: 'is not null' },
      { val: 'IN', label: 'IN (comma list)' },
    ];
  }
  if (
    type === 'INTEGER' ||
    type === 'REAL' ||
    type.indexOf('INT') >= 0 ||
    type.indexOf('FLOAT') >= 0 ||
    type.indexOf('DOUBLE') >= 0 ||
    type.indexOf('NUM') >= 0 ||
    type.indexOf('DECIMAL') >= 0
  ) {
    return [
      { val: '=', label: '=' },
      { val: '!=', label: '!=' },
      { val: '>', label: '>' },
      { val: '<', label: '<' },
      { val: '>=', label: '>=' },
      { val: '<=', label: '<=' },
      { val: 'IS NULL', label: 'is null' },
      { val: 'IS NOT NULL', label: 'is not null' },
      { val: 'IN', label: 'IN (comma list)' },
    ];
  }
  if (type === 'BLOB') {
    return [
      { val: 'IS NULL', label: 'is null' },
      { val: 'IS NOT NULL', label: 'is not null' },
    ];
  }
  return [
    { val: '=', label: '=' },
    { val: '!=', label: '!=' },
    { val: 'LIKE', label: 'contains' },
    { val: 'IS NULL', label: 'is null' },
    { val: 'IS NOT NULL', label: 'is not null' },
    { val: 'IN', label: 'IN (comma list)' },
  ];
}
