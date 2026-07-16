/**
 * Dialog mock state for testing. Tests set the result a dialog will return via
 * [dialogMock]; the unified `window` object in vscode-mock.ts reads these values
 * through the accessors below.
 */

let _saveDialogResult: any = undefined;
let _infoMessageResult: string | undefined = undefined;
let _warningMessageResult: string | undefined = undefined;
// `any`, not `string`: showQuickPick resolves to the picked ITEM, and some
// callers (e.g. suppression-commands.ts) pass rich objects, not plain labels.
let _quickPickResult: any = undefined;
let _inputBoxResult: string | undefined = undefined;

export const dialogMock = {
  set saveResult(uri: any) { _saveDialogResult = uri; },
  set infoMessageResult(v: string | undefined) { _infoMessageResult = v; },
  /** Simulate the user clicking a button on a showWarningMessage toast. */
  set warningMessageResult(v: string | undefined) { _warningMessageResult = v; },
  set quickPickResult(v: any) { _quickPickResult = v; },
  set inputBoxResult(v: string | undefined) { _inputBoxResult = v; },
  reset() {
    _saveDialogResult = undefined;
    _infoMessageResult = undefined;
    _warningMessageResult = undefined;
    _quickPickResult = undefined;
    _inputBoxResult = undefined;
  },
};

export const dialogResults = {
  get save() { return _saveDialogResult; },
  get info() { return _infoMessageResult; },
  get warning() { return _warningMessageResult; },
  get quickPick() { return _quickPickResult; },
  get inputBox() { return _inputBoxResult; },
};
