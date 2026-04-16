/**
 * Settings panel — user-configurable preferences persisted to localStorage.
 *
 * Provides a `getPref(key, defaultValue)` API that other modules call
 * instead of hardcoded constants. All preference keys use the
 * `drift-viewer-pref-` prefix to avoid collisions with other
 * localStorage entries.
 *
 * The settings panel renders as a closeable tool tab (like Schema,
 * Diagram, etc.) with grouped controls for storage limits, table
 * defaults, performance thresholds, and data formatting.
 */
import * as S from './state.ts';
import {
  setPinnedTables,
  clearNavHistory,
  collectProjectStorageKeys,
} from './persistence.ts';

// ---------------------------------------------------------------------------
// Persistence helpers
// ---------------------------------------------------------------------------

const PREF_PREFIX = 'drift-viewer-pref-';

/**
 * Returns the stored preference for `key`, or `defaultValue` if unset.
 * Numeric defaults yield numeric returns; string defaults yield strings;
 * boolean defaults yield booleans.
 */
export function getPref<T extends number | string | boolean>(
  key: string,
  defaultValue: T,
): T {
  try {
    const raw = localStorage.getItem(PREF_PREFIX + key);
    if (raw === null) return defaultValue;

    // Coerce to the same type as defaultValue
    if (typeof defaultValue === 'number') {
      const n = Number(raw);
      return (isFinite(n) ? n : defaultValue) as T;
    }
    if (typeof defaultValue === 'boolean') {
      return (raw === 'true') as unknown as T;
    }
    return raw as unknown as T;
  } catch {
    return defaultValue;
  }
}

/** Writes a preference value to localStorage. */
export function setPref(key: string, value: number | string | boolean): void {
  try {
    localStorage.setItem(PREF_PREFIX + key, String(value));
  } catch {
    // localStorage full or disabled — degrade silently
  }
}

// ---------------------------------------------------------------------------
// Preference keys — exported so other modules can reference them
// ---------------------------------------------------------------------------

/** Maximum number of SQL history entries to keep. */
export const PREF_SQL_HISTORY_MAX = 'sqlHistoryMax';
/** Maximum number of saved analysis snapshots. */
export const PREF_ANALYSIS_MAX = 'analysisMax';
/** Default page size when loading a table. */
export const PREF_DEFAULT_PAGE_SIZE = 'defaultPageSize';
/** Default display format: 'raw' or 'formatted'. */
export const PREF_DEFAULT_DISPLAY_FORMAT = 'defaultDisplayFormat';
/** Whether row filter defaults to "only matching" mode. */
export const PREF_DEFAULT_ONLY_MATCHING = 'defaultOnlyMatching';
/** Slow-query threshold in milliseconds for the Perf tab. */
export const PREF_SLOW_QUERY_THRESHOLD = 'slowQueryThreshold';
/** Whether auto-refresh polling is enabled by default. */
export const PREF_AUTO_REFRESH = 'autoRefresh';
/** Whether epoch timestamp auto-detection is enabled. */
export const PREF_EPOCH_DETECTION = 'epochDetection';
/** Whether the navigate-away confirmation dialog is shown. */
export const PREF_CONFIRM_NAVIGATE_AWAY = 'confirmNavigateAway';

// ---------------------------------------------------------------------------
// Default values — single source of truth
// ---------------------------------------------------------------------------

export const DEFAULTS = {
  [PREF_SQL_HISTORY_MAX]: 200,
  [PREF_ANALYSIS_MAX]: 50,
  [PREF_DEFAULT_PAGE_SIZE]: 200,
  [PREF_DEFAULT_DISPLAY_FORMAT]: 'raw',
  [PREF_DEFAULT_ONLY_MATCHING]: true,
  [PREF_SLOW_QUERY_THRESHOLD]: 100,
  [PREF_AUTO_REFRESH]: true,
  [PREF_EPOCH_DETECTION]: true,
  [PREF_CONFIRM_NAVIGATE_AWAY]: true,
} as const;

// ---------------------------------------------------------------------------
// Panel rendering
// ---------------------------------------------------------------------------

/** Builds the inner HTML for the settings panel body. */
function buildSettingsHtml(): string {
  return `
<div class="settings-panel">

  <section class="settings-group">
    <h3 class="settings-group-title">
      <span class="material-symbols-outlined" aria-hidden="true">database</span>
      Storage &amp; History
    </h3>
    <label class="settings-row">
      <span class="settings-label">SQL history max entries</span>
      <input type="number" id="pref-sqlHistoryMax" class="settings-input settings-input-number" min="10" max="2000" step="10" />
    </label>
    <label class="settings-row">
      <span class="settings-label">Max saved analyses</span>
      <input type="number" id="pref-analysisMax" class="settings-input settings-input-number" min="5" max="500" step="5" />
    </label>
    <div class="settings-row settings-row-actions">
      <button type="button" id="settings-clear-all" class="btn btn-danger-outline settings-btn">
        <span class="material-symbols-outlined" aria-hidden="true">delete_sweep</span>
        Clear all stored data
      </button>
      <span class="settings-hint">Removes pinned tables, table states, navigation history, SQL history, bookmarks, and saved analyses. Theme and sidebar preferences are kept.</span>
    </div>
  </section>

  <section class="settings-group">
    <h3 class="settings-group-title">
      <span class="material-symbols-outlined" aria-hidden="true">table_chart</span>
      Table Defaults
    </h3>
    <label class="settings-row">
      <span class="settings-label">Default page size</span>
      <select id="pref-defaultPageSize" class="settings-input settings-input-select">
        <option value="50">50</option>
        <option value="200">200</option>
        <option value="500">500</option>
        <option value="1000">1000</option>
      </select>
    </label>
    <label class="settings-row">
      <span class="settings-label">Default display format</span>
      <select id="pref-defaultDisplayFormat" class="settings-input settings-input-select">
        <option value="raw">Raw</option>
        <option value="formatted">Formatted</option>
      </select>
    </label>
    <label class="settings-row settings-toggle-row">
      <span class="settings-label">Show only matching rows</span>
      <span class="settings-sublabel">When a row filter is active, hide non-matching rows instead of highlighting them</span>
      <input type="checkbox" id="pref-defaultOnlyMatching" class="settings-checkbox" />
      <span class="settings-switch" role="switch" aria-checked="false"></span>
    </label>
  </section>

  <section class="settings-group">
    <h3 class="settings-group-title">
      <span class="material-symbols-outlined" aria-hidden="true">speed</span>
      Performance
    </h3>
    <label class="settings-row">
      <span class="settings-label">Slow query threshold</span>
      <span class="settings-sublabel">Queries exceeding this duration (ms) are flagged in the Perf tab</span>
      <input type="number" id="pref-slowQueryThreshold" class="settings-input settings-input-number" min="10" max="60000" step="10" />
    </label>
    <label class="settings-row settings-toggle-row">
      <span class="settings-label">Auto-refresh polling</span>
      <span class="settings-sublabel">Automatically detect and reload when database data changes</span>
      <input type="checkbox" id="pref-autoRefresh" class="settings-checkbox" />
      <span class="settings-switch" role="switch" aria-checked="false"></span>
    </label>
  </section>

  <section class="settings-group">
    <h3 class="settings-group-title">
      <span class="material-symbols-outlined" aria-hidden="true">format_paint</span>
      Data Formatting
    </h3>
    <label class="settings-row settings-toggle-row">
      <span class="settings-label">Auto-detect epoch timestamps</span>
      <span class="settings-sublabel">Automatically format large integers as dates when column names suggest timestamps</span>
      <input type="checkbox" id="pref-epochDetection" class="settings-checkbox" />
      <span class="settings-switch" role="switch" aria-checked="false"></span>
    </label>
    <label class="settings-row settings-toggle-row">
      <span class="settings-label">Confirm before leaving page</span>
      <span class="settings-sublabel">Show a browser confirmation dialog when navigating away or closing the tab</span>
      <input type="checkbox" id="pref-confirmNavigateAway" class="settings-checkbox" />
      <span class="settings-switch" role="switch" aria-checked="false"></span>
    </label>
  </section>

  <div class="settings-footer">
    <button type="button" id="settings-reset-all" class="btn btn-outline settings-btn">
      <span class="material-symbols-outlined" aria-hidden="true">restart_alt</span>
      Reset all to defaults
    </button>
  </div>

</div>`;
}

/** Populates form controls from stored preferences. */
function populateForm(): void {
  // Number inputs
  setNumberInput('pref-sqlHistoryMax', getPref(PREF_SQL_HISTORY_MAX, DEFAULTS[PREF_SQL_HISTORY_MAX]));
  setNumberInput('pref-analysisMax', getPref(PREF_ANALYSIS_MAX, DEFAULTS[PREF_ANALYSIS_MAX]));
  setNumberInput('pref-slowQueryThreshold', getPref(PREF_SLOW_QUERY_THRESHOLD, DEFAULTS[PREF_SLOW_QUERY_THRESHOLD]));

  // Select inputs
  setSelectValue('pref-defaultPageSize', String(getPref(PREF_DEFAULT_PAGE_SIZE, DEFAULTS[PREF_DEFAULT_PAGE_SIZE])));
  setSelectValue('pref-defaultDisplayFormat', getPref(PREF_DEFAULT_DISPLAY_FORMAT, DEFAULTS[PREF_DEFAULT_DISPLAY_FORMAT]));

  // Toggle inputs
  setToggle('pref-defaultOnlyMatching', getPref(PREF_DEFAULT_ONLY_MATCHING, DEFAULTS[PREF_DEFAULT_ONLY_MATCHING]));
  setToggle('pref-autoRefresh', getPref(PREF_AUTO_REFRESH, DEFAULTS[PREF_AUTO_REFRESH]));
  setToggle('pref-epochDetection', getPref(PREF_EPOCH_DETECTION, DEFAULTS[PREF_EPOCH_DETECTION]));
  setToggle('pref-confirmNavigateAway', getPref(PREF_CONFIRM_NAVIGATE_AWAY, DEFAULTS[PREF_CONFIRM_NAVIGATE_AWAY]));
}

function setNumberInput(id: string, value: number): void {
  const el = document.getElementById(id) as HTMLInputElement | null;
  if (el) el.value = String(value);
}

function setSelectValue(id: string, value: string): void {
  const el = document.getElementById(id) as HTMLSelectElement | null;
  if (el) el.value = value;
}

function setToggle(id: string, checked: boolean): void {
  const cb = document.getElementById(id) as HTMLInputElement | null;
  if (!cb) return;
  cb.checked = checked;
  // Keep the adjacent visual switch in sync
  const sw = cb.nextElementSibling;
  if (sw && sw.classList.contains('settings-switch')) {
    sw.setAttribute('aria-checked', checked ? 'true' : 'false');
  }
}

// ---------------------------------------------------------------------------
// Event binding
// ---------------------------------------------------------------------------

/** Wires up change listeners on all settings controls. */
function bindEvents(): void {
  // Number inputs — save on change
  bindNumberInput('pref-sqlHistoryMax', PREF_SQL_HISTORY_MAX);
  bindNumberInput('pref-analysisMax', PREF_ANALYSIS_MAX);
  bindNumberInput('pref-slowQueryThreshold', PREF_SLOW_QUERY_THRESHOLD);

  // Select inputs — save on change
  bindSelectInput('pref-defaultPageSize', PREF_DEFAULT_PAGE_SIZE);
  bindSelectInput('pref-defaultDisplayFormat', PREF_DEFAULT_DISPLAY_FORMAT);

  // Toggle inputs — save on change
  bindToggleInput('pref-defaultOnlyMatching', PREF_DEFAULT_ONLY_MATCHING);
  bindToggleInput('pref-autoRefresh', PREF_AUTO_REFRESH);
  bindToggleInput('pref-epochDetection', PREF_EPOCH_DETECTION);
  bindToggleInput('pref-confirmNavigateAway', PREF_CONFIRM_NAVIGATE_AWAY);

  // Clear all stored data button
  const clearBtn = document.getElementById('settings-clear-all');
  if (clearBtn) {
    clearBtn.addEventListener('click', () => {
      if (!confirm('Clear all stored project data? Theme and sidebar preferences will be kept.')) return;
      clearAllProjectData();
      // Visual feedback: briefly swap button text
      clearBtn.textContent = 'Cleared!';
      setTimeout(() => {
        clearBtn.innerHTML = '<span class="material-symbols-outlined" aria-hidden="true">delete_sweep</span> Clear all stored data';
      }, 1500);
    });
  }

  // Reset all preferences to defaults
  const resetBtn = document.getElementById('settings-reset-all');
  if (resetBtn) {
    resetBtn.addEventListener('click', () => {
      if (!confirm('Reset all settings to their default values?')) return;
      resetAllPrefs();
      populateForm();
      // Apply the reset defaults to runtime state immediately
      applyRuntimeState();
    });
  }
}

function bindNumberInput(id: string, prefKey: string): void {
  const el = document.getElementById(id) as HTMLInputElement | null;
  if (!el) return;
  el.addEventListener('change', () => {
    const v = parseInt(el.value, 10);
    if (isFinite(v) && v > 0) {
      setPref(prefKey, v);
      applyRuntimeState();
    }
  });
}

function bindSelectInput(id: string, prefKey: string): void {
  const el = document.getElementById(id) as HTMLSelectElement | null;
  if (!el) return;
  el.addEventListener('change', () => {
    // For numeric selects (page size), store as number
    const n = Number(el.value);
    setPref(prefKey, isFinite(n) ? n : el.value);
    applyRuntimeState();
  });
}

function bindToggleInput(id: string, prefKey: string): void {
  const cb = document.getElementById(id) as HTMLInputElement | null;
  if (!cb) return;

  // Clicking the visual switch or the label toggles the hidden checkbox
  const row = cb.closest('.settings-toggle-row');
  if (row) {
    row.addEventListener('click', (e: Event) => {
      // Don't double-toggle if the click was on the checkbox itself
      if (e.target === cb) return;
      cb.checked = !cb.checked;
      cb.dispatchEvent(new Event('change'));
    });
  }

  cb.addEventListener('change', () => {
    setPref(prefKey, cb.checked);
    // Update the visual switch
    const sw = cb.nextElementSibling;
    if (sw && sw.classList.contains('settings-switch')) {
      sw.setAttribute('aria-checked', cb.checked ? 'true' : 'false');
    }
    applyRuntimeState();
  });
}

// ---------------------------------------------------------------------------
// Runtime state application — push stored prefs into live state
// ---------------------------------------------------------------------------

/**
 * Applies current preference values to the live runtime state so changes
 * take effect without a page reload.
 */
function applyRuntimeState(): void {
  S.setShowOnlyMatchingRows(getPref(PREF_DEFAULT_ONLY_MATCHING, DEFAULTS[PREF_DEFAULT_ONLY_MATCHING]));
  S.setPollingEnabled(getPref(PREF_AUTO_REFRESH, DEFAULTS[PREF_AUTO_REFRESH]));
}

// ---------------------------------------------------------------------------
// Data management helpers
// ---------------------------------------------------------------------------

/** Removes all project-specific localStorage keys, same as clearStaleProjectStorage but unconditional. */
function clearAllProjectData(): void {
  // Use the shared key collector so the key list stays in sync with
  // clearStaleProjectStorage in persistence.ts
  collectProjectStorageKeys().forEach((k) => localStorage.removeItem(k));

  // Also clear in-memory state
  setPinnedTables([]);
  clearNavHistory();
  S.setSqlHistory([]);
  S.setSqlBookmarks([]);
}

/** Removes all preference keys, reverting to built-in defaults. */
function resetAllPrefs(): void {
  const keysToRemove: string[] = [];
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (key && key.startsWith(PREF_PREFIX)) {
      keysToRemove.push(key);
    }
  }
  keysToRemove.forEach((k) => localStorage.removeItem(k));
}

// ---------------------------------------------------------------------------
// Initialization
// ---------------------------------------------------------------------------

/**
 * Renders the settings panel body and wires up event listeners.
 * Called once from app.js / index.js during startup. Safe to call
 * before the settings tab is visible — the panel content is injected
 * into #panel-settings which starts hidden.
 */
export function initSettings(): void {
  const panel = document.getElementById('settings-body');
  if (!panel) return;
  panel.innerHTML = buildSettingsHtml();
  populateForm();
  bindEvents();
}

/**
 * Apply stored preferences to runtime state on startup.
 * Called early in app.js so modules pick up user prefs before first render.
 */
export function applyStoredPrefs(): void {
  // Push stored prefs into S.* state so first renders use user values
  S.setLimit(getPref(PREF_DEFAULT_PAGE_SIZE, DEFAULTS[PREF_DEFAULT_PAGE_SIZE]));
  S.setDisplayFormat(getPref(PREF_DEFAULT_DISPLAY_FORMAT, DEFAULTS[PREF_DEFAULT_DISPLAY_FORMAT]));
  S.setShowOnlyMatchingRows(getPref(PREF_DEFAULT_ONLY_MATCHING, DEFAULTS[PREF_DEFAULT_ONLY_MATCHING]));
  S.setPollingEnabled(getPref(PREF_AUTO_REFRESH, DEFAULTS[PREF_AUTO_REFRESH]));
}
