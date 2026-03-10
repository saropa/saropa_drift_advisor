import * as assert from 'assert';
import { DataGenerator } from '../seeder/data-generator';
import type { IColumnSeederConfig } from '../seeder/seeder-types';

function cfg(
  generator: IColumnSeederConfig['generator'],
  overrides: Partial<IColumnSeederConfig> = {},
): IColumnSeederConfig {
  return {
    column: 'test',
    sqlType: 'TEXT',
    generator,
    params: {},
    isPk: false,
    nullable: false,
    nullProbability: 0,
    ...overrides,
  };
}

describe('DataGenerator', () => {
  let gen: DataGenerator;
  beforeEach(() => { gen = new DataGenerator(); });

  describe('generate', () => {
    it('auto_increment returns sequential integers', () => {
      const c = cfg('auto_increment');
      assert.strictEqual(gen.generate(c), 1);
      assert.strictEqual(gen.generate(c), 2);
      assert.strictEqual(gen.generate(c), 3);
    });

    it('uuid returns valid UUID format', () => {
      const v = gen.generate(cfg('uuid')) as string;
      assert.match(v, /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
    });

    it('full_name returns "FirstName LastName" format', () => {
      const v = gen.generate(cfg('full_name')) as string;
      assert.match(v, /^\w+ \w+$/);
    });

    it('first_name returns non-empty string', () => {
      const v = gen.generate(cfg('first_name')) as string;
      assert.ok(v.length > 0);
    });

    it('last_name returns non-empty string', () => {
      const v = gen.generate(cfg('last_name')) as string;
      assert.ok(v.length > 0);
    });

    it('email returns valid email format', () => {
      const v = gen.generate(cfg('email')) as string;
      assert.match(v, /^[a-z]+\d+@example\.com$/);
    });

    it('phone returns "+1" prefix with 10 digits', () => {
      const v = gen.generate(cfg('phone')) as string;
      assert.match(v, /^\+1\d{10}$/);
    });

    it('url returns https URL', () => {
      const v = gen.generate(cfg('url')) as string;
      assert.match(v, /^https:\/\/example\.com\/\d{6}$/);
    });

    it('city returns non-empty string', () => {
      const v = gen.generate(cfg('city')) as string;
      assert.ok(v.length > 0);
    });

    it('country returns non-empty string', () => {
      const v = gen.generate(cfg('country')) as string;
      assert.ok(v.length > 0);
    });

    it('zip_code returns 5-digit string', () => {
      const v = gen.generate(cfg('zip_code')) as string;
      assert.match(v, /^\d{5}$/);
    });

    it('datetime returns ISO 8601 format', () => {
      const v = gen.generate(cfg('datetime')) as string;
      assert.ok(!isNaN(Date.parse(v)), `"${v}" is not a valid date`);
    });

    it('date returns YYYY-MM-DD format', () => {
      const v = gen.generate(cfg('date')) as string;
      assert.match(v, /^\d{4}-\d{2}-\d{2}$/);
    });

    it('boolean returns 0 or 1', () => {
      const v = gen.generate(cfg('boolean')) as number;
      assert.ok(v === 0 || v === 1);
    });

    it('integer respects min/max params', () => {
      const c = cfg('integer', { params: { min: 10, max: 20 } });
      for (let i = 0; i < 50; i++) {
        const v = gen.generate(c) as number;
        assert.ok(v >= 10 && v <= 20, `${v} not in [10,20]`);
      }
    });

    it('float returns number with max 2 decimals', () => {
      const v = gen.generate(cfg('float')) as number;
      assert.strictEqual(typeof v, 'number');
      const decimals = String(v).split('.')[1];
      assert.ok(!decimals || decimals.length <= 2);
    });

    it('price returns positive number', () => {
      const v = gen.generate(cfg('price')) as number;
      assert.ok(v >= 1 && v <= 999);
    });

    it('paragraph returns multi-sentence text', () => {
      const v = gen.generate(cfg('paragraph')) as string;
      assert.ok(v.includes('.'), 'should contain periods');
      assert.ok(v.length > 20);
    });

    it('sentence returns text ending with period', () => {
      const v = gen.generate(cfg('sentence')) as string;
      assert.ok(v.endsWith('.'));
    });

    it('random_string returns non-empty string', () => {
      const v = gen.generate(cfg('random_string')) as string;
      assert.ok(v.length > 0 && v.length <= 20);
    });
  });

  describe('null handling', () => {
    it('returns null for nullable column at probability 1.0', () => {
      const c = cfg('integer', {
        nullable: true,
        nullProbability: 1.0,
      });
      assert.strictEqual(gen.generate(c), null);
    });

    it('never returns null for PK columns', () => {
      const c = cfg('auto_increment', {
        isPk: true,
        nullable: false,
        nullProbability: 1.0,
      });
      assert.notStrictEqual(gen.generate(c), null);
    });
  });

  describe('FK resolution', () => {
    it('fk_reference picks from registered parent PKs', () => {
      gen.registerPks('users', [10, 20, 30]);
      const c = cfg('fk_reference', {
        params: { toTable: 'users', toColumn: 'id' },
      });
      const v = gen.generate(c);
      assert.ok([10, 20, 30].includes(v as number));
    });

    it('fk_reference returns null when no parent PKs', () => {
      const c = cfg('fk_reference', {
        params: { toTable: 'users', toColumn: 'id' },
      });
      assert.strictEqual(gen.generate(c), null);
    });

    it('registerPks stores values retrievable by getParentPks', () => {
      gen.registerPks('t', [1, 2, 3]);
      assert.deepStrictEqual(gen.getParentPks('t'), [1, 2, 3]);
    });
  });

  describe('generateRow', () => {
    it('produces object with all column names as keys', () => {
      const cols = [
        cfg('auto_increment', { column: 'id', isPk: true }),
        cfg('full_name', { column: 'name' }),
      ];
      const row = gen.generateRow('t', cols);
      assert.ok('id' in row);
      assert.ok('name' in row);
    });

    it('auto_increment PK values increase per row', () => {
      const cols = [cfg('auto_increment', { column: 'id', isPk: true })];
      const r1 = gen.generateRow('t', cols);
      const r2 = gen.generateRow('t', cols);
      assert.strictEqual(r1.id, 1);
      assert.strictEqual(r2.id, 2);
    });
  });

  describe('reset', () => {
    it('clears counters and stored PKs', () => {
      gen.registerPks('t', [1]);
      const c = cfg('auto_increment');
      gen.generate(c);
      gen.reset();
      assert.deepStrictEqual(gen.getParentPks('t'), []);
      assert.strictEqual(gen.generate(c), 1);
    });
  });
});
