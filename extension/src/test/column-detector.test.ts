import * as assert from 'assert';
import type { ColumnMetadata, ForeignKey } from '../api-types';
import {
  detectGenerator,
  detectTableGenerators,
} from '../seeder/column-detector';

function col(name: string, type = 'TEXT', pk = false): ColumnMetadata {
  return { name, type, pk };
}

describe('detectGenerator', () => {
  const np = 0.05;

  describe('PK detection', () => {
    it('detects INTEGER PK as auto_increment', () => {
      const r = detectGenerator(col('id', 'INTEGER', true), undefined, np);
      assert.strictEqual(r.generator, 'auto_increment');
      assert.strictEqual(r.isPk, true);
      assert.strictEqual(r.nullable, false);
      assert.strictEqual(r.nullProbability, 0);
    });

    it('detects TEXT PK as uuid', () => {
      const r = detectGenerator(col('id', 'TEXT', true), undefined, np);
      assert.strictEqual(r.generator, 'uuid');
    });
  });

  describe('FK detection', () => {
    it('detects FK column as fk_reference', () => {
      const fk: ForeignKey = {
        fromColumn: 'user_id',
        toTable: 'users',
        toColumn: 'id',
      };
      const r = detectGenerator(col('user_id', 'INTEGER'), fk, np);
      assert.strictEqual(r.generator, 'fk_reference');
      assert.strictEqual(r.params.toTable, 'users');
      assert.strictEqual(r.params.toColumn, 'id');
    });
  });

  describe('name pattern detection', () => {
    const cases: [string, string][] = [
      ['email', 'email'],
      ['mail', 'email'],
      ['phone', 'phone'],
      ['mobile', 'phone'],
      ['url', 'url'],
      ['website', 'url'],
      ['name', 'full_name'],
      ['full_name', 'full_name'],
      ['first_name', 'first_name'],
      ['firstname', 'first_name'],
      ['last_name', 'last_name'],
      ['city', 'city'],
      ['country', 'country'],
      ['zip_code', 'zip_code'],
      ['postal_code', 'zip_code'],
      ['created_at', 'datetime'],
      ['updated_at', 'datetime'],
      ['timestamp', 'datetime'],
      ['date', 'date'],
      ['is_active', 'boolean'],
      ['has_verified', 'boolean'],
      ['active', 'boolean'],
      ['published', 'boolean'],
      ['price', 'price'],
      ['total', 'price'],
      ['cost', 'price'],
      ['age', 'integer'],
      ['description', 'paragraph'],
      ['bio', 'paragraph'],
      ['title', 'sentence'],
      ['subject', 'sentence'],
    ];

    for (const [colName, expected] of cases) {
      it(`detects "${colName}" as ${expected}`, () => {
        const r = detectGenerator(col(colName, 'TEXT'), undefined, np);
        assert.strictEqual(r.generator, expected);
      });
    }

    it('sets age params to 18-80', () => {
      const r = detectGenerator(col('age', 'INTEGER'), undefined, np);
      assert.strictEqual(r.params.min, 18);
      assert.strictEqual(r.params.max, 80);
    });
  });

  describe('type fallback', () => {
    it('falls back to integer for INTEGER type', () => {
      const r = detectGenerator(col('count', 'INTEGER'), undefined, np);
      assert.strictEqual(r.generator, 'integer');
    });

    it('falls back to float for REAL type', () => {
      const r = detectGenerator(col('score', 'REAL'), undefined, np);
      assert.strictEqual(r.generator, 'float');
    });

    it('falls back to boolean for BOOL type', () => {
      const r = detectGenerator(col('flag', 'BOOL'), undefined, np);
      assert.strictEqual(r.generator, 'boolean');
    });

    it('falls back to random_string for TEXT type', () => {
      const r = detectGenerator(col('data', 'TEXT'), undefined, np);
      assert.strictEqual(r.generator, 'random_string');
    });

    it('falls back to random_string for unknown type', () => {
      const r = detectGenerator(col('x', 'BLOB'), undefined, np);
      assert.strictEqual(r.generator, 'random_string');
    });
  });

  describe('edge cases', () => {
    it('handles uppercase column names', () => {
      const r = detectGenerator(col('EMAIL', 'TEXT'), undefined, np);
      assert.strictEqual(r.generator, 'email');
    });

    it('sets nullable false for PK columns', () => {
      const r = detectGenerator(col('id', 'INTEGER', true), undefined, np);
      assert.strictEqual(r.nullable, false);
    });
  });
});

describe('detectTableGenerators', () => {
  it('processes all columns including FK matching', () => {
    const columns: ColumnMetadata[] = [
      col('id', 'INTEGER', true),
      col('user_id', 'INTEGER'),
      col('title', 'TEXT'),
    ];
    const fks: ForeignKey[] = [
      { fromColumn: 'user_id', toTable: 'users', toColumn: 'id' },
    ];
    const result = detectTableGenerators(columns, fks, 0.05);

    assert.strictEqual(result.length, 3);
    assert.strictEqual(result[0].generator, 'auto_increment');
    assert.strictEqual(result[1].generator, 'fk_reference');
    assert.strictEqual(result[2].generator, 'sentence');
  });

  it('handles table with no FK columns', () => {
    const columns: ColumnMetadata[] = [
      col('id', 'INTEGER', true),
      col('name', 'TEXT'),
    ];
    const result = detectTableGenerators(columns, [], 0.05);
    assert.strictEqual(result.length, 2);
    assert.strictEqual(result[0].generator, 'auto_increment');
    assert.strictEqual(result[1].generator, 'full_name');
  });
});
