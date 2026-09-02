/**
 * Regression tests for bug 006: `TABLE_CLASS_PATTERN` in dart-parser.ts must
 * match Drift table classes whose header carries a `with <mixin>` and/or
 * `implements <interface>` clause, not just the bare `extends Table {` form.
 *
 * Split into its own file (rather than added to dart-parser-tables.test.ts)
 * to keep that sibling file under the repo's 300-line-per-file convention.
 */
import * as assert from 'assert';
import { parseDartTables } from '../schema-diff/dart-parser';

describe('parseDartTables - mixin/implements class headers (bug 006)', () => {
  it('should still match the bare "extends Table {" form', () => {
    const source = `
class Contacts extends Table {
  IntColumn get id => integer().autoIncrement()();
}
`;
    const tables = parseDartTables(source, 'file:///test.dart');
    assert.strictEqual(tables.length, 1);
    assert.strictEqual(tables[0].dartClassName, 'Contacts');
  });

  it('should match a single "with" mixin clause', () => {
    const source = `
class Contacts extends Table with TimestampMixin {
  IntColumn get id => integer().autoIncrement()();
  TextColumn get displayName => text()();
}
`;
    const tables = parseDartTables(source, 'file:///test.dart');
    assert.strictEqual(tables.length, 1, 'table with a mixin must not be invisible');
    assert.strictEqual(tables[0].dartClassName, 'Contacts');
    assert.strictEqual(tables[0].sqlTableName, 'contacts');
    // Columns declared directly on the class body are still parsed; only
    // columns declared *inside the mixin itself* are out of scope for this
    // fix (see bug 006 root-cause note, option (a) vs (b)).
    assert.strictEqual(tables[0].columns.length, 2);
  });

  it('should match multiple comma-separated "with" mixins', () => {
    const source = `
class Contacts extends Table with A, B {
  IntColumn get id => integer()();
}
`;
    const tables = parseDartTables(source, 'file:///test.dart');
    assert.strictEqual(tables.length, 1);
    assert.strictEqual(tables[0].dartClassName, 'Contacts');
  });

  it('should match "with" followed by "implements"', () => {
    const source = `
class Contacts extends Table with A implements B {
  IntColumn get id => integer()();
}
`;
    const tables = parseDartTables(source, 'file:///test.dart');
    assert.strictEqual(tables.length, 1);
    assert.strictEqual(tables[0].dartClassName, 'Contacts');
  });

  it('should match a bare "implements" clause (including generics)', () => {
    const source = `
class Contacts extends Table implements Insertable<Contact> {
  IntColumn get id => integer()();
}
`;
    const tables = parseDartTables(source, 'file:///test.dart');
    assert.strictEqual(tables.length, 1);
    assert.strictEqual(tables[0].dartClassName, 'Contacts');
  });

  it('should match a header wrapped across lines by the formatter', () => {
    const source = `
class ContactPointsWithAVeryLongName extends Table
    with TimestampMixin {
  IntColumn get id => integer()();
}
`;
    const tables = parseDartTables(source, 'file:///test.dart');
    assert.strictEqual(tables.length, 1);
    assert.strictEqual(tables[0].dartClassName, 'ContactPointsWithAVeryLongName');
  });

  it('should NOT match a non-Table class named "*Table"', () => {
    const source = `
class ContactsTable extends SomeOtherClass {
  IntColumn get id => integer()();
}
`;
    const tables = parseDartTables(source, 'file:///test.dart');
    assert.strictEqual(tables.length, 0);
  });

  it('should NOT match a class with no "extends Table" at all', () => {
    const source = `
class MyTable {
  IntColumn get id => integer()();
}
`;
    const tables = parseDartTables(source, 'file:///test.dart');
    assert.strictEqual(tables.length, 0);
  });

  it('should NOT match "extends TableCompanion" (word-boundary guard)', () => {
    const source = `
class ContactsCompanion extends TableCompanion {
  IntColumn get id => integer()();
}
`;
    const tables = parseDartTables(source, 'file:///test.dart');
    assert.strictEqual(tables.length, 0);
  });
});
