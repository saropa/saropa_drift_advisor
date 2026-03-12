import * as vscode from 'vscode';
import type { DriftApiClient } from '../../api-client';
import type {
  DiagnosticCategory,
  IDiagnosticContext,
  IDiagnosticIssue,
  IDiagnosticProvider,
} from '../diagnostic-types';

/**
 * Runtime event for tracking data changes.
 */
export interface IRuntimeEvent {
  type: 'breakpoint-hit' | 'row-inserted' | 'row-deleted' | 'connection-error';
  table?: string;
  message: string;
  timestamp: number;
  count?: number;
}

/**
 * Runtime diagnostic provider.
 * Reports runtime issues including:
 * - Data breakpoint hits
 * - Row insert/delete alerts (when enabled)
 * - Connection errors
 */
export class RuntimeProvider implements IDiagnosticProvider {
  readonly id = 'runtime';
  readonly category: DiagnosticCategory = 'runtime';

  private readonly _events: IRuntimeEvent[] = [];
  private readonly _maxEvents = 100;
  private readonly _eventTtlMs = 5 * 60 * 1000; // 5 minutes

  private _workspaceUri: vscode.Uri | undefined;

  /**
   * Record a data breakpoint hit for diagnostic reporting.
   */
  recordBreakpointHit(table: string, message: string): void {
    this._addEvent({
      type: 'breakpoint-hit',
      table,
      message,
      timestamp: Date.now(),
    });
  }

  /**
   * Record row insertions for diagnostic reporting.
   */
  recordRowsInserted(table: string, count: number): void {
    this._addEvent({
      type: 'row-inserted',
      table,
      message: `${count} row(s) inserted into "${table}"`,
      timestamp: Date.now(),
      count,
    });
  }

  /**
   * Record row deletions for diagnostic reporting.
   */
  recordRowsDeleted(table: string, count: number): void {
    this._addEvent({
      type: 'row-deleted',
      table,
      message: `${count} row(s) deleted from "${table}"`,
      timestamp: Date.now(),
      count,
    });
  }

  /**
   * Record a connection error for diagnostic reporting.
   */
  recordConnectionError(message: string): void {
    this._addEvent({
      type: 'connection-error',
      message,
      timestamp: Date.now(),
    });
  }

  /**
   * Clear all recorded events.
   */
  clearEvents(): void {
    this._events.length = 0;
  }

  /**
   * Get all current events (for testing).
   */
  get events(): readonly IRuntimeEvent[] {
    return this._events;
  }

  async collectDiagnostics(ctx: IDiagnosticContext): Promise<IDiagnosticIssue[]> {
    const issues: IDiagnosticIssue[] = [];

    // Prune old events
    this._pruneOldEvents();

    // Find workspace root for diagnostic location
    if (!this._workspaceUri) {
      const folders = vscode.workspace.workspaceFolders;
      if (folders && folders.length > 0) {
        this._workspaceUri = folders[0].uri;
      }
    }

    if (!this._workspaceUri) {
      return issues;
    }

    // Convert recent events to diagnostics
    for (const event of this._events) {
      const issue = this._eventToIssue(event);
      if (issue) {
        issues.push(issue);
      }
    }

    // Check connection status
    await this._checkConnection(ctx.client, issues);

    return issues;
  }

  provideCodeActions(
    diag: vscode.Diagnostic,
    _doc: vscode.TextDocument,
  ): vscode.CodeAction[] {
    const actions: vscode.CodeAction[] = [];
    const code = diag.code as string;

    // Add "Disable this rule" action
    const disableAction = new vscode.CodeAction(
      `Disable "${code}" rule`,
      vscode.CodeActionKind.QuickFix,
    );
    disableAction.command = {
      command: 'driftViewer.disableDiagnosticRule',
      title: 'Disable Rule',
      arguments: [code],
    };
    actions.push(disableAction);

    if (code === 'data-breakpoint-hit') {
      const addAction = new vscode.CodeAction(
        'Add Data Breakpoint',
        vscode.CodeActionKind.QuickFix,
      );
      addAction.command = {
        command: 'driftViewer.addDataBreakpoint',
        title: 'Add Breakpoint',
      };
      actions.push(addAction);
    }

    if (code === 'row-inserted-alert' || code === 'row-deleted-alert') {
      const data = (diag as any).data;
      if (data?.table) {
        const viewAction = new vscode.CodeAction(
          `View "${data.table}" Table`,
          vscode.CodeActionKind.QuickFix,
        );
        viewAction.command = {
          command: 'driftViewer.viewTableInPanel',
          title: 'View Table',
          arguments: [data.table],
        };
        viewAction.isPreferred = true;
        actions.push(viewAction);
      }

      const clearAction = new vscode.CodeAction(
        'Clear Runtime Alerts',
        vscode.CodeActionKind.QuickFix,
      );
      clearAction.command = {
        command: 'driftViewer.clearRuntimeAlerts',
        title: 'Clear Alerts',
      };
      actions.push(clearAction);
    }

    if (code === 'connection-error') {
      const refreshAction = new vscode.CodeAction(
        'Refresh Connection',
        vscode.CodeActionKind.QuickFix,
      );
      refreshAction.command = {
        command: 'driftViewer.refreshTree',
        title: 'Refresh',
      };
      refreshAction.isPreferred = true;
      actions.push(refreshAction);

      const settingsAction = new vscode.CodeAction(
        'Open Extension Settings',
        vscode.CodeActionKind.QuickFix,
      );
      settingsAction.command = {
        command: 'workbench.action.openSettings',
        title: 'Settings',
        arguments: ['driftViewer'],
      };
      actions.push(settingsAction);
    }

    return actions;
  }

  dispose(): void {
    this._events.length = 0;
  }

  // --- Private --------------------------------------------------------------

  private _addEvent(event: IRuntimeEvent): void {
    this._events.unshift(event);

    // Trim to max size
    if (this._events.length > this._maxEvents) {
      this._events.length = this._maxEvents;
    }
  }

  private _pruneOldEvents(): void {
    const cutoff = Date.now() - this._eventTtlMs;
    while (this._events.length > 0 && this._events[this._events.length - 1].timestamp < cutoff) {
      this._events.pop();
    }
  }

  private _eventToIssue(event: IRuntimeEvent): IDiagnosticIssue | undefined {
    if (!this._workspaceUri) {
      return undefined;
    }

    const baseRange = new vscode.Range(0, 0, 0, 0);

    switch (event.type) {
      case 'breakpoint-hit':
        return {
          code: 'data-breakpoint-hit',
          message: `Data breakpoint fired: ${event.message}`,
          fileUri: this._workspaceUri,
          range: baseRange,
          severity: vscode.DiagnosticSeverity.Warning,
          data: { table: event.table },
        };

      case 'row-inserted':
        return {
          code: 'row-inserted-alert',
          message: event.message,
          fileUri: this._workspaceUri,
          range: baseRange,
          severity: vscode.DiagnosticSeverity.Information,
          data: { table: event.table, count: event.count },
        };

      case 'row-deleted':
        return {
          code: 'row-deleted-alert',
          message: event.message,
          fileUri: this._workspaceUri,
          range: baseRange,
          severity: vscode.DiagnosticSeverity.Information,
          data: { table: event.table, count: event.count },
        };

      case 'connection-error':
        return {
          code: 'connection-error',
          message: event.message,
          fileUri: this._workspaceUri,
          range: baseRange,
          severity: vscode.DiagnosticSeverity.Error,
        };

      default:
        return undefined;
    }
  }

  private async _checkConnection(
    client: DriftApiClient,
    issues: IDiagnosticIssue[],
  ): Promise<void> {
    if (!this._workspaceUri) {
      return;
    }

    try {
      // Quick check via generation endpoint
      await client.generation(0);
    } catch (err) {
      // Only add if not already tracked via recordConnectionError
      const hasConnectionError = this._events.some(
        (e) => e.type === 'connection-error' && Date.now() - e.timestamp < 30000,
      );

      if (!hasConnectionError) {
        const message = err instanceof Error ? err.message : 'Unknown connection error';
        issues.push({
          code: 'connection-error',
          message: `Failed to connect to Drift server: ${message}`,
          fileUri: this._workspaceUri,
          range: new vscode.Range(0, 0, 0, 0),
          severity: vscode.DiagnosticSeverity.Error,
        });
      }
    }
  }
}
