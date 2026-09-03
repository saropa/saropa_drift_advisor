/**
 * Safe localStorage wrappers.
 *
 * Every direct localStorage call in the viewer goes through these helpers
 * so a single try/catch handles private-mode browsers, restricted webviews,
 * and disabled storage.  The FIRST failure across ANY function emits a
 * console.warn so the user knows preferences won't persist; subsequent
 * failures degrade silently to keep the console clean.
 */

/** Module-level flag: has a localStorage failure already been warned about? */
let warned = false;

/**
 * Emits a one-time console warning when localStorage is unavailable.
 * Called on every catch path so the first failure — regardless of which
 * wrapper triggers it — produces a visible message.
 */
function warnOnce(): void {
  if (warned) return;
  warned = true;
  console.warn('localStorage unavailable — preferences will not persist this session');
}

/**
 * Reads a value from localStorage.
 * Returns null both when the key is absent AND when localStorage throws.
 */
export function safeGetItem(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    warnOnce();
    return null;
  }
}

/**
 * Writes a key/value pair to localStorage.
 * Silently degrades when storage is full, disabled, or otherwise unavailable.
 */
export function safeSetItem(key: string, value: string): void {
  try {
    localStorage.setItem(key, value);
  } catch {
    warnOnce();
  }
}

/**
 * Removes a key from localStorage.
 * Silently degrades when localStorage is unavailable.
 */
export function safeRemoveItem(key: string): void {
  try {
    localStorage.removeItem(key);
  } catch {
    warnOnce();
  }
}

/**
 * Returns the number of keys in localStorage.
 * Returns 0 when localStorage is unavailable, so callers' loops simply
 * execute zero iterations.
 */
export function safeStorageLength(): number {
  try {
    return localStorage.length;
  } catch {
    warnOnce();
    return 0;
  }
}

/**
 * Returns the key name at the given index in localStorage.
 * Returns null when the index is out of range OR when localStorage throws.
 */
export function safeStorageKey(index: number): string | null {
  try {
    return localStorage.key(index);
  } catch {
    warnOnce();
    return null;
  }
}
