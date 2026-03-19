/**
 * Minimal API contract consumed from the Saropa Log Capture extension.
 */

import * as vscode from 'vscode';
import type {
  LogCaptureContribution,
  LogCaptureEndContext,
  LogCaptureIntegrationContext,
} from './log-capture-types';

export interface LogCaptureApi {
  writeLine(text: string, options?: { category?: string }): void;
  insertMarker(text?: string): void;
  getSessionInfo(): { isActive: boolean } | undefined;
  registerIntegrationProvider(provider: {
    readonly id: string;
    isEnabled(context: LogCaptureIntegrationContext): boolean;
    onSessionStartSync?(): Array<{ kind: 'header'; lines: string[] }> | undefined;
    onSessionEnd?: (
      context: LogCaptureEndContext,
    ) => Promise<LogCaptureContribution[] | undefined>;
  }): vscode.Disposable;
}
