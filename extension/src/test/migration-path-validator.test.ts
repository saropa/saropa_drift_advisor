import * as assert from 'assert';
import { validateMigrationPaths } from '../migration-gen/migration-path-validator';

describe('validateMigrationPaths', () => {
  it('should extract versions from standard v{N}.json filenames', () => {
    const result = validateMigrationPaths([
      'file:///project/drift_schemas/v1.json',
      'file:///project/drift_schemas/v2.json',
      'file:///project/drift_schemas/v3.json',
    ]);
    assert.deepStrictEqual(result.versions, [1, 2, 3]);
    assert.deepStrictEqual(result.gaps, []);
  });

  it('should detect gaps between versions', () => {
    const result = validateMigrationPaths([
      'file:///project/drift_schemas/v1.json',
      'file:///project/drift_schemas/v3.json',
      'file:///project/drift_schemas/v5.json',
    ]);
    assert.deepStrictEqual(result.versions, [1, 3, 5]);
    assert.deepStrictEqual(result.gaps, [2, 4]);
  });

  it('should return empty arrays for no URIs', () => {
    const result = validateMigrationPaths([]);
    assert.deepStrictEqual(result.versions, []);
    assert.deepStrictEqual(result.gaps, []);
  });

  it('should return no gaps for a single version', () => {
    const result = validateMigrationPaths([
      'file:///project/drift_schemas/v1.json',
    ]);
    assert.deepStrictEqual(result.versions, [1]);
    assert.deepStrictEqual(result.gaps, []);
  });

  it('should handle schema_v{N}.json naming convention', () => {
    const result = validateMigrationPaths([
      'file:///project/drift_schemas/schema_v1.json',
      'file:///project/drift_schemas/schema_v2.json',
    ]);
    assert.deepStrictEqual(result.versions, [1, 2]);
    assert.deepStrictEqual(result.gaps, []);
  });

  it('should ignore files without version numbers', () => {
    const result = validateMigrationPaths([
      'file:///project/drift_schemas/v1.json',
      'file:///project/drift_schemas/readme.json',
      'file:///project/drift_schemas/v3.json',
    ]);
    assert.deepStrictEqual(result.versions, [1, 3]);
    assert.deepStrictEqual(result.gaps, [2]);
  });

  it('should handle monorepo paths', () => {
    const result = validateMigrationPaths([
      'file:///monorepo/packages/app/drift_schemas/v1.json',
      'file:///monorepo/packages/app/drift_schemas/v2.json',
    ]);
    assert.deepStrictEqual(result.versions, [1, 2]);
    assert.deepStrictEqual(result.gaps, []);
  });

  it('should sort versions numerically', () => {
    const result = validateMigrationPaths([
      'file:///project/drift_schemas/v10.json',
      'file:///project/drift_schemas/v2.json',
      'file:///project/drift_schemas/v1.json',
    ]);
    assert.deepStrictEqual(result.versions, [1, 2, 10]);
    assert.deepStrictEqual(result.gaps, [3, 4, 5, 6, 7, 8, 9]);
  });
});
