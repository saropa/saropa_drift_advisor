/**
 * Contract tests for web inline-edit v1 behavior (Feature 47 Phase 3).
 *
 * Verifies that the browser UI implementation enforces:
 *  - explicit Save/Cancel controls (no blur auto-save)
 *  - single active edit lock with user guidance
 *  - unsaved-edit navigation confirmation wiring
 *  - row-level delete action surfaced only on single-PK/write-enabled tables
 */
import * as assert from 'assert';
import { readAsset } from './web-theme-test-helpers';

describe('web inline edit v1 contract', () => {
  let cellEditTs: string;
  let appJs: string;
  let tableViewTs: string;

  before(() => {
    cellEditTs = readAsset('assets/web/cell-edit.ts');
    appJs = readAsset('assets/web/app.js');
    tableViewTs = readAsset('assets/web/table-view.ts');
  });

  it('cell-edit.ts exposes unsaved edit state helpers', () => {
    assert.ok(cellEditTs.includes('export function hasUnsavedWebEdit()'));
    assert.ok(cellEditTs.includes('tryBeginUnsavedWebEdit'));
    assert.ok(cellEditTs.includes('clearUnsavedWebEdit'));
  });

  it('cell-edit.ts enforces single active edit with user-facing message', () => {
    assert.ok(cellEditTs.includes('Finish or cancel the current edit before editing another cell.'));
  });

  it('cell-edit.ts renders explicit Save/Cancel controls', () => {
    assert.ok(cellEditTs.includes("saveBtn.textContent = 'Save'"));
    assert.ok(cellEditTs.includes("cancelBtn.textContent = 'Cancel'"));
    assert.ok(cellEditTs.includes('cell-edit-actions'));
  });

  it('cell-edit.ts highlights dirty draft vs original and surfaces retry/reload on save failure', () => {
    assert.ok(cellEditTs.includes('cell-edit-td-dirty'));
    assert.ok(cellEditTs.includes('cell-edit-row-dirty'));
    assert.ok(cellEditTs.includes('updateDirtyHighlight'));
    assert.ok(cellEditTs.includes("retrySaveBtn.textContent = 'Retry save'"));
    assert.ok(cellEditTs.includes("reloadTableBtn.textContent = 'Reload table'"));
    assert.ok(cellEditTs.includes('cell-edit-failure-actions'));
  });

  it('cell-edit.ts no longer commits on blur', () => {
    assert.ok(!cellEditTs.includes('input.addEventListener(\'blur\', onBlur)'));
    assert.ok(!cellEditTs.includes('function onBlur()'));
  });

  it('app.js navigation guard checks unsaved edit state', () => {
    assert.ok(appJs.includes('hasUnsavedWebEdit'));
    assert.ok(appJs.includes('if (!hasUnsavedWebEdit()) return;'));
  });

  it('table-view.ts adds row delete action only for single-PK write-enabled mode', () => {
    assert.ok(tableViewTs.includes('getSinglePkColumnName'));
    assert.ok(tableViewTs.includes('showRowDelete = !!S.driftWriteEnabled && !!singlePkName'));
    assert.ok(tableViewTs.includes('row-delete-btn'));
    assert.ok(tableViewTs.includes('Actions</th>'));
  });

  it('app.js row delete flow confirms with PK identity text', () => {
    assert.ok(appJs.includes('Delete row where '));
    assert.ok(appJs.includes("e.target.closest('.row-delete-btn')"));
    assert.ok(appJs.includes('/api/edits/apply'));
  });

  it('app.js failed delete offers optional reload via confirm', () => {
    assert.ok(appJs.includes('Reload table data now?'));
  });
});

