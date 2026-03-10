import * as assert from 'assert';
import { ChangelogRenderer } from '../changelog/changelog-renderer';
import type { IChangelog } from '../changelog/changelog-types';

function baseChangelog(
  overrides?: Partial<IChangelog>,
): IChangelog {
  return {
    fromSnapshot: { name: 'snap-a', timestamp: '2026-03-10 10:00' },
    toSnapshot: { name: 'snap-b', timestamp: '2026-03-10 10:15' },
    entries: [],
    unchangedTables: [],
    summary: {
      totalInserts: 0,
      totalUpdates: 0,
      totalDeletes: 0,
      tablesChanged: 0,
      tablesUnchanged: 0,
    },
    ...overrides,
  };
}

function render(cl: IChangelog): string {
  return new ChangelogRenderer().render(cl);
}

describe('ChangelogRenderer', () => {
  it('should render correct header', () => {
    const md = render(baseChangelog());
    assert.ok(md.includes('# Database Changelog'));
    assert.ok(md.includes('**From:** Snapshot "snap-a" (2026-03-10 10:00)'));
    assert.ok(md.includes('**To:** Snapshot "snap-b" (2026-03-10 10:15)'));
  });

  it('should render "No changes detected" for empty changelog', () => {
    const md = render(baseChangelog());
    assert.ok(md.includes('No changes detected.'));
    assert.ok(!md.includes('## Changes by Table'));
  });

  it('should render summary counts', () => {
    const md = render(
      baseChangelog({
        entries: [
          {
            table: 'users',
            inserts: [{ pk: 1, preview: { id: 1, name: 'A' } }],
            updates: [],
            deletes: [],
          },
        ],
        summary: {
          totalInserts: 1,
          totalUpdates: 0,
          totalDeletes: 0,
          tablesChanged: 1,
          tablesUnchanged: 2,
        },
      }),
    );

    assert.ok(md.includes('**1 insert(s)** across 1 table(s)'));
    assert.ok(md.includes('**2 table(s)** unchanged'));
    assert.ok(!md.includes('update(s)'));
    assert.ok(!md.includes('delete(s)'));
  });

  it('should render insert section with preview', () => {
    const md = render(
      baseChangelog({
        entries: [
          {
            table: 'users',
            inserts: [{ pk: 1, preview: { id: 1, name: 'Alice' } }],
            updates: [],
            deletes: [],
          },
        ],
        summary: {
          totalInserts: 1,
          totalUpdates: 0,
          totalDeletes: 0,
          tablesChanged: 1,
          tablesUnchanged: 0,
        },
      }),
    );

    assert.ok(md.includes('### users — 1 change(s)'));
    assert.ok(md.includes('**1 row(s) created:**'));
    assert.ok(md.includes('id=1, name="Alice"'));
  });

  it('should render single update with per-row detail', () => {
    const md = render(
      baseChangelog({
        entries: [
          {
            table: 'users',
            inserts: [],
            updates: [
              {
                pk: 42,
                changes: [
                  { column: 'name', oldValue: 'Alice', newValue: 'Alice Smith' },
                ],
              },
            ],
            deletes: [],
          },
        ],
        summary: {
          totalInserts: 0,
          totalUpdates: 1,
          totalDeletes: 0,
          tablesChanged: 1,
          tablesUnchanged: 0,
        },
      }),
    );

    assert.ok(
      md.includes(
        '**1 row updated:** id=42: `name` changed from "Alice" → "Alice Smith"',
      ),
    );
  });

  it('should group identical updates', () => {
    const md = render(
      baseChangelog({
        entries: [
          {
            table: 'orders',
            inserts: [],
            updates: [
              {
                pk: 1,
                changes: [{ column: 'status', oldValue: 'pending', newValue: 'shipped' }],
              },
              {
                pk: 2,
                changes: [{ column: 'status', oldValue: 'pending', newValue: 'shipped' }],
              },
              {
                pk: 3,
                changes: [{ column: 'status', oldValue: 'pending', newValue: 'shipped' }],
              },
            ],
            deletes: [],
          },
        ],
        summary: {
          totalInserts: 0,
          totalUpdates: 3,
          totalDeletes: 0,
          tablesChanged: 1,
          tablesUnchanged: 0,
        },
      }),
    );

    assert.ok(
      md.includes(
        '**3 rows updated:** `status` "pending" → "shipped" (ids: 1, 2, 3)',
      ),
    );
  });

  it('should render delete section with preview', () => {
    const md = render(
      baseChangelog({
        entries: [
          {
            table: 'products',
            inserts: [],
            updates: [],
            deletes: [
              { pk: 7, preview: { id: 7, name: 'Widget', price: 29.99 } },
            ],
          },
        ],
        summary: {
          totalInserts: 0,
          totalUpdates: 0,
          totalDeletes: 1,
          tablesChanged: 1,
          tablesUnchanged: 0,
        },
      }),
    );

    assert.ok(md.includes('**1 row(s) deleted:**'));
    assert.ok(md.includes('id=7, name="Widget", price=29.99'));
  });

  it('should truncate long insert lists at 10', () => {
    const inserts = Array.from({ length: 15 }, (_, i) => ({
      pk: i,
      preview: { id: i },
    }));
    const md = render(
      baseChangelog({
        entries: [
          { table: 'big', inserts, updates: [], deletes: [] },
        ],
        summary: {
          totalInserts: 15,
          totalUpdates: 0,
          totalDeletes: 0,
          tablesChanged: 1,
          tablesUnchanged: 0,
        },
      }),
    );

    assert.ok(md.includes('… and 5 more'));
    // Count "  - id=" lines (should be exactly 10)
    const previewLines = md.split('\n').filter((l) => l.startsWith('  - id='));
    assert.strictEqual(previewLines.length, 10);
  });

  it('should render NULL values', () => {
    const md = render(
      baseChangelog({
        entries: [
          {
            table: 'data',
            inserts: [{ pk: 1, preview: { id: 1, val: null } }],
            updates: [],
            deletes: [],
          },
        ],
        summary: {
          totalInserts: 1,
          totalUpdates: 0,
          totalDeletes: 0,
          tablesChanged: 1,
          tablesUnchanged: 0,
        },
      }),
    );

    assert.ok(md.includes('val=NULL'));
  });

  it('should render unchanged tables at the end', () => {
    const md = render(
      baseChangelog({
        entries: [
          {
            table: 'users',
            inserts: [{ pk: 1, preview: { id: 1 } }],
            updates: [],
            deletes: [],
          },
        ],
        unchangedTables: ['sessions', 'audit_log'],
        summary: {
          totalInserts: 1,
          totalUpdates: 0,
          totalDeletes: 0,
          tablesChanged: 1,
          tablesUnchanged: 2,
        },
      }),
    );

    assert.ok(md.includes('### sessions, audit_log — no changes'));
  });

  it('should render string values with quotes', () => {
    const md = render(baseChangelog({
      entries: [{
        table: 't', inserts: [], deletes: [],
        updates: [{ pk: 1, changes: [{ column: 'name', oldValue: 'old', newValue: 'new' }] }],
      }],
      summary: { totalInserts: 0, totalUpdates: 1, totalDeletes: 0, tablesChanged: 1, tablesUnchanged: 0 },
    }));
    assert.ok(md.includes('"old" → "new"'));
  });

  it('should show all columns in grouped multi-column update', () => {
    const md = render(baseChangelog({
      entries: [{
        table: 'users', inserts: [], deletes: [],
        updates: [
          { pk: 1, changes: [{ column: 'name', oldValue: 'A', newValue: 'B' }, { column: 'role', oldValue: 'user', newValue: 'admin' }] },
          { pk: 2, changes: [{ column: 'name', oldValue: 'A', newValue: 'B' }, { column: 'role', oldValue: 'user', newValue: 'admin' }] },
        ],
      }],
      summary: { totalInserts: 0, totalUpdates: 2, totalDeletes: 0, tablesChanged: 1, tablesUnchanged: 0 },
    }));
    assert.ok(md.includes('`name`'));
    assert.ok(md.includes('`role`'));
    assert.ok(md.includes('(ids: 1, 2)'));
  });
});
