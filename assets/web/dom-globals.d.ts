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
    options?: HTMLCollectionOf<HTMLOptionElement>;
    selectedOptions?: HTMLCollectionOf<HTMLOptionElement>;
    select?: () => void;
    _hideTimer?: number | null;
  }
  interface Element {
    value?: string;
    checked?: boolean;
    hidden?: boolean | "until-found";
    style?: CSSStyleDeclaration;
    focus?: () => void;
    closest(selectors: string): Element | null;
    onclick?: ((this: GlobalEventHandlers, ev: MouseEvent) => void) | null;
    dataset?: DOMStringMap;
  }
  interface EventTarget {
    closest?(selectors: string): Element | null;
    id?: string;
    style?: CSSStyleDeclaration;
  }
  interface Node {
    contains(other: EventTarget | Node | null): boolean;
  }
  interface Event {
    key?: string;
  }
  interface Window {
    _chartRows?: unknown[];
    /** SQL syntax highlighter — set by sql-highlight.ts, consumed by app.ts. */
    sqlHighlight?: (sql: string) => string;
    /** Masthead pill API — set by masthead.ts, consumed by app.ts. */
    mastheadStatus?: {
      setConnection(state: string, pollingEnabled: boolean): void;
      setBusy(): void;
      onToggle: Function | null;
    };
    /** Tab switching — set in app.js diagram/tab logic. */
    onTabSwitch?: (tabId: string) => void;
    ensureDiagramInited?: () => void;
    /** Toolbar icon active-state sync — set by toolbar.ts, consumed by app.js onTabSwitch. */
    _toolbarSyncActiveTab?: (tabId: string) => void;
    /** Home tab sidebar switches — set by home-screen.ts, called from toolbar.ts after sidebar toggles. */
    _syncHomeSidebarToggles?: () => void;
    /** Search tab hooks — stubs defined in app.js, consumed by external Search UI extension. */
    _stOnActivate?: () => void;
    _stFocusInput?: () => void;
    _stPopulateTables?: (tables: string[]) => void;
    _stSyncTable?: (name: string) => void;
    _stUpdateCount?: (table: string, count: number) => void;
  }
}

export {};
