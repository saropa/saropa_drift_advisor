import * as assert from 'assert';
import { MockMemento } from './vscode-mock';
import { AnnotationStore } from '../annotations/annotation-store';
import { ANNOTATION_ICON_EMOJI } from '../annotations/annotation-types';
import { TableItem, ColumnItem } from '../tree/tree-items';
import {
  decorateTableItems,
  decorateColumnItems,
} from '../tree/drift-tree-children';
import type { TableMetadata, ColumnMetadata } from '../api-types';

/** Build a minimal TableMetadata for testing. */
function makeTable(name: string, rowCount = 5): TableMetadata {
  return { name, columns: [], rowCount };
}

/** Build a minimal ColumnMetadata for testing. */
function makeColumn(name: string, type = 'TEXT', pk = false): ColumnMetadata {
  return { name, type, pk };
}

describe('decorateTableItems', () => {
  let store: AnnotationStore;

  beforeEach(() => {
    store = new AnnotationStore(new MockMemento());
  });

  it('should show base row count when no annotations', () => {
    const items = [new TableItem(makeTable('users', 3))];
    decorateTableItems(items, store);
    assert.strictEqual(items[0].description, '3 rows');
  });

  it('should use singular "row" for rowCount === 1', () => {
    const items = [new TableItem(makeTable('meta', 1))];
    decorateTableItems(items, store);
    assert.strictEqual(items[0].description, '1 row');
  });

  it('should show annotation icon + note preview for single annotation', () => {
    store.add({ kind: 'table', table: 'users' }, 'Check indexes', 'warning');
    const items = [new TableItem(makeTable('users', 5))];
    decorateTableItems(items, store);
    const desc = items[0].description as string;
    // Should contain row count, warning emoji, and note text
    assert.ok(desc.startsWith('5 rows'));
    assert.ok(desc.includes(ANNOTATION_ICON_EMOJI.warning));
    assert.ok(desc.includes('Check indexes'));
    // Should NOT include "+N more" suffix for a single annotation
    assert.ok(!desc.includes('+'));
  });

  it('should show "+N more" when multiple annotations exist', () => {
    store.add({ kind: 'table', table: 'users' }, 'First note', 'note');
    store.add(
      { kind: 'column', table: 'users', column: 'email' },
      'Second note', 'bug',
    );
    store.add(
      { kind: 'column', table: 'users', column: 'name' },
      'Third note', 'star',
    );
    const items = [new TableItem(makeTable('users', 5))];
    decorateTableItems(items, store);
    const desc = items[0].description as string;
    // First annotation should be shown; remaining 2 as "+2 more"
    assert.ok(desc.includes('First note'));
    assert.ok(desc.includes('+2 more'));
  });

  it('should truncate long notes with ellipsis', () => {
    const longNote = 'A'.repeat(50);
    store.add({ kind: 'table', table: 'users' }, longNote, 'note');
    const items = [new TableItem(makeTable('users', 5))];
    decorateTableItems(items, store);
    const desc = items[0].description as string;
    // Note should be truncated (max 40 chars) with ellipsis
    assert.ok(desc.includes('\u2026'));
    assert.ok(!desc.includes(longNote));
  });

  it('should not decorate when annotationStore is undefined', () => {
    const items = [new TableItem(makeTable('users', 5))];
    const origDesc = items[0].description;
    decorateTableItems(items, undefined);
    // Description should remain unchanged
    assert.strictEqual(items[0].description, origDesc);
  });
});

describe('decorateColumnItems', () => {
  let store: AnnotationStore;

  beforeEach(() => {
    store = new AnnotationStore(new MockMemento());
  });

  it('should not modify columns without annotations', () => {
    const cols = [new ColumnItem(makeColumn('email'), 'users')];
    const origDesc = cols[0].description;
    decorateColumnItems(cols, 'users', store);
    assert.strictEqual(cols[0].description, origDesc);
  });

  it('should append annotation icon + note for annotated column', () => {
    store.add(
      { kind: 'column', table: 'users', column: 'email' },
      'Unused column', 'warning',
    );
    const cols = [new ColumnItem(makeColumn('email', 'TEXT'), 'users')];
    decorateColumnItems(cols, 'users', store);
    const desc = cols[0].description as string;
    // Should contain original type, warning emoji, and note
    assert.ok(desc.includes('TEXT'));
    assert.ok(desc.includes(ANNOTATION_ICON_EMOJI.warning));
    assert.ok(desc.includes('Unused column'));
  });

  it('should show "+N more" for multiple column annotations', () => {
    store.add(
      { kind: 'column', table: 'users', column: 'email' },
      'First', 'note',
    );
    store.add(
      { kind: 'column', table: 'users', column: 'email' },
      'Second', 'bug',
    );
    const cols = [new ColumnItem(makeColumn('email', 'TEXT'), 'users')];
    decorateColumnItems(cols, 'users', store);
    const desc = cols[0].description as string;
    assert.ok(desc.includes('First'));
    assert.ok(desc.includes('+1 more'));
  });

  it('should not decorate when annotationStore is undefined', () => {
    const cols = [new ColumnItem(makeColumn('email'), 'users')];
    const origDesc = cols[0].description;
    decorateColumnItems(cols, 'users', undefined);
    assert.strictEqual(cols[0].description, origDesc);
  });

  it('should not decorate columns from a different table', () => {
    store.add(
      { kind: 'column', table: 'orders', column: 'email' },
      'Wrong table', 'bug',
    );
    const cols = [new ColumnItem(makeColumn('email'), 'users')];
    const origDesc = cols[0].description;
    decorateColumnItems(cols, 'users', store);
    // Annotation is on 'orders.email', not 'users.email'
    assert.strictEqual(cols[0].description, origDesc);
  });
});
