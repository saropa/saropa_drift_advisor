import * as vscode from 'vscode';

/** Workspace-state key persisting the "group tables by name" toggle. */
const GROUP_KEY = 'driftViewer.tablesGrouped';

/**
 * Persists the Database Explorer "group tables by name" toggle per workspace and
 * mirrors it into the `driftViewer.tablesGrouped` context key so the two toolbar
 * buttons (group / flatten) can show the correct one via `when` clauses.
 *
 * Kept as a tiny store (mirroring [PinStore]) so the toggle survives reloads and
 * the tree provider can read it without owning persistence.
 */
export class TableGroupingStore {
  private readonly _onDidChange = new vscode.EventEmitter<void>();
  /** Fires after the toggle flips so the tree can re-render (no server refetch). */
  readonly onDidChange = this._onDidChange.event;

  constructor(private readonly _state: vscode.Memento) {}

  get grouped(): boolean {
    return this._state.get<boolean>(GROUP_KEY, false);
  }

  async setGrouped(value: boolean): Promise<void> {
    await this._state.update(GROUP_KEY, value);
    // Keep the context key in sync so the toolbar swaps group<->flatten buttons.
    await vscode.commands.executeCommand(
      'setContext',
      'driftViewer.tablesGrouped',
      value,
    );
    this._onDidChange.fire();
  }

  /**
   * Push the persisted state into the context key without firing onDidChange.
   * Called once on activation so the toolbar reflects the saved toggle before
   * the user interacts with it.
   */
  async syncContext(): Promise<void> {
    await vscode.commands.executeCommand(
      'setContext',
      'driftViewer.tablesGrouped',
      this.grouped,
    );
  }

  dispose(): void {
    this._onDidChange.dispose();
  }
}
