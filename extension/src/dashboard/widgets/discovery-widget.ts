/**
 * Feature Discovery widget for the dashboard.
 * Renders category cards with descriptions and command buttons so users
 * can explore the full extension capability set from a single panel.
 * Card buttons use the existing 'executeAction' message handler.
 */

import type { IWidgetDefinition } from '../dashboard-types';
import { escapeHtml } from '../dashboard-types';

const esc = escapeHtml;

// ── Category data ─────────────────────────────────────────────────────

interface DiscoveryCommand {
  label: string;
  commandId: string;
  description: string;
}

interface DiscoveryCategory {
  name: string;
  icon: string;
  description: string;
  commands: DiscoveryCommand[];
}

const CATEGORIES: DiscoveryCategory[] = [
  {
    name: 'Schema & Migrations',
    icon: '\u{1F504}',
    description: 'Compare schemas, generate migrations, and manage database evolution.',
    commands: [
      { label: 'Schema Diff', commandId: 'driftViewer.schemaDiff', description: 'Code vs runtime' },
      { label: 'Generate Migration', commandId: 'driftViewer.generateMigration', description: 'Dart migration code' },
      { label: 'Generate Rollback', commandId: 'driftViewer.generateRollback', description: 'Reverse a migration' },
      { label: 'Generate Dart', commandId: 'driftViewer.generateDart', description: 'Dart from live schema' },
    ],
  },
  {
    name: 'Health & Quality',
    icon: '\u2764\uFE0F',
    description: 'Assess database health, detect anomalies, and optimise queries.',
    commands: [
      { label: 'Health Score', commandId: 'driftViewer.healthScore', description: 'Overall health grade' },
      { label: 'Anomaly Detection', commandId: 'driftViewer.showAnomalies', description: 'FK violations, duplicates' },
      { label: 'Query Cost', commandId: 'driftViewer.analyzeQueryCost', description: 'EXPLAIN analysis' },
      { label: 'Invariants', commandId: 'driftViewer.manageInvariants', description: 'Data integrity rules' },
    ],
  },
  {
    name: 'Data Management',
    icon: '\u{1F4BE}',
    description: 'Seed test data, import/export datasets, and manage table contents.',
    commands: [
      { label: 'Seed Data', commandId: 'driftViewer.seedAllTables', description: 'Generate test rows' },
      { label: 'Import Dataset', commandId: 'driftViewer.importDataset', description: 'Load JSON data' },
      { label: 'Export Dataset', commandId: 'driftViewer.exportDataset', description: 'Save as JSON' },
      { label: 'Download DB', commandId: 'driftViewer.downloadDatabase', description: 'SQLite file' },
    ],
  },
  {
    name: 'Visualization',
    icon: '\u{1F4CA}',
    description: 'Visualise your schema, relationships, and documentation.',
    commands: [
      { label: 'ER Diagram', commandId: 'driftViewer.showErDiagram', description: 'Entity relationships' },
      { label: 'Schema Docs', commandId: 'driftViewer.generateSchemaDocs', description: 'Auto documentation' },
    ],
  },
  {
    name: 'Tools',
    icon: '\u{1F527}',
    description: 'SQL console, snippet library, cross-table search, and more.',
    commands: [
      { label: 'SQL Notebook', commandId: 'driftViewer.openSqlNotebook', description: 'Interactive console' },
      { label: 'Global Search', commandId: 'driftViewer.globalSearch', description: 'Search all tables' },
      { label: 'Snippet Library', commandId: 'driftViewer.openSnippetLibrary', description: 'Saved queries' },
      { label: 'Isar Converter', commandId: 'driftViewer.isarToDrift', description: 'Isar to Drift' },
    ],
  },
];

// ── HTML renderer ─────────────────────────────────────────────────────

/** Build an HTML card for a single command button. */
function renderButton(cmd: DiscoveryCommand): string {
  // The dashboard message handler already supports 'executeAction' messages
  return `<button class="discovery-btn" onclick="vscode.postMessage({command:'executeAction',actionCommand:'${esc(cmd.commandId)}'})"`
    + ` title="${esc(cmd.description)}">${esc(cmd.label)}</button>`;
}

/** Build an HTML card for a single category. */
function renderCategory(cat: DiscoveryCategory): string {
  const buttons = cat.commands.map(renderButton).join('');
  return `<div class="discovery-card">
    <div class="discovery-header">${cat.icon} <strong>${esc(cat.name)}</strong></div>
    <div class="discovery-desc">${esc(cat.description)}</div>
    <div class="discovery-actions">${buttons}</div>
  </div>`;
}

/** Build the full feature discovery HTML (static content, no fetch needed). */
function renderDiscoveryHtml(): string {
  const cards = CATEGORIES.map(renderCategory).join('');
  return `<style>
    .discovery-grid { display:grid; grid-template-columns:repeat(auto-fill,minmax(220px,1fr)); gap:12px; padding:8px 0; }
    .discovery-card { background:var(--vscode-editor-background); border:1px solid var(--vscode-panel-border);
      border-radius:6px; padding:12px; }
    .discovery-header { font-size:14px; margin-bottom:6px; }
    .discovery-desc { font-size:12px; color:var(--vscode-descriptionForeground); margin-bottom:10px; }
    .discovery-actions { display:flex; flex-wrap:wrap; gap:6px; }
    .discovery-btn { background:var(--vscode-button-secondaryBackground); color:var(--vscode-button-secondaryForeground);
      border:none; border-radius:3px; padding:4px 8px; font-size:11px; cursor:pointer; }
    .discovery-btn:hover { background:var(--vscode-button-secondaryHoverBackground); }
  </style>
  <div class="discovery-grid">${cards}</div>`;
}

// ── Widget definition ─────────────────────────────────────────────────

export const DISCOVERY_WIDGETS: IWidgetDefinition[] = [
  {
    type: 'featureDiscovery',
    label: 'Feature Discovery',
    icon: '\u{1F9ED}',
    description: 'Browse all Drift Advisor features by category',
    defaultSize: { w: 4, h: 3 },
    configSchema: [],
    // Static content — no API call needed
    fetchData: async () => null,
    renderHtml: () => renderDiscoveryHtml(),
  },
];
