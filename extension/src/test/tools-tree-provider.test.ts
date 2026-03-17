/**
 * Tests for the Drift Tools tree view provider.
 * Covers root/children, connection state (enabled/disabled items), and
 * package-installed state (Add Package visibility).
 */

import * as assert from 'assert';
import { ToolsTreeProvider, ToolCategoryItem, ToolCommandItem } from '../tree/tools-tree-provider';

/** TreeItem.label can be string or TreeItemLabel; normalize to string for assertions. */
function categoryLabel(c: ToolCategoryItem): string {
  return typeof c.label === 'string' ? c.label : (c.label as { label?: string })?.label ?? '';
}

/** Find root category whose label contains the given substring. */
function findCategory(provider: ToolsTreeProvider, labelSubstring: string): ToolCategoryItem | undefined {
  const children = provider.getChildren() as ToolCategoryItem[];
  return children.find((c) => categoryLabel(c).includes(labelSubstring));
}

describe('ToolsTreeProvider', () => {
  let provider: ToolsTreeProvider;

  beforeEach(() => {
    provider = new ToolsTreeProvider('1.2.3');
  });

  describe('getChildren() — root', () => {
    it('should return category items at root', () => {
      const children = provider.getChildren();
      assert.ok(children.length > 0);
      for (const c of children) {
        assert.ok(c instanceof ToolCategoryItem);
      }
    });

    it('should include Getting Started, Schema & Migrations, Health, Data, Visualization, Tools', () => {
      const children = provider.getChildren() as ToolCategoryItem[];
      const labels = children.map(categoryLabel);
      assert.ok(labels.some((l) => l.includes('Getting Started')));
      assert.ok(labels.some((l) => l.includes('Schema')));
      assert.ok(labels.some((l) => l.includes('Health')));
      assert.ok(labels.some((l) => l.includes('Data Management')));
      assert.ok(labels.some((l) => l.includes('Visualization')));
      assert.ok(labels.some((l) => l.includes('Tools')));
    });

    it('should include Toggle Polling under Tools', () => {
      const toolsCategory = findCategory(provider, 'Tools');
      assert.ok(toolsCategory);
      const tools = provider.getChildren(toolsCategory) as ToolCommandItem[];
      const togglePolling = tools.find((t) => t.commandId === 'driftViewer.togglePolling');
      assert.ok(togglePolling);
    });

    it('should show Add Package when package not installed', () => {
      provider.setPackageInstalled(false);
      const gettingStarted = findCategory(provider, 'Getting Started');
      assert.ok(gettingStarted);
      const items = provider.getChildren(gettingStarted) as ToolCommandItem[];
      const addPkg = items.find((t) => t.commandId === 'driftViewer.addPackageToProject');
      assert.ok(addPkg, 'Add Package should be visible when not installed');
    });

    it('should hide Add Package when package is installed', () => {
      provider.setPackageInstalled(true);
      const gettingStarted = findCategory(provider, 'Getting Started');
      assert.ok(gettingStarted);
      const items = provider.getChildren(gettingStarted) as ToolCommandItem[];
      const addPkg = items.find((t) => t.commandId === 'driftViewer.addPackageToProject');
      assert.strictEqual(addPkg, undefined, 'Add Package should be hidden when installed');
    });
  });

  describe('getChildren() — category', () => {
    it('should return tool command items for a category', () => {
      const root = provider.getChildren() as ToolCategoryItem[];
      const firstCategory = root[0];
      const items = provider.getChildren(firstCategory);
      assert.ok(items.length > 0);
      for (const item of items) {
        assert.ok(item instanceof ToolCommandItem);
      }
    });

    it('should return empty array for non-category element', () => {
      const root = provider.getChildren() as ToolCategoryItem[];
      const firstCategory = root[0];
      const items = provider.getChildren(firstCategory);
      const leaf = items[0];
      const empty = provider.getChildren(leaf);
      assert.deepStrictEqual(empty, []);
    });
  });

  describe('getTreeItem() — connection state', () => {
    it('should apply disabled state to connection-required items when disconnected', () => {
      provider.setConnected(false);
      const toolsCategory = findCategory(provider, 'Tools');
      const tools = provider.getChildren(toolsCategory!) as ToolCommandItem[];
      const togglePolling = tools.find((t) => t.commandId === 'driftViewer.togglePolling');
      assert.ok(togglePolling?.requiresConnection);
      const item = provider.getTreeItem(togglePolling!);
      assert.strictEqual(item.command, undefined, 'command should be cleared when disabled');
      assert.ok(
        (item.description as string)?.includes('not connected'),
        'should show (not connected)',
      );
    });

    it('should apply enabled state to connection-required items when connected', () => {
      provider.setConnected(true);
      const toolsCategory = findCategory(provider, 'Tools');
      const tools = provider.getChildren(toolsCategory!) as ToolCommandItem[];
      const togglePolling = tools.find((t) => t.commandId === 'driftViewer.togglePolling');
      const item = provider.getTreeItem(togglePolling!);
      assert.ok(item.command, 'command should be set when connected');
      assert.strictEqual(item.command!.command, 'driftViewer.togglePolling');
    });

    it('should leave About command enabled when disconnected', () => {
      provider.setConnected(false);
      const gettingStarted = findCategory(provider, 'Getting Started');
      const items = provider.getChildren(gettingStarted!) as ToolCommandItem[];
      const about = items.find((t) => t.commandId === 'driftViewer.about');
      assert.ok(about && !about.requiresConnection);
      const item = provider.getTreeItem(about!);
      assert.ok(item.command, 'About should always be clickable');
    });
  });

  describe('refresh()', () => {
    it('should fire onDidChangeTreeData when refresh is called', () => {
      let fired = false;
      provider.onDidChangeTreeData(() => { fired = true; });
      provider.refresh();
      assert.strictEqual(fired, true);
    });
  });

  describe('version in label', () => {
    it('should include extension version in About item', () => {
      const providerWithVersion = new ToolsTreeProvider('2.0.0');
      const gettingStarted = findCategory(providerWithVersion, 'Getting Started');
      const items = providerWithVersion.getChildren(gettingStarted!) as ToolCommandItem[];
      const about = items.find((t) => t.commandId === 'driftViewer.about');
      assert.ok(about);
      assert.ok((about.label as string).includes('2.0.0'));
    });
  });
});
