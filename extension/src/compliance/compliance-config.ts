/**
 * Loader and file watcher for `.drift-rules.json` config files.
 * Returns null when no config file exists (compliance checking disabled).
 */

import * as vscode from 'vscode';
import type { IComplianceConfig } from './compliance-types';

const CONFIG_FILENAME = '.drift-rules.json';

export class ComplianceConfigLoader implements vscode.Disposable {
  private _config: IComplianceConfig | null = null;
  private _loaded = false;
  private readonly _disposables: vscode.Disposable[] = [];
  private readonly _onDidChangeConfig =
    new vscode.EventEmitter<IComplianceConfig | null>();

  /** Fires when the config file is created, changed, or deleted. */
  readonly onDidChangeConfig = this._onDidChangeConfig.event;

  constructor() {
    this._setupWatcher();
  }

  /** Read and cache the config. Returns null if no config file exists. */
  async load(): Promise<IComplianceConfig | null> {
    const folders = vscode.workspace.workspaceFolders;
    if (!folders?.length) {
      this._config = null;
      this._loaded = true;
      return null;
    }

    const configUri = vscode.Uri.joinPath(folders[0].uri, CONFIG_FILENAME);
    try {
      const content = await vscode.workspace.fs.readFile(configUri);
      this._config = this._parseConfig(
        Buffer.from(content).toString('utf-8'),
      );
    } catch {
      this._config = null;
    }

    this._loaded = true;
    return this._config;
  }

  /** Cached config value. Call `load()` first. */
  get config(): IComplianceConfig | null {
    return this._config;
  }

  /** Whether `load()` has been called at least once. */
  get isLoaded(): boolean {
    return this._loaded;
  }

  dispose(): void {
    this._onDidChangeConfig.dispose();
    for (const d of this._disposables) {
      d.dispose();
    }
  }

  private _setupWatcher(): void {
    const watcher = vscode.workspace.createFileSystemWatcher(
      `**/${CONFIG_FILENAME}`,
    );

    const handleChange = async () => {
      await this.load();
      this._onDidChangeConfig.fire(this._config);
    };

    this._disposables.push(
      watcher,
      watcher.onDidCreate(handleChange),
      watcher.onDidChange(handleChange),
      watcher.onDidDelete(handleChange),
    );
  }

  private _parseConfig(content: string): IComplianceConfig | null {
    try {
      const parsed = JSON.parse(content);
      if (typeof parsed !== 'object' || parsed === null) {
        return null;
      }
      return parsed as IComplianceConfig;
    } catch {
      return null;
    }
  }
}
