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

  describe('field-level (multi-line rationale wraps past continuation comments)', () => {
    const src = [
      'class Users extends Table {', // 0
      '  // drift-advisor:ignore high-null-rate -- by design: most activity types (screen', // 1
      '  // visits, searches, games, nav history) have no associated contact.', // 2
      '  TextColumn get contactSaropaUUID => text().named(\'contact_saropa_u_u_i_d\').nullable()();', // 3 (target)
    ].join('\n');

    it('skips continuation comment lines and targets the code line', () => {
      const s = parseInlineSuppressions(src);
      // Must suppress on line 3 (the column getter), not line 2 (continuation).
      assert.ok(isInlineSuppressed(s, 'high-null-rate', 3));
    });

    it('does not suppress the continuation comment line itself', () => {
      const s = parseInlineSuppressions(src);
      assert.ok(!isInlineSuppressed(s, 'high-null-rate', 2));
    });
  });

  describe('field-level (dash-variant rationale separators)', () => {
    it('accepts an em dash separator', () => {
      const src = [
        '// drift-advisor:ignore high-null-rate — by design: rationale text',
        'TextColumn get x => text().nullable()();',
      ].join('\n');
      const s = parseInlineSuppressions(src);
      assert.ok(isInlineSuppressed(s, 'high-null-rate', 1));
    });

    it('accepts an en dash separator', () => {
      const src = [
        '// drift-advisor:ignore high-null-rate – by design: rationale text',
        'TextColumn get x => text().nullable()();',
      ].join('\n');
      const s = parseInlineSuppressions(src);
      assert.ok(isInlineSuppressed(s, 'high-null-rate', 1));
    });

    it('accepts multiple spaces around the -- separator', () => {
      const src = [
        '// drift-advisor:ignore high-null-rate   --   by design: rationale text',
        'TextColumn get x => text().nullable()();',
      ].join('\n');
      const s = parseInlineSuppressions(src);
      assert.ok(isInlineSuppressed(s, 'high-null-rate', 1));
    });
  });

  describe('field-level (multi-line rationale wraps into a block comment)', () => {
    const src = [
      'class Users extends Table {', // 0
      '  // drift-advisor:ignore high-null-rate -- by design: most activity types', // 1
      '  /* screen visits, searches, games, nav history have no contact. */', // 2
      '  TextColumn get contactSaropaUUID => text().nullable()();', // 3 (target)
    ].join('\n');

    it('skips a single-line block comment continuation', () => {
      const s = parseInlineSuppressions(src);
      assert.ok(isInlineSuppressed(s, 'high-null-rate', 3));
      assert.ok(!isInlineSuppressed(s, 'high-null-rate', 2));
    });

    it('skips a multi-line block comment continuation', () => {
      const multiLine = [
        'class Users extends Table {', // 0
        '  // drift-advisor:ignore high-null-rate -- by design:', // 1
        '  /* screen visits, searches, games,', // 2
        '     nav history have no contact. */', // 3
        '  TextColumn get contactSaropaUUID => text().nullable()();', // 4 (target)
      ].join('\n');
      const s = parseInlineSuppressions(multiLine);
      assert.ok(isInlineSuppressed(s, 'high-null-rate', 4));
      assert.ok(!isInlineSuppressed(s, 'high-null-rate', 2));
      assert.ok(!isInlineSuppressed(s, 'high-null-rate', 3));
    });
  });

  describe('field-level (unreachable directive)', () => {
    it('records a directive with no code line after it as unreachable', () => {
      const src = [
        'class Users extends Table {}', // 0
        '// drift-advisor:ignore high-null-rate', // 1 (unreachable)
      ].join('\n');
      const s = parseInlineSuppressions(src);
      assert.deepStrictEqual(s.unreachableDirectiveLines, [1]);
    });

    it('records a directive followed only by trailing comments as unreachable', () => {
      const src = [
        '// drift-advisor:ignore high-null-rate', // 0 (unreachable)
        '// just a trailing comment, no code follows', // 1
      ].join('\n');
      const s = parseInlineSuppressions(src);
      assert.deepStrictEqual(s.unreachableDirectiveLines, [0]);
    });

    it('does not record a directive that successfully targets code', () => {
      const src = [
        '// drift-advisor:ignore high-null-rate',
        'TextColumn get x => text().nullable()();',
      ].join('\n');
      const s = parseInlineSuppressions(src);
      assert.deepStrictEqual(s.unreachableDirectiveLines, []);
    });

    it('does not record a trailing directive (targets its own line, always reachable)', () => {
      const src = '  TextColumn get x => text()(); // drift-advisor:ignore high-null-rate';
      const s = parseInlineSuppressions(src);
      assert.deepStrictEqual(s.unreachableDirectiveLines, []);
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
