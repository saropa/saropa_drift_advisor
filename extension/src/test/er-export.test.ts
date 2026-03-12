import * as assert from 'assert';
import { ErExport } from '../er-diagram/er-export';
import type { IErNode, IErEdge } from '../er-diagram/er-diagram-types';

describe('ErExport', () => {
  const exporter = new ErExport();

  const sampleNodes: IErNode[] = [
    {
      table: 'users',
      x: 50,
      y: 50,
      width: 180,
      height: 92,
      columns: [
        { name: 'id', type: 'INTEGER', pk: true, fk: false, nullable: false },
        { name: 'name', type: 'TEXT', pk: false, fk: false, nullable: false },
        { name: 'email', type: 'TEXT', pk: false, fk: false, nullable: true },
      ],
      rowCount: 42,
    },
    {
      table: 'posts',
      x: 300,
      y: 50,
      width: 180,
      height: 72,
      columns: [
        { name: 'id', type: 'INTEGER', pk: true, fk: false, nullable: false },
        { name: 'user_id', type: 'INTEGER', pk: false, fk: true, nullable: false },
      ],
      rowCount: 128,
    },
  ];

  const sampleEdges: IErEdge[] = [
    {
      from: { table: 'posts', column: 'user_id' },
      to: { table: 'users', column: 'id' },
    },
  ];

  describe('toSvg()', () => {
    it('returns valid SVG for empty nodes', () => {
      const svg = exporter.toSvg([], []);
      assert.ok(svg.startsWith('<?xml'));
      assert.ok(svg.includes('<svg'));
      assert.ok(svg.includes('</svg>'));
    });

    it('produces valid XML structure', () => {
      const svg = exporter.toSvg(sampleNodes, sampleEdges);
      assert.ok(svg.startsWith('<?xml version="1.0"'));
      assert.ok(svg.includes('xmlns="http://www.w3.org/2000/svg"'));
    });

    it('includes all tables as groups', () => {
      const svg = exporter.toSvg(sampleNodes, sampleEdges);
      assert.ok(svg.includes('class="er-node"'));
      assert.ok(svg.includes('users (42)'));
      assert.ok(svg.includes('posts (128)'));
    });

    it('includes relationship edges', () => {
      const svg = exporter.toSvg(sampleNodes, sampleEdges);
      assert.ok(svg.includes('class="er-edge"'));
      assert.ok(svg.includes('marker-end="url(#arrowhead)"'));
    });

    it('includes column information with PK/FK markers', () => {
      const svg = exporter.toSvg(sampleNodes, sampleEdges);
      assert.ok(svg.includes('🔑'));
      assert.ok(svg.includes('🔗'));
      assert.ok(svg.includes('class="er-column pk"'));
      assert.ok(svg.includes('class="er-column fk"'));
    });

    it('escapes special characters in table names', () => {
      const nodesWithSpecial: IErNode[] = [{
        table: 'users<test>',
        x: 50, y: 50, width: 180, height: 52,
        columns: [{ name: 'id', type: 'INTEGER', pk: true, fk: false, nullable: false }],
        rowCount: 1,
      }];
      const svg = exporter.toSvg(nodesWithSpecial, []);
      assert.ok(svg.includes('users&lt;test&gt;'));
      assert.ok(!svg.includes('users<test>'));
    });

    it('calculates viewBox from node positions', () => {
      const svg = exporter.toSvg(sampleNodes, sampleEdges);
      // Should have viewBox that encompasses all nodes
      assert.ok(svg.includes('viewBox="0 0'));
    });
  });

  describe('toMermaid()', () => {
    it('starts with erDiagram declaration', () => {
      const mermaid = exporter.toMermaid(sampleNodes, sampleEdges);
      assert.ok(mermaid.startsWith('erDiagram'));
    });

    it('includes all tables with columns', () => {
      const mermaid = exporter.toMermaid(sampleNodes, sampleEdges);
      assert.ok(mermaid.includes('users {'));
      assert.ok(mermaid.includes('posts {'));
      assert.ok(mermaid.includes('INTEGER id PK'));
      assert.ok(mermaid.includes('TEXT name'));
    });

    it('marks FK columns', () => {
      const mermaid = exporter.toMermaid(sampleNodes, sampleEdges);
      assert.ok(mermaid.includes('INTEGER user_id FK'));
    });

    it('includes relationship syntax', () => {
      const mermaid = exporter.toMermaid(sampleNodes, sampleEdges);
      assert.ok(mermaid.includes('users ||--o{ posts'));
      assert.ok(mermaid.includes('"user_id"'));
    });

    it('sanitizes table names with special characters', () => {
      const nodesWithSpecial: IErNode[] = [{
        table: 'user-data',
        x: 50, y: 50, width: 180, height: 52,
        columns: [{ name: 'id', type: 'INTEGER', pk: true, fk: false, nullable: false }],
        rowCount: 1,
      }];
      const mermaid = exporter.toMermaid(nodesWithSpecial, []);
      assert.ok(mermaid.includes('user_data {'));
    });

    it('handles empty nodes', () => {
      const mermaid = exporter.toMermaid([], []);
      assert.strictEqual(mermaid, 'erDiagram');
    });
  });
});
