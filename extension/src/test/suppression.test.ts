import * as assert from 'assert';
import {
  parseInlineSuppressions,
  isInlineSuppressed,
  emptySuppressions,
} from '../diagnostics/suppression';

describe('inline suppression directives', () => {
  describe('field-level (preceding-line directive)', () => {
    const src = [
      'class Users extends Table {', // 0
      '  // drift-advisor:ignore high-null-rate', // 1
      '  TextColumn get middleName => text().nullable()();', // 2 (target)
      '  TextColumn get bio => text().nullable()();', // 3
      '}', // 4
    ].join('\n');

    it('suppresses the named code on the next non-blank line', () => {
      const s = parseInlineSuppressions(src);
      assert.ok(isInlineSuppressed(s, 'high-null-rate', 2));
    });

    it('does not suppress a different code on the same line', () => {
      const s = parseInlineSuppressions(src);
      assert.ok(!isInlineSuppressed(s, 'unused-column', 2));
    });

    it('does not suppress a sibling line', () => {
      const s = parseInlineSuppressions(src);
      assert.ok(!isInlineSuppressed(s, 'high-null-rate', 3));
    });
  });

  describe('field-level (trailing directive)', () => {
    it('suppresses on its own line', () => {
      const src =
        '  TextColumn get middleName => text()(); // drift-advisor:ignore high-null-rate';
      const s = parseInlineSuppressions(src);
      assert.ok(isInlineSuppressed(s, 'high-null-rate', 0));
    });
  });

  describe('field-level (bare ignore = all codes)', () => {
    it('suppresses any code on the target line', () => {
      const src = ['// drift-advisor:ignore', 'TextColumn get x => text()();'].join(
        '\n',
      );
      const s = parseInlineSuppressions(src);
      assert.ok(isInlineSuppressed(s, 'high-null-rate', 1));
      assert.ok(isInlineSuppressed(s, 'data-skew', 1));
    });
  });

  describe('field-level (multiple codes, comma or space separated)', () => {
    it('suppresses every listed code', () => {
      const src = [
        '// drift-advisor:ignore high-null-rate, unused-column',
        'TextColumn get x => text()();',
      ].join('\n');
      const s = parseInlineSuppressions(src);
      assert.ok(isInlineSuppressed(s, 'high-null-rate', 1));
      assert.ok(isInlineSuppressed(s, 'unused-column', 1));
      assert.ok(!isInlineSuppressed(s, 'data-skew', 1));
    });
  });

  describe('file-level', () => {
    it('suppresses the named code on every line', () => {
      const src = [
        '// drift-advisor:ignore-file high-null-rate',
        'class Users extends Table {}',
      ].join('\n');
      const s = parseInlineSuppressions(src);
      assert.ok(isInlineSuppressed(s, 'high-null-rate', 1));
      assert.ok(isInlineSuppressed(s, 'high-null-rate', 999));
      assert.ok(!isInlineSuppressed(s, 'unused-column', 1));
    });

    it('bare ignore-file suppresses every code everywhere', () => {
      const src = '// drift-advisor:ignore-file';
      const s = parseInlineSuppressions(src);
      assert.ok(isInlineSuppressed(s, 'anything', 0));
      assert.ok(isInlineSuppressed(s, 'data-skew', 42));
    });
  });

  describe('robustness', () => {
    it('is CRLF-safe', () => {
      const src =
        '// drift-advisor:ignore high-null-rate\r\nTextColumn get x => text()();';
      const s = parseInlineSuppressions(src);
      assert.ok(isInlineSuppressed(s, 'high-null-rate', 1));
    });

    it('matches the marker case-insensitively and lowercases codes', () => {
      const src = '// DRIFT-ADVISOR:IGNORE-FILE High-Null-Rate';
      const s = parseInlineSuppressions(src);
      assert.ok(isInlineSuppressed(s, 'high-null-rate', 0));
    });

    it('empty suppressions suppress nothing', () => {
      const s = emptySuppressions();
      assert.ok(!isInlineSuppressed(s, 'high-null-rate', 0));
    });

    it('ignores unrelated comments', () => {
      const src = ['// just a normal comment', 'TextColumn get x => text()();'].join(
        '\n',
      );
      const s = parseInlineSuppressions(src);
      assert.ok(!isInlineSuppressed(s, 'high-null-rate', 1));
    });
  });
});
