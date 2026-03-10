import * as vscode from 'vscode';

const PIN_KEY = 'driftViewer.pinnedTables';

export class PinStore {
  private readonly _onDidChange = new vscode.EventEmitter<void>();
  readonly onDidChange = this._onDidChange.event;

  constructor(private readonly _state: vscode.Memento) {}

  get pinnedNames(): ReadonlySet<string> {
    return new Set(this._state.get<string[]>(PIN_KEY, []));
  }

  async pin(tableName: string): Promise<void> {
    const pins = new Set(this.pinnedNames);
    pins.add(tableName);
    await this._state.update(PIN_KEY, [...pins]);
    this._onDidChange.fire();
  }

  async unpin(tableName: string): Promise<void> {
    const pins = new Set(this.pinnedNames);
    pins.delete(tableName);
    await this._state.update(PIN_KEY, [...pins]);
    this._onDidChange.fire();
  }

  isPinned(tableName: string): boolean {
    return this.pinnedNames.has(tableName);
  }

  dispose(): void {
    this._onDidChange.dispose();
  }
}
