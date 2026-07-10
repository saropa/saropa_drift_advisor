/**
 * Clipboard mock state for testing. The unified `env` object in vscode-mock.ts
 * reads/writes this backing store via the accessors below.
 */

let _clipboardText = '';

export const clipboardMock = {
  get text() { return _clipboardText; },
  reset() { _clipboardText = ''; },
};

export function setClipboardText(text: string): void {
  _clipboardText = text;
}

export function getClipboardText(): string {
  return _clipboardText;
}
