/**
 * Validates schema snapshot completeness for Drift migration testing.
 *
 * Scans `drift_schemas/` for version snapshot files (v1.json, v2.json, ...),
 * extracts the version numbers, and reports gaps where an intermediate
 * version is missing. A gap means SchemaVerifier cannot test the N-to-N+1
 * upgrade path for that pair, leaving a migration untested.
 */

/** Result of validating migration snapshot coverage. */
export interface MigrationPathValidation {
  /** Sorted version numbers found in drift_schemas/. */
  readonly versions: number[];
  /** Version numbers missing between the lowest and highest found. */
  readonly gaps: number[];
}

/**
 * Extracts version numbers from drift_schemas file URIs.
 *
 * Accepts URIs like `file:///project/drift_schemas/v3.json` or
 * `file:///project/drift_schemas/schema_v12.json` — any filename
 * containing `v` followed by digits.
 *
 * @param uriStrings - stringified URI values from workspace.findFiles
 */
export function validateMigrationPaths(
  uriStrings: string[],
): MigrationPathValidation {
  const versionPattern = /v(\d+)\./i;
  const versions: number[] = [];

  for (const uri of uriStrings) {
    const filename = uri.split('/').pop() ?? '';
    const match = versionPattern.exec(filename);
    if (match) {
      versions.push(parseInt(match[1], 10));
    }
  }

  versions.sort((a, b) => a - b);

  const gaps: number[] = [];
  if (versions.length >= 2) {
    const min = versions[0];
    const max = versions[versions.length - 1];
    for (let v = min + 1; v < max; v++) {
      if (!versions.includes(v)) {
        gaps.push(v);
      }
    }
  }

  return { versions, gaps };
}
