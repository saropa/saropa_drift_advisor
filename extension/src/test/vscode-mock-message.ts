/**
 * Message tracking mock state for testing. The unified `window` object in
 * vscode-mock.ts pushes shown messages into these arrays so assertions can
 * verify UI feedback.
 */

export const messageMock = {
  infos: [] as string[],
  errors: [] as string[],
  warnings: [] as string[],
  reset() {
    this.infos.length = 0;
    this.errors.length = 0;
    this.warnings.length = 0;
  },
};
