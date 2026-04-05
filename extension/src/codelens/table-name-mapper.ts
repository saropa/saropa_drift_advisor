/**
 * Maps Dart PascalCase table class names to their SQL snake_case equivalents,
 * validated against the live server table list.
 */
export class TableNameMapper {
  private _serverTables: string[] = [];
  private _cache = new Map<string, string | null>();

  /**
   * Convert a PascalCase Dart class name to snake_case, matching Drift's
   * naming algorithm. Drift treats every uppercase letter as a new word
   * boundary, so consecutive capitals like "DC" become "d_c", not "dc".
   *
   * Uses zero-width lookahead/lookbehind to insert underscores at every
   * boundary between any letter and an uppercase letter, avoiding the
   * overlapping-match issues that plague capture-group-based regexes.
   */
  static dartClassToSnakeCase(className: string): string {
    return className
      .replace(/(?<=[a-zA-Z\d])(?=[A-Z])/g, '_')
      .toLowerCase();
  }

  /**
   * Normalize a table name for fuzzy comparison by stripping all underscores
   * and lowercasing. This handles the mismatch between Drift's per-letter
   * splitting of acronyms (e.g. "superhero_d_c_characters") and manually
   * created DB tables that keep acronyms together (e.g. "superhero_dc_characters").
   *
   * Both normalize to "superherodccharacters", allowing a match.
   */
  static normalizeForComparison(tableName: string): string {
    return tableName.toLowerCase().replace(/_/g, '');
  }

  /** Update the known server table list. Clears the mapping cache. */
  updateTableList(tables: string[]): void {
    this._serverTables = tables;
    this._cache.clear();
  }

  /**
   * Resolve a Dart class name to a server table name.
   * Returns the matched table name, or null if no match found.
   *
   * Strategy:
   * 1. Convert to snake_case and check for exact match
   * 2. Fall back to case-insensitive match against server table list
   */
  resolve(dartClassName: string): string | null {
    const cached = this._cache.get(dartClassName);
    if (cached !== undefined) {
      return cached;
    }

    const snake = TableNameMapper.dartClassToSnakeCase(dartClassName);

    // Exact match
    if (this._serverTables.includes(snake)) {
      this._cache.set(dartClassName, snake);
      return snake;
    }

    // Case-insensitive fallback
    const lowerSnake = snake.toLowerCase();
    const match = this._serverTables.find(
      (t) => t.toLowerCase() === lowerSnake,
    );
    const result = match ?? null;
    this._cache.set(dartClassName, result);
    return result;
  }
}
