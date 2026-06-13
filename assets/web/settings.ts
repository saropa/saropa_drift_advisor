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
import { vt, getActiveLocale } from './l10n.ts';

// ---------------------------------------------------------------------------
// Locale-aware number formatting
// ---------------------------------------------------------------------------
//
// Native `<input type="number">` cannot show thousands separators (the HTML
// spec requires its value to be a bare floating-point literal), so large
// limits like 2000 / 60000 render as cramped digit runs. We use a custom
// text-input stepper instead and format the displayed value with the active
// locale's grouping (1,000 in en-US, 1.000 in de, 1 000 in fr).

/** Formats an integer with the active locale's grouping separators. */
function fmtNum(n: number): string {
  try {
    return new Intl.NumberFormat(getActiveLocale()).format(n);
  } catch {
    // Intl or the locale tag is unavailable — fall back to the bare integer
    // rather than blanking the field.
    return String(n);
  }
}

/**
 * Parses a user-entered, possibly-grouped value back to an integer. Strips
 * every non-digit so any locale's group separator (comma, period, space,
 * non-breaking space) is tolerated; values here are always positive integers.
 * Returns NaN for an empty/garbage entry so callers can fall back.
 */
function parseNum(raw: string): number {
  const digits = raw.replace(/\D/g, '');
  return digits === '' ? NaN : parseInt(digits, 10);
}

/** Clamps `n` into the inclusive [min, max] range. */
function clampNum(n: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, n));
}

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
/** How NULL values render in data table cells: 'NULL' or '-'. */
export const PREF_NULL_DISPLAY = 'nullDisplay';
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
  [PREF_NULL_DISPLAY]: 'NULL',
  [PREF_DEFAULT_ONLY_MATCHING]: true,
  [PREF_SLOW_QUERY_THRESHOLD]: 100,
  [PREF_AUTO_REFRESH]: true,
  [PREF_EPOCH_DETECTION]: true,
  [PREF_CONFIRM_NAVIGATE_AWAY]: true,
} as const;

// ---------------------------------------------------------------------------
// Panel rendering
// ---------------------------------------------------------------------------

/**
 * Builds a custom numeric stepper: a text input (so the value can carry
 * locale grouping separators that `type="number"` forbids) flanked by
 * up/down buttons. min/max/step ride along as data-attributes so the bind
 * logic stays generic. The buttons are decorative (`aria-hidden`, removed
 * from the tab order) — the input itself is the labeled, keyboard-steppable
 * control via the wrapping `<label>`.
 */
function numberField(id: string, min: number, max: number, step: number): string {
  return `<span class="settings-stepper">
        <input type="text" inputmode="numeric" id="${id}" class="settings-input settings-input-number"
          data-min="${min}" data-max="${max}" data-step="${step}" autocomplete="off" spellcheck="false" />
        <span class="settings-stepper-btns" aria-hidden="true">
          <button type="button" class="settings-stepper-btn" data-step-dir="1" tabindex="-1"><span class="material-symbols-outlined">keyboard_arrow_up</span></button>
          <button type="button" class="settings-stepper-btn" data-step-dir="-1" tabindex="-1"><span class="material-symbols-outlined">keyboard_arrow_down</span></button>
        </span>
      </span>`;
}

/** Builds the inner HTML for the settings panel body. */
function buildSettingsHtml(): string {
  return `
<div class="settings-panel">

  <section class="settings-group">
    <h3 class="settings-group-title">
      <span class="material-symbols-outlined" aria-hidden="true">database</span>
      ${vt('viewer.settings.group.storage')}
    </h3>
    <label class="settings-row">
      <span class="settings-label">${vt('viewer.settings.storage.sqlHistoryMax')}</span>
      ${numberField('pref-sqlHistoryMax', 10, 2000, 10)}
    </label>
    <label class="settings-row">
      <span class="settings-label">${vt('viewer.settings.storage.maxAnalyses')}</span>
      ${numberField('pref-analysisMax', 5, 500, 5)}
    </label>
    <div class="settings-row settings-row-actions">
      <button type="button" id="settings-clear-all" class="btn btn-danger-outline settings-btn">
        <span class="material-symbols-outlined" aria-hidden="true">delete_sweep</span>
        ${vt('viewer.settings.storage.clearAll')}
      </button>
      <span class="settings-hint">${vt('viewer.settings.storage.clearAllHint')}</span>
    </div>
  </section>

  <section class="settings-group">
    <h3 class="settings-group-title">
      <span class="material-symbols-outlined" aria-hidden="true">table_chart</span>
      ${vt('viewer.settings.group.tableDefaults')}
    </h3>
    <label class="settings-row">
      <span class="settings-label">${vt('viewer.settings.table.defaultPageSize')}</span>
      <select id="pref-defaultPageSize" class="settings-input settings-input-select">
        <option value="50">${fmtNum(50)}</option>
        <option value="200">${fmtNum(200)}</option>
        <option value="500">${fmtNum(500)}</option>
        <option value="1000">${fmtNum(1000)}</option>
      </select>
    </label>
    <label class="settings-row">
      <span class="settings-label">${vt('viewer.settings.table.defaultDisplayFormat')}</span>
      <select id="pref-defaultDisplayFormat" class="settings-input settings-input-select">
        <option value="raw">${vt('viewer.settings.table.displayFormat.raw')}</option>
        <option value="formatted">${vt('viewer.settings.table.displayFormat.formatted')}</option>
      </select>
    </label>
    <label class="settings-row">
      <span class="settings-label">${vt('viewer.settings.table.nullDisplay')}</span>
      <span class="settings-sublabel">${vt('viewer.settings.table.nullDisplaySub')}</span>
      <select id="pref-nullDisplay" class="settings-input settings-input-select">
        <option value="NULL">NULL</option>
        <option value="-">${vt('viewer.settings.table.nullDisplay.dash')}</option>
      </select>
    </label>
    <label class="settings-row settings-toggle-row">
      <span class="settings-label">${vt('viewer.settings.table.onlyMatching')}</span>
      <span class="settings-sublabel">${vt('viewer.settings.table.onlyMatchingSub')}</span>
      <input type="checkbox" id="pref-defaultOnlyMatching" class="settings-checkbox" />
      <span class="settings-switch" role="switch" aria-checked="false"></span>
    </label>
  </section>

  <section class="settings-group">
    <h3 class="settings-group-title">
      <span class="material-symbols-outlined" aria-hidden="true">speed</span>
      ${vt('viewer.settings.group.performance')}
    </h3>
    <label class="settings-row">
      <span class="settings-label">${vt('viewer.settings.perf.slowQueryThreshold')}</span>
      <span class="settings-sublabel">${vt('viewer.settings.perf.slowQueryThresholdSub')}</span>
      ${numberField('pref-slowQueryThreshold', 10, 60000, 10)}
    </label>
    <label class="settings-row settings-toggle-row">
      <span class="settings-label">${vt('viewer.settings.perf.autoRefresh')}</span>
      <span class="settings-sublabel">${vt('viewer.settings.perf.autoRefreshSub')}</span>
      <input type="checkbox" id="pref-autoRefresh" class="settings-checkbox" />
      <span class="settings-switch" role="switch" aria-checked="false"></span>
    </label>
  </section>

  <section class="settings-group">
    <h3 class="settings-group-title">
      <span class="material-symbols-outlined" aria-hidden="true">format_paint</span>
      ${vt('viewer.settings.group.dataFormatting')}
    </h3>
    <label class="settings-row settings-toggle-row">
      <span class="settings-label">${vt('viewer.settings.format.epochDetection')}</span>
      <span class="settings-sublabel">${vt('viewer.settings.format.epochDetectionSub')}</span>
      <input type="checkbox" id="pref-epochDetection" class="settings-checkbox" />
      <span class="settings-switch" role="switch" aria-checked="false"></span>
    </label>
    <label class="settings-row settings-toggle-row">
      <span class="settings-label">${vt('viewer.settings.format.confirmNavigate')}</span>
      <span class="settings-sublabel">${vt('viewer.settings.format.confirmNavigateSub')}</span>
      <input type="checkbox" id="pref-confirmNavigateAway" class="settings-checkbox" />
      <span class="settings-switch" role="switch" aria-checked="false"></span>
    </label>
  </section>

  <div class="settings-footer">
    <button type="button" id="settings-reset-all" class="btn btn-outline settings-btn">
      <span class="material-symbols-outlined" aria-hidden="true">restart_alt</span>
      ${vt('viewer.settings.footer.resetAll')}
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
  setSelectValue('pref-nullDisplay', getPref(PREF_NULL_DISPLAY, DEFAULTS[PREF_NULL_DISPLAY]));

  // Toggle inputs
  setToggle('pref-defaultOnlyMatching', getPref(PREF_DEFAULT_ONLY_MATCHING, DEFAULTS[PREF_DEFAULT_ONLY_MATCHING]));
  setToggle('pref-autoRefresh', getPref(PREF_AUTO_REFRESH, DEFAULTS[PREF_AUTO_REFRESH]));
  setToggle('pref-epochDetection', getPref(PREF_EPOCH_DETECTION, DEFAULTS[PREF_EPOCH_DETECTION]));
  setToggle('pref-confirmNavigateAway', getPref(PREF_CONFIRM_NAVIGATE_AWAY, DEFAULTS[PREF_CONFIRM_NAVIGATE_AWAY]));
}

function setNumberInput(id: string, value: number): void {
  const el = document.getElementById(id) as HTMLInputElement | null;
  // Show the grouped form (1,000) — the input is type="text" so this is legal.
  if (el) el.value = fmtNum(value);
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
  bindSelectInput('pref-nullDisplay', PREF_NULL_DISPLAY);

  // Toggle inputs — save on change
  bindToggleInput('pref-defaultOnlyMatching', PREF_DEFAULT_ONLY_MATCHING);
  bindToggleInput('pref-autoRefresh', PREF_AUTO_REFRESH);
  bindToggleInput('pref-epochDetection', PREF_EPOCH_DETECTION);
  bindToggleInput('pref-confirmNavigateAway', PREF_CONFIRM_NAVIGATE_AWAY);

  // Clear all stored data button
  const clearBtn = document.getElementById('settings-clear-all');
  if (clearBtn) {
    clearBtn.addEventListener('click', () => {
      if (!confirm(vt('viewer.settings.confirm.clearAll'))) return;
      clearAllProjectData();
      // Visual feedback: briefly swap button text
      clearBtn.textContent = vt('viewer.settings.storage.cleared');
      setTimeout(() => {
        clearBtn.innerHTML = '<span class="material-symbols-outlined" aria-hidden="true">delete_sweep</span> ' + vt('viewer.settings.storage.clearAll');
      }, 1500);
    });
  }

  // Reset all preferences to defaults
  const resetBtn = document.getElementById('settings-reset-all');
  if (resetBtn) {
    resetBtn.addEventListener('click', () => {
      if (!confirm(vt('viewer.settings.confirm.resetAll'))) return;
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

  const min = Number(el.dataset.min);
  const max = Number(el.dataset.max);
  const step = Number(el.dataset.step) || 1;

  // Clamp, persist, and re-display the value in its grouped (1,000) form.
  // Called on commit (blur/Enter) and on every stepper/keyboard adjustment so
  // the field never holds an out-of-range or unformatted value.
  const commit = (n: number): void => {
    const clamped = clampNum(n, min, max);
    el.value = fmtNum(clamped);
    setPref(prefKey, clamped);
    applyRuntimeState();
  };

  // The current value, falling back to min when the field is empty/garbage so
  // a stepper click from a blank box still produces a sane number.
  const current = (): number => {
    const v = parseNum(el.value);
    return isFinite(v) ? v : min;
  };

  // Normalize and persist when the user finishes editing.
  el.addEventListener('change', () => commit(current()));

  // Keyboard stepping mirrors the native number input the text field replaced.
  el.addEventListener('keydown', (e: KeyboardEvent) => {
    if (e.key === 'ArrowUp') {
      e.preventDefault();
      commit(current() + step);
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      commit(current() - step);
    }
  });

  // Up/down buttons. preventDefault keeps the click from also activating the
  // wrapping <label> (which would steal focus back to the input mid-press).
  const stepper = el.closest('.settings-stepper');
  if (stepper) {
    stepper.querySelectorAll('.settings-stepper-btn').forEach((btn) => {
      btn.addEventListener('click', (e: Event) => {
        e.preventDefault();
        const dir = Number((btn as HTMLElement).dataset.stepDir) || 0;
        commit(current() + dir * step);
      });
    });
  }
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
  // Push the chosen NULL display string into runtime state so the next
  // table render reflects the new pick without a page reload.
  S.setNullDisplay(getPref(PREF_NULL_DISPLAY, DEFAULTS[PREF_NULL_DISPLAY]));
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
  S.setNullDisplay(getPref(PREF_NULL_DISPLAY, DEFAULTS[PREF_NULL_DISPLAY]));
  S.setShowOnlyMatchingRows(getPref(PREF_DEFAULT_ONLY_MATCHING, DEFAULTS[PREF_DEFAULT_ONLY_MATCHING]));
  S.setPollingEnabled(getPref(PREF_AUTO_REFRESH, DEFAULTS[PREF_AUTO_REFRESH]));
}
