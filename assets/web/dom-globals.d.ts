/**
 * Loose DOM typings for app.js so TypeScript type-checking (checkJs) can run
 * without requiring casts at every getElementById/querySelector. The real DOM
 * uses more specific types (HTMLInputElement, etc.); this allows the JS to
 * type-check as-is until we add JSDoc or migrate to .ts.
 */
declare global {
  interface HTMLElement {
    value?: string;
    disabled?: boolean;
    href?: string;
    files?: FileList | null;
    selectedOptions?: HTMLCollectionOf<HTMLOptionElement>;
    select?: () => void;
    _hideTimer?: number | null;
  }
  interface Element {
    value?: string;
    checked?: boolean;
    style?: CSSStyleDeclaration;
    focus?: () => void;
    closest?(selectors: string): Element | null;
    onclick?: ((this: GlobalEventHandlers, ev: MouseEvent) => void) | null;
    dataset?: DOMStringMap;
  }
  interface EventTarget {
    closest?(selectors: string): Element | null;
    id?: string;
    style?: CSSStyleDeclaration;
  }
  interface Event {
    key?: string;
  }
  interface Window {
    _chartRows?: unknown[];
  }
}

export {};
