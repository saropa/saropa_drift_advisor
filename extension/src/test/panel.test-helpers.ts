/**
 * Shared test helpers and fixtures for panel tests.
 * Extracted from panel.test to keep files under 300 lines.
 */

import * as sinon from 'sinon';
import { createdPanels, MockWebviewPanel, resetMocks } from './vscode-mock';
import { DriftViewerPanel } from '../panel';

/** Returns the most recently created mock webview panel. */
export function latestPanel(): MockWebviewPanel {
  return createdPanels[createdPanels.length - 1];
}

/** Standard setup: reset mocks, clear singleton, stub global fetch. Returns the fetch stub. */
export function setupPanelTest(): sinon.SinonStub {
  resetMocks();
  (DriftViewerPanel as any).currentPanel = undefined;
  return sinon.stub(globalThis, 'fetch');
}

/** Small delay to let async _loadContent settle. */
export function settle(): Promise<void> {
  return new Promise((r) => setTimeout(r, 10));
}

// --- Reusable HTML fixtures ---

/** Minimal server HTML with head and body. */
export const minimalHtml = '<html><head></head><body></body></html>';

/** Server HTML with a title in the head. */
export const titledHtml = '<html><head><title>Drift DB</title></head><body>OK</body></html>';

/** Creates a successful Response wrapping the given HTML. */
export function htmlResponse(html: string): Response {
  return new Response(html, { status: 200 });
}

/** Wraps body content in a minimal HTML shell (head + body). */
export function bodyHtml(body: string): string {
  return `<html><head></head><body>${body}</body></html>`;
}
