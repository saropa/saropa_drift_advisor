import * as assert from 'assert';
import { TableNameMapper } from '../codelens/table-name-mapper';

describe('TableNameMapper', () => {
  describe('dartClassToSnakeCase()', () => {
    const cases: [string, string][] = [
      // Simple PascalCase — no consecutive uppercase
      ['Users', 'users'],
      ['TodoCategories', 'todo_categories'],
      ['UserProfileSettings', 'user_profile_settings'],

      // Consecutive uppercase — Drift splits each letter individually
      ['HTTPClient', 'h_t_t_p_client'],
      ['IOStream', 'i_o_stream'],
      ['ABCDef', 'a_b_c_def'],
      ['SuperheroDCCharacters', 'superhero_d_c_characters'],

      // Digit-to-uppercase boundary
      ['Table123Foo', 'table123_foo'],

      // Edge cases
      ['A', 'a'],
      ['AB', 'a_b'],
    ];

    for (const [input, expected] of cases) {
      it(`should convert ${input} -> ${expected}`, () => {
        assert.strictEqual(
          TableNameMapper.dartClassToSnakeCase(input),
          expected,
        );
      });
    }
  });

  describe('resolve()', () => {
    let mapper: TableNameMapper;

    beforeEach(() => {
      mapper = new TableNameMapper();
    });

    it('should return null when no server tables are loaded', () => {
      assert.strictEqual(mapper.resolve('Users'), null);
    });

    it('should match exact snake_case table name', () => {
      mapper.updateTableList(['users', 'orders']);
      assert.strictEqual(mapper.resolve('Users'), 'users');
    });

    it('should match case-insensitively as fallback', () => {
      mapper.updateTableList(['USERS', 'orders']);
      assert.strictEqual(mapper.resolve('Users'), 'USERS');
    });

    it('should return null when no match exists', () => {
      mapper.updateTableList(['orders']);
      assert.strictEqual(mapper.resolve('Users'), null);
    });

    it('should clear cache on updateTableList', () => {
      mapper.updateTableList(['users']);
      assert.strictEqual(mapper.resolve('Users'), 'users');

      mapper.updateTableList(['users_v2']);
      assert.strictEqual(mapper.resolve('Users'), null);
    });

    it('should cache null results too', () => {
      mapper.updateTableList(['orders']);
      assert.strictEqual(mapper.resolve('Users'), null);
      // Second call should hit cache and still return null
      assert.strictEqual(mapper.resolve('Users'), null);
    });

    it('should resolve acronym class names using Drift per-letter splitting', () => {
      // Drift produces 'superhero_d_c_characters', not 'superhero_dc_characters'
      mapper.updateTableList(['superhero_d_c_characters', 'orders']);
      assert.strictEqual(
        mapper.resolve('SuperheroDCCharacters'),
        'superhero_d_c_characters',
      );
    });
  });
});
