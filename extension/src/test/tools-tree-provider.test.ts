/**
 * Tests for the slimmed "Drift Tools" launcher tree provider.
 * The full per-tool catalog moved to the Drift Tools Hub webview; this docked
 * view is now just a launcher: a Hub entry, the package-setup gate, and a
 * connection-status row. Covers root contents, the gate's install-state
 * visibility, the always-clickable Hub entry, and connection-status wiring.
 */

import * as assert from 'assert';
import {
  ToolsTreeProvider,
  ToolLauncherItem,
  ToolCommandItem,
  ToolsStatusItem,
} from '../tree/tools-tree-provider';

/** TreeItem.label normalized to string for assertions. */
function label(node: { label?: unknown }): string {
  return typeof node.label === 'string' ? node.label : (node.label as { label?: string })?.label ?? '';
}

describe('ToolsTreeProvider (slim launcher)', () => {
  let provider: ToolsTreeProvider;

  beforeEach(() => {
    provider = new ToolsTreeProvider('1.2.3');
  });

  describe('getChildren() — root', () => {
    it('leads with the Drift Tools Hub launcher entry', () => {
      const children = provider.getChildren();
      const hub = children[0];
      assert.ok(hub instanceof ToolLauncherItem, 'first item is the Hub launcher');
      assert.strictEqual((hub as ToolLauncherItem).commandId, 'driftViewer.openDriftToolsHub');
    });

    it('shows the extension version on the Hub entry', () => {
      const hub = provider.getChildren()[0] as ToolLauncherItem;
      assert.ok((hub.description as string)?.includes('1.2.3'));
    });

    it('ends with a connection-status row', () => {
      const children = provider.getChildren();
      const last = children[children.length - 1];
      assert.ok(last instanceof ToolsStatusItem);
    });

    it('is a flat list — non-root elements have no children', () => {
      const root = provider.getChildren();
      assert.deepStrictEqual(provider.getChildren(root[0]), []);
    });
  });

  describe('package-setup gate', () => {
    it('shows Add Package when the package is not installed', () => {
      provider.setPackageInstalled(false);
      const items = provider.getChildren() as ToolCommandItem[];
      const addPkg = items.find((t) => (t as ToolCommandItem).commandId === 'driftViewer.addPackageToProject');
      assert.ok(addPkg, 'Add Package should be visible when not installed');
    });

    it('hides Add Package when the package is installed', () => {
      provider.setPackageInstalled(true);
      const items = provider.getChildren();
      const addPkg = items.find(
        (t) => t instanceof ToolCommandItem && t.commandId === 'driftViewer.addPackageToProject',
      );
      assert.strictEqual(addPkg, undefined, 'Add Package should be hidden when installed');
    });
  });

  describe('Hub entry is always clickable', () => {
    it('wires the open-Hub command even when disconnected', () => {
      provider.setConnected(false);
      const hub = provider.getTreeItem(provider.getChildren()[0]) as ToolLauncherItem;
      assert.ok(hub.command, 'Hub launcher should always be clickable');
      assert.strictEqual(hub.command!.command, 'driftViewer.openDriftToolsHub');
    });
  });

  describe('connection-status row', () => {
    it('offers connection help when disconnected', () => {
      provider.setConnected(false);
      const status = provider.getChildren().find((n) => n instanceof ToolsStatusItem) as ToolsStatusItem;
      assert.strictEqual(label(status), 'Not connected');
      assert.strictEqual(status.command?.command, 'driftViewer.showTroubleshooting');
    });

    it('reads as connected (no help command) when connected', () => {
      provider.setConnected(true);
      const status = provider.getChildren().find((n) => n instanceof ToolsStatusItem) as ToolsStatusItem;
      assert.strictEqual(label(status), 'Connected');
      assert.strictEqual(status.command, undefined);
    });
  });

  describe('refresh()', () => {
    it('fires onDidChangeTreeData when refresh is called', () => {
      let fired = false;
      provider.onDidChangeTreeData(() => { fired = true; });
      provider.refresh();
      assert.strictEqual(fired, true);
    });
  });
});
