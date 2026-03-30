/**
 * Shared mock builders and realistic schema fixtures for tree-button
 * integration tests. Every button command in the Database Explorer must
 * produce visible output (toast, output channel line, webview panel, or
 * error message). These helpers let each test file construct the minimal
 * dependency set needed by registerNavCommands / registerRefreshTreeCommand /
 * registerTroubleshootingCommands without duplicating setup code.
 *
 * Pattern follows dashboard-commands.test.ts and android-forward.test.ts.
 */

import * as path from 'path';
import * as sinon from 'sinon';
import { Uri, MockMemento, MockOutputChannel } from './vscode-mock';
import type { TableMetadata } from '../api-types';

// ── Fake extension context ───────────────────────────────────────────

/** Minimal ExtensionContext stub for command registration tests. */
export function fakeContext(): {
  subscriptions: unknown[];
  workspaceState: MockMemento;
  extensionUri: ReturnType<typeof Uri.file>;
} {
  return {
    subscriptions: [],
    workspaceState: new MockMemento(),
    extensionUri: Uri.file(path.join(__dirname, '..')),
  } as any;
}

// ── Lightweight dependency stubs ─────────────────────────────────────
// Each returns only the surface area that the command handlers call.

/** ServerManager stub — selectServer(), activeServer, servers. */
export function mockServerManager(opts?: {
  activeServer?: { host: string; port: number };
  servers?: Array<{ host: string; port: number }>;
}): any {
  return {
    selectServer: sinon.stub().resolves(),
    activeServer: opts?.activeServer
      ? { ...opts.activeServer, firstSeen: 0, lastSeen: 0, missedPolls: 0 }
      : undefined,
    servers: (opts?.servers ?? []).map((s) => ({
      ...s,
      firstSeen: 0,
      lastSeen: 0,
      missedPolls: 0,
    })),
  };
}

/** ServerDiscovery stub — retry(), pause(), resume(), state, servers. */
export function mockDiscovery(): any {
  return {
    retry: sinon.stub(),
    pause: sinon.stub(),
    resume: sinon.stub(),
    state: 'searching' as const,
    servers: [],
  };
}

/** SchemaDiagnostics stub — refresh() is the only method nav-commands calls. */
export function mockLinter(): any {
  return { refresh: sinon.stub() };
}

/** EditingBridge stub — passed through to DriftViewerPanel, never called by nav-commands. */
export function mockEditingBridge(): any {
  return {};
}

/** FkNavigator stub — passed through, never called by nav-commands. */
export function mockFkNavigator(): any {
  return {};
}

/** FilterBridge stub — passed through, never called by nav-commands. */
export function mockFilterBridge(): any {
  return {};
}

/** SchemaSearchViewProvider stub — getDiagnosticState() for diagnoseConnection. */
export function mockSchemaSearchProvider(): any {
  return {
    getDiagnosticState: sinon.stub().returns({
      viewResolved: true,
      webviewReady: true,
      presentationConnected: true,
      presentationLabel: 'Connected',
      discoveryActivity: 'idle',
    }),
  };
}

/**
 * DriftTreeProvider stub for registerRefreshTreeCommand.
 * Set connected/offlineSchema to the post-refresh state the test expects.
 */
export function mockTreeProvider(opts?: {
  connected?: boolean;
  offlineSchema?: boolean;
}): any {
  return {
    refresh: sinon.stub().resolves(),
    connected: opts?.connected ?? false,
    offlineSchema: opts?.offlineSchema ?? false,
  };
}

/** Fresh MockOutputChannel for tracking output lines. */
export function mockConnectionChannel(): MockOutputChannel {
  return new MockOutputChannel('Saropa Drift Advisor');
}

// ── Realistic schema fixture ─────────────────────────────────────────

/**
 * 6-table e-commerce schema exercising every code path in tree rendering:
 * - All column types: INTEGER, TEXT, REAL, BLOB
 * - Primary keys, notnull
 * - Foreign keys including multi-FK join table
 * - Varied row counts (0 through 890)
 */
export const REALISTIC_SCHEMA: TableMetadata[] = [
  {
    name: 'users',
    columns: [
      { name: 'id', type: 'INTEGER', pk: true },
      { name: 'name', type: 'TEXT', pk: false },
      { name: 'email', type: 'TEXT', pk: false, notnull: true },
      { name: 'balance', type: 'REAL', pk: false },
    ],
    rowCount: 150,
  },
  {
    name: 'orders',
    columns: [
      { name: 'id', type: 'INTEGER', pk: true },
      { name: 'user_id', type: 'INTEGER', pk: false },
      { name: 'status', type: 'TEXT', pk: false },
      { name: 'receipt', type: 'BLOB', pk: false },
    ],
    rowCount: 420,
    foreignKeys: [{ fromColumn: 'user_id', toTable: 'users', toColumn: 'id' }],
  },
  {
    name: 'order_items',
    columns: [
      { name: 'id', type: 'INTEGER', pk: true },
      { name: 'order_id', type: 'INTEGER', pk: false },
      { name: 'product_id', type: 'INTEGER', pk: false },
      { name: 'quantity', type: 'INTEGER', pk: false },
    ],
    rowCount: 890,
    foreignKeys: [
      { fromColumn: 'order_id', toTable: 'orders', toColumn: 'id' },
      { fromColumn: 'product_id', toTable: 'products', toColumn: 'id' },
    ],
  },
  {
    name: 'products',
    columns: [
      { name: 'id', type: 'INTEGER', pk: true },
      { name: 'name', type: 'TEXT', pk: false, notnull: true },
      { name: 'price', type: 'REAL', pk: false },
      { name: 'description', type: 'TEXT', pk: false },
    ],
    rowCount: 75,
  },
  {
    name: 'categories',
    columns: [
      { name: 'id', type: 'INTEGER', pk: true },
      { name: 'name', type: 'TEXT', pk: false, notnull: true },
    ],
    rowCount: 12,
  },
  {
    name: 'product_categories',
    columns: [
      { name: 'product_id', type: 'INTEGER', pk: false },
      { name: 'category_id', type: 'INTEGER', pk: false },
    ],
    rowCount: 95,
    foreignKeys: [
      { fromColumn: 'product_id', toTable: 'products', toColumn: 'id' },
      { fromColumn: 'category_id', toTable: 'categories', toColumn: 'id' },
    ],
  },
];
