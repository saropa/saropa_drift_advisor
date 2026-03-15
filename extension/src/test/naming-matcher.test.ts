import * as assert from 'assert';
import {
  matchesConvention,
  matchesFkPattern,
  conventionLabel,
} from '../compliance/naming-matcher';

describe('matchesConvention', () => {
  describe('snake_case', () => {
    it('should accept valid snake_case names', () => {
      assert.ok(matchesConvention('user_name', 'snake_case'));
      assert.ok(matchesConvention('id', 'snake_case'));
      assert.ok(matchesConvention('created_at', 'snake_case'));
      assert.ok(matchesConvention('a1', 'snake_case'));
    });

    it('should reject invalid snake_case names', () => {
      assert.ok(!matchesConvention('userName', 'snake_case'));
      assert.ok(!matchesConvention('UserName', 'snake_case'));
      assert.ok(!matchesConvention('USER_NAME', 'snake_case'));
      assert.ok(!matchesConvention('_leading', 'snake_case'));
      assert.ok(!matchesConvention('trailing_', 'snake_case'));
      assert.ok(!matchesConvention('double__under', 'snake_case'));
    });
  });

  describe('camelCase', () => {
    it('should accept valid camelCase names', () => {
      assert.ok(matchesConvention('userName', 'camelCase'));
      assert.ok(matchesConvention('id', 'camelCase'));
      assert.ok(matchesConvention('createdAt', 'camelCase'));
    });

    it('should reject invalid camelCase names', () => {
      assert.ok(!matchesConvention('user_name', 'camelCase'));
      assert.ok(!matchesConvention('UserName', 'camelCase'));
      assert.ok(!matchesConvention('USER_NAME', 'camelCase'));
    });
  });

  describe('PascalCase', () => {
    it('should accept valid PascalCase names', () => {
      assert.ok(matchesConvention('UserName', 'PascalCase'));
      assert.ok(matchesConvention('Id', 'PascalCase'));
      assert.ok(matchesConvention('CreatedAt', 'PascalCase'));
    });

    it('should reject invalid PascalCase names', () => {
      assert.ok(!matchesConvention('userName', 'PascalCase'));
      assert.ok(!matchesConvention('user_name', 'PascalCase'));
      assert.ok(!matchesConvention('USER_NAME', 'PascalCase'));
    });
  });

  describe('UPPER_SNAKE', () => {
    it('should accept valid UPPER_SNAKE names', () => {
      assert.ok(matchesConvention('USER_NAME', 'UPPER_SNAKE'));
      assert.ok(matchesConvention('ID', 'UPPER_SNAKE'));
      assert.ok(matchesConvention('CREATED_AT', 'UPPER_SNAKE'));
    });

    it('should reject invalid UPPER_SNAKE names', () => {
      assert.ok(!matchesConvention('userName', 'UPPER_SNAKE'));
      assert.ok(!matchesConvention('user_name', 'UPPER_SNAKE'));
      assert.ok(!matchesConvention('UserName', 'UPPER_SNAKE'));
    });
  });
});

describe('matchesFkPattern', () => {
  it('should match simple table_id pattern', () => {
    assert.ok(matchesFkPattern('user_id', '{table}_id', 'user'));
  });

  it('should match multi-word table name', () => {
    assert.ok(matchesFkPattern('user_accounts_id', '{table}_id', 'user_accounts'));
  });

  it('should reject non-matching column', () => {
    assert.ok(!matchesFkPattern('userId', '{table}_id', 'user'));
    assert.ok(!matchesFkPattern('category_id', '{table}_id', 'user'));
  });

  it('should handle pattern with prefix', () => {
    assert.ok(matchesFkPattern('fk_user', 'fk_{table}', 'user'));
  });
});

describe('conventionLabel', () => {
  it('should return the convention name', () => {
    assert.strictEqual(conventionLabel('snake_case'), 'snake_case');
    assert.strictEqual(conventionLabel('camelCase'), 'camelCase');
    assert.strictEqual(conventionLabel('PascalCase'), 'PascalCase');
    assert.strictEqual(conventionLabel('UPPER_SNAKE'), 'UPPER_SNAKE');
  });
});
