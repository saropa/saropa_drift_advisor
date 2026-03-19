/**
 * Small pure helpers used to build Mutation Stream webview HTML.
 */

import type { MutationEvent, MutationType } from '../api-types';

/** Escapes arbitrary values for safe HTML interpolation. */
export function esc(value: unknown): string {
  let s: string;
  if (value === null || value === undefined) {
    s = '';
  } else if (typeof value === 'string') {
    s = value;
  } else if (
    typeof value === 'number'
    || typeof value === 'boolean'
    || typeof value === 'bigint'
  ) {
    s = String(value);
  } else if (typeof value === 'object') {
    try {
      s = JSON.stringify(value);
    } catch {
      s = '"[unserializable object]"';
    }
  } else if (typeof value === 'function') {
    s = '[function]';
  } else if (typeof value === 'symbol') {
    s = value.toString();
  } else {
    s = '[unhandled]';
  }
  return s
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

/** Returns CSS class based on mutation type badge color. */
export function typeClass(type: MutationType): string {
  switch (type) {
    case 'insert':
      return 'insert';
    case 'update':
      return 'update';
    case 'delete':
      return 'delete';
  }
}

/** Builds compact row preview text from mutation snapshots. */
export function previewFromEvent(event: MutationEvent): string {
  if (event.type === 'insert') {
    return event.after?.[0] ? JSON.stringify(event.after[0]) : 'No row snapshot';
  }
  if (event.type === 'delete') {
    return event.before?.[0] ? JSON.stringify(event.before[0]) : 'No row snapshot';
  }

  const after0 = event.after?.[0];
  const before0 = event.before?.[0];
  if (before0 && after0) {
    return `${JSON.stringify(before0)} -> ${JSON.stringify(after0)}`;
  }
  if (after0) return JSON.stringify(after0);
  if (before0) return JSON.stringify(before0);
  return 'No row snapshot';
}

/** Marks selected option in generated select controls. */
export function optionSelected(selected: string, value: string): string {
  return selected === value ? ' selected' : '';
}
