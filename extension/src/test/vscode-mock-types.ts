/**
 * Mock webview, task, enum, and memento types for the vscode API.
 * Extracted from vscode-mock.ts for the 300-line limit.
 */

import { EventEmitter } from './vscode-mock-classes';

// --- Webview support ---

export class MockWebview {
  html = '';
  postedMessages: unknown[] = [];
  private _onDidReceiveMessage = new EventEmitter();

  onDidReceiveMessage(
    listener: (msg: any) => void,
    _thisArg?: any,
    disposables?: { push: (d: any) => void }[],
  ) {
    const disposable = this._onDidReceiveMessage.event(listener);
    if (disposables) {
      (disposables as any[]).push(disposable);
    }
    return disposable;
  }

  /** Post a message from the extension to the webview. */
  postMessage(message: unknown): Thenable<boolean> {
    this.postedMessages.push(message);
    return Promise.resolve(true);
  }

  /** Simulate the webview sending a message to the extension. */
  simulateMessage(msg: any): void {
    this._onDidReceiveMessage.fire(msg);
  }
}

export class MockWebviewPanel {
  webview = new MockWebview();
  private _onDidDispose = new EventEmitter();
  private _disposed = false;
  revealed = false;
  revealColumn: any = undefined;

  onDidDispose(
    listener: () => void,
    _thisArg?: any,
    disposables?: any[],
  ) {
    const disposable = this._onDidDispose.event(listener);
    if (disposables) {
      disposables.push(disposable);
    }
    return disposable;
  }

  reveal(column?: any) {
    this.revealed = true;
    this.revealColumn = column;
  }

  dispose() {
    if (!this._disposed) {
      this._disposed = true;
      this._onDidDispose.fire();
    }
  }

  /** Simulate the user closing the panel. */
  simulateClose(): void {
    this.dispose();
  }
}

// --- Enums ---

export enum ViewColumn {
  Active = -1,
  Beside = -2,
  One = 1,
  Two = 2,
}

export enum ProgressLocation {
  SourceControl = 1,
  Window = 10,
  Notification = 15,
}

export enum StatusBarAlignment {
  Left = 1,
  Right = 2,
}

// --- Task support ---

export enum TaskScope {
  Global = 1,
  Workspace = 2,
}

export enum TaskRevealKind {
  Always = 1,
  Silent = 2,
  Never = 3,
}

export enum TaskPanelKind {
  Shared = 1,
  Dedicated = 2,
  New = 3,
}

export const TaskGroup = {
  Clean: { id: 'clean' },
  Build: { id: 'build' },
  Rebuild: { id: 'rebuild' },
  Test: { id: 'test' },
};

export class CustomExecution {
  constructor(public readonly callback: () => Promise<any>) {}
}

export class Task {
  definition: any;
  scope: any;
  name: string;
  source: string;
  execution: any;
  detail?: string;
  group?: any;
  presentationOptions: any = {};

  constructor(
    definition: any,
    scope: any,
    name: string,
    source: string,
    execution?: any,
  ) {
    this.definition = definition;
    this.scope = scope;
    this.name = name;
    this.source = source;
    this.execution = execution;
  }
}

// --- Memento mock (for workspaceState) ---

export class MockMemento {
  private _data = new Map<string, unknown>();

  get<T>(key: string, defaultValue?: T): T | undefined {
    return this._data.has(key)
      ? (this._data.get(key) as T)
      : defaultValue;
  }

  async update(key: string, value: unknown): Promise<void> {
    this._data.set(key, value);
  }

  keys(): readonly string[] {
    return [...this._data.keys()];
  }
}
