/**
 * Accessibility harness for the web viewer's node:test suite.
 *
 * WHY THIS EXISTS
 * ---------------
 * Bug 084 (plans/history/2026.09/20260902/084_...md) restructured the two
 * most-used widgets in the viewer — the tab bar's close button and the Tables
 * sidebar's pin button — by moving each out of the interactive element it was
 * illegally nested inside. That change rewrote the accessible names and roles
 * those widgets expose, and nothing in the suite would have caught a
 * regression. Worse, the ARIA questions it raised had to be settled by reading
 * axe-core's published source by hand, because axe-core was not a dependency
 * here. This module makes both of those testable instead of argued.
 *
 * WHAT RUNS, AND AGAINST WHAT
 * ---------------------------
 * axe-core 4.x is now a dev dependency. It is used WITHOUT a browser and
 * WITHOUT jsdom, via two DOM-free entry points it publishes:
 *
 *   - `axe.SerialVirtualNode` + `axe.commons.text.accessibleTextVirtual()` /
 *     `axe.commons.aria.getRole()` — the real accessible-name and role
 *     computation, run over a serialized node tree.
 *   - `axe.runVirtualRule(ruleId, vNode)` — real axe rules (`button-name`,
 *     `link-name`, ...) evaluated against that same tree.
 *   - `axe._audit.standards` — axe's published `ariaRoles` / `htmlElms`
 *     tables, so claims about what axe believes can be asserted rather than
 *     quoted from memory.
 *
 * A full `axe.run()` is NOT possible: it needs a live document, layout and
 * `getComputedStyle`. The only way to get that in node:test would be jsdom, a
 * second heavy dependency that was NOT approved and has NOT been installed.
 * Everything below is therefore colour-contrast-free and layout-free by
 * construction — it covers structure, roles and names, which is exactly what
 * bug 084 changed.
 *
 * HOW THE REAL BUILDERS ARE EXERCISED
 * -----------------------------------
 * The widgets are built by `tabs.ts` / `table-list.ts`, which are ordinary DOM
 * code inside a 650 KB app bundle. Rather than mirror their markup by hand
 * (which would pin a copy, not the code), each builder is esbuild-bundled with
 * its heavy siblings replaced by stubs, then run against the minimal DOM shim
 * in this file. `state.ts` and `l10n.ts` are deliberately kept REAL, so the
 * accessible names asserted downstream come from the actual English string
 * catalog (`assets/web/l10n/strings-web-*.ts`) via the actual `vt()`, not from
 * a literal retyped into a test.
 *
 * The shim implements only what those two builders touch. It is not a DOM.
 */
import { build } from 'esbuild';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);

/** axe-core loads in bare node: its UMD wrapper does not require a window. */
export const axe = require('axe-core');

const here = dirname(fileURLToPath(import.meta.url));
const webDir = join(here, '..');

// ---------------------------------------------------------------------------
// Minimal DOM shim
// ---------------------------------------------------------------------------

/**
 * The subset of `Element` that `createClosableTab()` and `renderTableList()`
 * actually use. Anything they do not call is intentionally absent: a missing
 * method should fail loudly rather than silently no-op, because a silent no-op
 * would let a builder change go unnoticed by these tests.
 */
class ShimElement {
  constructor(tagName) {
    this.tagName = tagName;
    this.childNodes = [];
    this.attrs = new Map();
    this.parentElement = null;
    // Property-style DOM attributes the builders assign directly. They are
    // mirrored into `attrs` on serialization so axe sees them as attributes.
    this.className = '';
    this.id = '';
    this.title = '';
    this.type = '';
    this.href = '';
    this.classList = {
      add: (c) => { if (!this._classes().includes(c)) this.className = (this.className + ' ' + c).trim(); },
      remove: (c) => { this.className = this._classes().filter((x) => x !== c).join(' '); },
      contains: (c) => this._classes().includes(c),
      toggle: (c, on) => { if (on) this.classList.add(c); else this.classList.remove(c); },
    };
  }

  /** Current class tokens; className is a plain string like the real DOM. */
  _classes() {
    return this.className.split(/\s+/).filter(Boolean);
  }

  setAttribute(name, value) { this.attrs.set(name, String(value)); }
  getAttribute(name) { return this.attrs.has(name) ? this.attrs.get(name) : null; }
  removeAttribute(name) { this.attrs.delete(name); }

  appendChild(node) {
    node.parentElement = this;
    this.childNodes.push(node);
    return node;
  }

  insertBefore(node, ref) {
    node.parentElement = this;
    const i = ref ? this.childNodes.indexOf(ref) : -1;
    if (i < 0) this.childNodes.push(node);
    else this.childNodes.splice(i, 0, node);
    return node;
  }

  replaceChildren(...nodes) {
    this.childNodes = [];
    for (const n of nodes) this.appendChild(n);
  }

  /**
   * `textContent` setter only — the builders use it to set a label. Reading it
   * concatenates descendant text, which is what the name assertions need.
   */
  set textContent(v) {
    this.childNodes = [];
    if (v !== '' && v != null) this.appendChild(new ShimText(v));
  }

  get textContent() {
    return this.childNodes.map((c) => (c instanceof ShimText ? c.data : c.textContent)).join('');
  }

  /**
   * `innerHTML` is only ever assigned `''` (a clear) by the code under test, or
   * a `<option>` blob on elements this shim never creates. Treat any assignment
   * as a clear; anything richer would need a parser, and a parser here would be
   * pretending to be a DOM.
   */
  set innerHTML(_v) { this.childNodes = []; }
  get innerHTML() { return ''; }

  // Event wiring is irrelevant to the accessibility tree; swallow it so the
  // builders run unchanged.
  addEventListener() {}

  /** Depth-first walk over element descendants (self excluded). */
  *walk() {
    for (const c of this.childNodes) {
      if (c instanceof ShimElement) {
        yield c;
        yield* c.walk();
      }
    }
  }

  /** Supports only the simple `.class` / `tag.class` selectors the builders use. */
  querySelector(sel) {
    for (const el of this.walk()) if (matches(el, sel)) return el;
    return null;
  }

  querySelectorAll(sel) {
    const out = [];
    for (const el of this.walk()) if (matches(el, sel)) out.push(el);
    return out;
  }
}

/** A text node. Only `data` matters to the accessible-name computation. */
class ShimText {
  constructor(data) {
    this.data = String(data);
    this.parentElement = null;
  }
  get textContent() { return this.data; }
}

/** Matches `tag`, `.class`, or `tag.class`. Nothing else is used or supported. */
function matches(el, sel) {
  const m = /^([a-zA-Z]*)(?:\.([\w-]+))?$/.exec(sel.trim());
  if (!m) throw new Error('a11y-harness: unsupported selector ' + sel);
  if (m[1] && el.tagName !== m[1].toLowerCase()) return false;
  if (m[2] && !el.classList.contains(m[2])) return false;
  return true;
}

/**
 * Installs `globalThis.document` for the duration of one builder run, with the
 * given elements registered under `getElementById`. Returns a disposer so the
 * global does not leak between tests.
 */
export function withDocument(byId, fn) {
  const prev = globalThis.document;
  globalThis.document = {
    createElement: (t) => new ShimElement(String(t).toLowerCase()),
    createTextNode: (t) => new ShimText(t),
    getElementById: (id) => byId[id] || null,
  };
  try {
    return fn();
  } finally {
    globalThis.document = prev;
  }
}

/** Creates a detached container element (used as a stand-in for #tab-bar etc.). */
export function makeHost(tagName) {
  return new ShimElement(tagName);
}

// ---------------------------------------------------------------------------
// Shim DOM -> axe SerialVirtualNode
// ---------------------------------------------------------------------------

/**
 * Converts a shim subtree into the serialized node tree axe consumes.
 *
 * The property-style attributes (`className`, `id`, `title`, `type`, `href`)
 * are folded back into real attribute names here, because axe reads
 * attributes — this is the one place the shim's convenience shortcuts have to
 * be undone or names computed from `title`/`aria-label` would silently vanish.
 */
export function toVirtual(el, parent = null) {
  if (el instanceof ShimText) {
    const t = new axe.SerialVirtualNode({ nodeName: '#text', nodeType: 3, nodeValue: el.data });
    t.children = [];
    t.parent = parent;
    return t;
  }
  const attributes = Object.fromEntries(el.attrs);
  if (el.className) attributes.class = el.className;
  if (el.id) attributes.id = el.id;
  if (el.title) attributes.title = el.title;
  if (el.type) attributes.type = el.type;
  if (el.href) attributes.href = el.href;

  const v = new axe.SerialVirtualNode({ nodeName: el.tagName, nodeType: 1, attributes });
  v.parent = parent;
  v.children = el.childNodes.map((c) => toVirtual(c, v));
  return v;
}

/** The accessible name axe computes for a shim element. */
export function accessibleName(el) {
  return axe.commons.text.accessibleTextVirtual(toVirtual(el));
}

/** The role axe resolves for a shim element (explicit or implicit). */
export function roleOf(el) {
  return axe.commons.aria.getRole(toVirtual(el));
}

/**
 * Runs one real axe rule against a shim element and returns a compact verdict.
 * `incomplete` is reported separately from `violations` because axe uses it for
 * "needs a live browser to be sure" — treating it as a pass would hide a real
 * missing name.
 */
export function runRule(ruleId, el) {
  const r = axe.runVirtualRule(ruleId, toVirtual(el));
  return {
    passes: r.passes.length,
    violations: r.violations.length,
    incomplete: r.incomplete.length,
  };
}

// ---------------------------------------------------------------------------
// Loading the real builders
// ---------------------------------------------------------------------------

/**
 * Modules replaced by stubs when bundling a builder for test.
 *
 * Each entry lists the exports the builder imports. They are stubbed because
 * they reach for the network, `localStorage`, timers, or the rest of the app —
 * none of which affects the markup under test, and all of which would drag the
 * entire 650 KB app into the harness. `state.ts` and `l10n.ts` are NOT here:
 * they are pure and they carry the real values the assertions depend on
 * (`TOOL_ICONS`, and the English string catalog behind `vt()`).
 */
const STUBS = {
  'persistence.ts': ['saveTableState', 'restoreTableState', 'getPinnedTables', 'setPinnedTables', 'togglePinTable'],
  // (see STUB_BODIES for the two persistence functions that need real behavior)
  'search.ts': ['getScope'],
  'connection.ts': ['setConnected', 'setDisconnected', 'updateLiveIndicatorForConnection', 'startHeartbeat'],
  'table-view.ts': ['renderTableView'],
  'pagination.ts': ['setupPagination', 'updatePaginationBar'],
  'table-list.ts': ['loadTable', 'renderTableList'],
  'tabs.ts': ['openTableTab', 'closeToolTab', 'createClosableTab', 'switchTab'],
  'utils.ts': ['esc', 'formatTableRowCountDisplay', 'buildTableDataUrl'],
};

/**
 * Stub exports that cannot be no-ops.
 *
 * `renderTableList()` calls `getPinnedTables()` and immediately `.filter()`s
 * the result, so an `undefined` return crashes the builder before any markup
 * exists. The pinned set is also the input that decides the pin button's
 * `aria-pressed` value and its `title`, i.e. its accessible name — so the test
 * has to be able to drive it. It is read from a global rather than a module
 * export because the bundle only re-exports the entry module's own exports,
 * leaving no other handle on the stub.
 */
const STUB_BODIES = {
  'persistence.ts': {
    getPinnedTables: 'return (globalThis.__A11Y_PINNED__ || []).slice();',
    setPinnedTables: 'globalThis.__A11Y_PINNED__ = (v || []).slice();',
  },
};

/** Sets the pinned-tables fixture consumed by the stubbed persistence module. */
export function setPinnedFixture(names) {
  globalThis.__A11Y_PINNED__ = names.slice();
}

/**
 * esbuild plugin that swaps the modules named in `stub` for no-op ESM shims.
 * The stubs must enumerate their exports explicitly: ESM named exports cannot
 * be produced by a Proxy, so a missing name here surfaces as a build error
 * (which is the desired failure — it means the builder grew a new dependency
 * and this harness needs updating, rather than silently testing stale code).
 */
function stubPlugin(stub) {
  return {
    name: 'a11y-stubs',
    setup(b) {
      const re = new RegExp('\\./(' + stub.map((s) => s.replace('.', '\\.')).join('|') + ')$');
      b.onResolve({ filter: re }, (args) => ({ path: args.path, namespace: 'a11y-stub' }));
      b.onLoad({ filter: /.*/, namespace: 'a11y-stub' }, (args) => {
        const key = args.path.replace('./', '');
        const names = STUBS[key] || [];
        const bodies = STUB_BODIES[key] || {};
        const contents =
          names.map((n) => `export function ${n}(v) { ${bodies[n] || ''} }`).join('\n') || 'export {};';
        return { contents, loader: 'js' };
      });
    },
  };
}

const _cache = new Map();

/**
 * Bundles one web-viewer module with the given siblings stubbed and imports it.
 * Cached, because esbuild is the slow part and both suites load the same two.
 */
export async function loadWebModule(entry, stub) {
  const key = entry + '|' + stub.join(',');
  if (_cache.has(key)) return _cache.get(key);
  const out = await build({
    entryPoints: [join(webDir, entry)],
    bundle: true,
    format: 'esm',
    write: false,
    logLevel: 'silent',
    plugins: [stubPlugin(stub)],
  });
  const mod = await import('data:text/javascript,' + encodeURIComponent(out.outputFiles[0].text));
  _cache.set(key, mod);
  return mod;
}

/** The real `createClosableTab` from tabs.ts, with its siblings stubbed. */
export function loadTabs() {
  return loadWebModule('tabs.ts', ['persistence.ts', 'table-list.ts']);
}

/** The real `renderTableList` from table-list.ts, with its siblings stubbed. */
export function loadTableList() {
  return loadWebModule('table-list.ts', [
    'persistence.ts', 'search.ts', 'connection.ts', 'table-view.ts', 'tabs.ts', 'pagination.ts',
  ]);
}
