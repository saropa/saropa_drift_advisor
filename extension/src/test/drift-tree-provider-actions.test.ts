import * as assert from 'assert';
import * as fs from 'fs';
import * as path from 'path';
import {
  DisconnectedBannerItem,
  SchemaRestFailureBannerItem,
} from '../tree/tree-items';
import {
  getDisconnectedActions,
  getSchemaRestFailureActions,
} from '../tree/quick-action-items';

describe('DriftTreeProvider — action items and banner validation', () => {
  // ── Helper: load declared command IDs from package.json ──────────

  /** All command IDs declared in extension/package.json contributes.commands. */
  function loadDeclaredCommandIds(): Set<string> {
    // Compiled test lives at out/test/…, package.json is at extension root.
    const pkgPath = path.resolve(__dirname, '../../package.json');
    const raw = fs.readFileSync(pkgPath, 'utf-8');
    const pkg = JSON.parse(raw) as {
      contributes?: { commands?: { command: string }[] };
    };
    const cmds = pkg.contributes?.commands ?? [];
    return new Set(cmds.map((c) => c.command));
  }

  // ── Every ActionItem has a .command ──────────────────────────────

  it('every disconnected action must have a .command with a non-empty command ID', () => {
    const actions = getDisconnectedActions();
    assert.ok(actions.length > 0, 'getDisconnectedActions must not be empty');
    for (const action of actions) {
      assert.ok(
        action.command,
        `Disconnected action "${action.label}" is missing .command — it will do NOTHING when clicked`,
      );
      assert.ok(
        typeof action.command!.command === 'string' && action.command!.command.length > 0,
        `Disconnected action "${action.label}" has empty command ID`,
      );
    }
  });

  it('every REST-failure action must have a .command with a non-empty command ID', () => {
    const actions = getSchemaRestFailureActions();
    assert.ok(actions.length > 0, 'getSchemaRestFailureActions must not be empty');
    for (const action of actions) {
      assert.ok(
        action.command,
        `REST-failure action "${action.label}" is missing .command — it will do NOTHING when clicked`,
      );
      assert.ok(
        typeof action.command!.command === 'string' && action.command!.command.length > 0,
        `REST-failure action "${action.label}" has empty command ID`,
      );
    }
  });

  // ── Every ActionItem has an icon ─────────────────────────────────

  it('every disconnected action must have an icon (visible feedback)', () => {
    for (const action of getDisconnectedActions()) {
      assert.ok(
        action.iconPath,
        `Disconnected action "${action.label}" has no icon — invisible in the tree`,
      );
    }
  });

  it('every REST-failure action must have an icon', () => {
    for (const action of getSchemaRestFailureActions()) {
      assert.ok(
        action.iconPath,
        `REST-failure action "${action.label}" has no icon — invisible in the tree`,
      );
    }
  });

  // ── Command IDs declared in package.json ─────────────────────────

  it('every disconnected action command ID must be declared in package.json', () => {
    const declared = loadDeclaredCommandIds();
    for (const action of getDisconnectedActions()) {
      const id = action.command!.command;
      assert.ok(
        declared.has(id),
        `Disconnected action "${action.label}" uses command "${id}" which is NOT declared in `
        + 'package.json contributes.commands — VS Code will silently ignore it',
      );
    }
  });

  it('every REST-failure action command ID must be declared in package.json', () => {
    const declared = loadDeclaredCommandIds();
    for (const action of getSchemaRestFailureActions()) {
      const id = action.command!.command;
      assert.ok(
        declared.has(id),
        `REST-failure action "${action.label}" uses command "${id}" which is NOT declared in `
        + 'package.json contributes.commands — VS Code will silently ignore it',
      );
    }
  });

  // ── Banner items have user-visible guidance ──────────────────────

  it('DisconnectedBannerItem must have label, description, icon, and tooltip', () => {
    const banner = new DisconnectedBannerItem();
    assert.ok(banner.label, 'banner must have a label');
    assert.ok(banner.description, 'banner must have a description');
    assert.ok(banner.iconPath, 'banner must have an icon');
    assert.ok(banner.tooltip, 'banner must have a tooltip with guidance');
  });

  it('SchemaRestFailureBannerItem must have label, description, icon, and tooltip', () => {
    const banner = new SchemaRestFailureBannerItem();
    assert.ok(banner.label, 'banner must have a label');
    assert.ok(banner.description, 'banner must have a description');
    assert.ok(banner.iconPath, 'banner must have an icon');
    assert.ok(banner.tooltip, 'banner must have a tooltip with guidance');
  });

  // ── viewsWelcome parity: tree items cover the same commands ──────

  it('disconnected tree actions must cover all viewsWelcome disconnected command IDs', () => {
    // These are the command IDs from the package.json viewsWelcome entries for
    // the "not connected" state. If viewsWelcome is updated, this list must match.
    const viewsWelcomeDisconnectedCommandIds = [
      'driftViewer.openInBrowser',
      'driftViewer.showTroubleshooting',
      'driftViewer.showConnectionLog',
      'driftViewer.diagnoseConnection',
      'driftViewer.retryDiscovery',
      'driftViewer.refreshConnectionUi',
      'driftViewer.forwardPortAndroid',
      'driftViewer.selectServer',
    ];
    const treeCommandIds = new Set(
      getDisconnectedActions().map((a) => a.command!.command),
    );
    for (const id of viewsWelcomeDisconnectedCommandIds) {
      assert.ok(
        treeCommandIds.has(id),
        `viewsWelcome disconnected command "${id}" has no matching tree action — `
        + 'users in broken VS Code forks will have no way to trigger this command',
      );
    }
  });

  it('REST-failure tree actions must cover all viewsWelcome REST-failure command IDs', () => {
    const viewsWelcomeRestFailureCommandIds = [
      'driftViewer.refreshTree',
      'driftViewer.diagnoseConnection',
      'driftViewer.showTroubleshooting',
      'driftViewer.showConnectionLog',
      'driftViewer.openInBrowser',
      'driftViewer.selectServer',
      'driftViewer.openConnectionHelp',
    ];
    const treeCommandIds = new Set(
      getSchemaRestFailureActions().map((a) => a.command!.command),
    );
    for (const id of viewsWelcomeRestFailureCommandIds) {
      assert.ok(
        treeCommandIds.has(id),
        `viewsWelcome REST-failure command "${id}" has no matching tree action — `
        + 'users in broken VS Code forks will have no way to trigger this command',
      );
    }
  });

  // ── No duplicate command IDs within a single action list ─────────

  it('disconnected actions must not have duplicate command IDs', () => {
    const ids = getDisconnectedActions().map((a) => a.command!.command);
    const dupes = ids.filter((id, i) => ids.indexOf(id) !== i);
    assert.deepStrictEqual(dupes, [], `Duplicate command IDs in disconnected actions: ${dupes.join(', ')}`);
  });

  it('REST-failure actions must not have duplicate command IDs', () => {
    const ids = getSchemaRestFailureActions().map((a) => a.command!.command);
    const dupes = ids.filter((id, i) => ids.indexOf(id) !== i);
    assert.deepStrictEqual(dupes, [], `Duplicate command IDs in REST-failure actions: ${dupes.join(', ')}`);
  });
});
