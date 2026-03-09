import * as assert from 'assert';
import {
  buildExplainTree,
  classifyScanType,
  ExplainPanel,
  findScannedTables,
} from '../explain/explain-panel';
import { buildPlanText } from '../explain/explain-html';
import { resetMocks, createdPanels, clipboardMock } from './vscode-mock';

function latestPanel() {
  return createdPanels[createdPanels.length - 1];
}

describe('classifyScanType', () => {
  it('should classify SEARCH as search', () => {
    assert.strictEqual(
      classifyScanType('SEARCH TABLE users USING INDEX idx (id=?)'),
      'search',
    );
  });

  it('should classify SCAN TABLE as scan', () => {
    assert.strictEqual(
      classifyScanType('SCAN TABLE posts'),
      'scan',
    );
  });

  it('should classify SCAN SUBQUERY as scan', () => {
    assert.strictEqual(
      classifyScanType('SCAN SUBQUERY 1'),
      'scan',
    );
  });

  it('should classify USE TEMP B-TREE as temp', () => {
    assert.strictEqual(
      classifyScanType('USE TEMP B-TREE FOR ORDER BY'),
      'temp',
    );
  });

  it('should classify unknown detail as other', () => {
    assert.strictEqual(
      classifyScanType('COMPOUND SUBQUERIES 1 AND 2'),
      'other',
    );
  });
});

describe('buildExplainTree', () => {
  it('should build a flat list from rows with no parent', () => {
    const rows = [
      { id: 2, parent: 0, notused: 0, detail: 'SCAN TABLE users' },
    ];
    const tree = buildExplainTree(rows);
    assert.strictEqual(tree.length, 1);
    assert.strictEqual(tree[0].detail, 'SCAN TABLE users');
    assert.strictEqual(tree[0].scanType, 'scan');
  });

  it('should build a nested tree from parent-child rows', () => {
    const rows = [
      { id: 3, parent: 0, notused: 0, detail: 'SEARCH TABLE users USING INDEX idx_email (email=?)' },
      { id: 5, parent: 3, notused: 0, detail: 'SCAN TABLE posts' },
    ];
    const tree = buildExplainTree(rows);
    assert.strictEqual(tree.length, 1);
    assert.strictEqual(tree[0].children.length, 1);
    assert.strictEqual(tree[0].children[0].scanType, 'scan');
  });

  it('should handle empty rows', () => {
    const tree = buildExplainTree([]);
    assert.strictEqual(tree.length, 0);
  });

  it('should handle multiple roots', () => {
    const rows = [
      { id: 2, parent: 0, notused: 0, detail: 'SCAN TABLE a' },
      { id: 3, parent: 0, notused: 0, detail: 'SCAN TABLE b' },
    ];
    const tree = buildExplainTree(rows);
    assert.strictEqual(tree.length, 2);
  });
});

describe('findScannedTables', () => {
  it('should return table names with full scans', () => {
    const tree = buildExplainTree([
      { id: 2, parent: 0, notused: 0, detail: 'SEARCH TABLE users USING INDEX idx' },
      { id: 3, parent: 0, notused: 0, detail: 'SCAN TABLE posts' },
    ]);
    const scanned = findScannedTables(tree);
    assert.deepStrictEqual(scanned, ['posts']);
  });

  it('should find nested scanned tables', () => {
    const tree = buildExplainTree([
      { id: 2, parent: 0, notused: 0, detail: 'SEARCH TABLE users USING INDEX' },
      { id: 3, parent: 2, notused: 0, detail: 'SCAN TABLE orders' },
    ]);
    const scanned = findScannedTables(tree);
    assert.deepStrictEqual(scanned, ['orders']);
  });
});

describe('buildPlanText', () => {
  it('should render a readable text tree', () => {
    const tree = buildExplainTree([
      { id: 2, parent: 0, notused: 0, detail: 'SEARCH TABLE users USING INDEX' },
      { id: 3, parent: 2, notused: 0, detail: 'SCAN TABLE posts' },
    ]);
    const text = buildPlanText(tree);
    assert.ok(text.includes('SEARCH TABLE users'));
    assert.ok(text.includes('  SCAN TABLE posts'));
  });
});

describe('ExplainPanel', () => {
  beforeEach(() => {
    resetMocks();
    // Clear singleton
    (ExplainPanel as any)._currentPanel = undefined;
  });

  it('should create a webview panel with explain HTML', () => {
    const result = {
      rows: [
        { id: 2, parent: 0, notused: 0, detail: 'SCAN TABLE users' },
      ],
      sql: 'EXPLAIN QUERY PLAN SELECT * FROM users',
    };
    ExplainPanel.createOrShow('SELECT * FROM users', result, []);
    assert.strictEqual(createdPanels.length, 1);
    const html = latestPanel().webview.html;
    assert.ok(html.includes('Query Plan'));
    assert.ok(html.includes('SCAN TABLE users'));
    assert.ok(html.includes('FULL SCAN'));
  });

  it('should reuse existing panel on second call', () => {
    const result = {
      rows: [{ id: 2, parent: 0, notused: 0, detail: 'SCAN TABLE a' }],
      sql: 'EXPLAIN QUERY PLAN SELECT * FROM a',
    };
    ExplainPanel.createOrShow('SELECT * FROM a', result, []);
    ExplainPanel.createOrShow('SELECT * FROM b', result, []);
    assert.strictEqual(createdPanels.length, 1);
  });

  it('should show index suggestions for scanned tables', () => {
    const result = {
      rows: [
        { id: 2, parent: 0, notused: 0, detail: 'SCAN TABLE orders' },
      ],
      sql: 'EXPLAIN QUERY PLAN SELECT * FROM orders',
    };
    const suggestions = [
      {
        table: 'orders',
        column: 'user_id',
        reason: 'Foreign key without index',
        sql: 'CREATE INDEX idx_orders_user_id ON orders(user_id)',
        priority: 'high' as const,
      },
      {
        table: 'users',
        column: 'email',
        reason: 'Unrelated table',
        sql: 'CREATE INDEX idx_users_email ON users(email)',
        priority: 'low' as const,
      },
    ];
    ExplainPanel.createOrShow('SELECT * FROM orders', result, suggestions);
    const html = latestPanel().webview.html;
    // Should show suggestion for orders but not users
    assert.ok(html.includes('idx_orders_user_id'));
    assert.ok(!html.includes('idx_users_email'));
  });

  it('should copy SQL on copySql message', async () => {
    const result = {
      rows: [{ id: 2, parent: 0, notused: 0, detail: 'SCAN TABLE x' }],
      sql: 'EXPLAIN QUERY PLAN SELECT 1',
    };
    ExplainPanel.createOrShow('SELECT 1', result, []);
    clipboardMock.reset();
    latestPanel().webview.simulateMessage({ command: 'copySql' });
    assert.strictEqual(clipboardMock.text, 'SELECT 1');
  });

  it('should copy plan text on copyPlan message', async () => {
    const result = {
      rows: [{ id: 2, parent: 0, notused: 0, detail: 'SCAN TABLE y' }],
      sql: 'EXPLAIN QUERY PLAN SELECT 1',
    };
    ExplainPanel.createOrShow('SELECT 1', result, []);
    clipboardMock.reset();
    latestPanel().webview.simulateMessage({ command: 'copyPlan' });
    assert.ok(clipboardMock.text?.includes('SCAN TABLE y'));
  });

  it('should copy suggestion SQL on copySuggestion message', () => {
    const result = {
      rows: [
        { id: 2, parent: 0, notused: 0, detail: 'SCAN TABLE items' },
      ],
      sql: 'EXPLAIN QUERY PLAN SELECT * FROM items',
    };
    const suggestions = [
      {
        table: 'items',
        column: 'category',
        reason: 'test',
        sql: 'CREATE INDEX idx ON items(category)',
        priority: 'high' as const,
      },
    ];
    ExplainPanel.createOrShow('SELECT * FROM items', result, suggestions);
    clipboardMock.reset();
    latestPanel().webview.simulateMessage({
      command: 'copySuggestion', index: 0,
    });
    assert.strictEqual(
      clipboardMock.text,
      'CREATE INDEX idx ON items(category)',
    );
  });
});
