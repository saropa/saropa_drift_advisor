# PROPOSAL: Cut the inlined web bundle from 1.14 MB to ~0.4 MB — minify, import only the SQLite formatter dialect, and make the bundle cacheable

**Status: Open**

Created: 2026-09-02
Type: Infrastructure / Performance
Related diagnostics: none

---

## Summary

`assets/web/bundle.js` is 1,164,549 bytes and is **inlined verbatim into every HTML page response**, so every full page load of the viewer transfers 1.14 MB of uncacheable, unminified JavaScript. Two mechanical changes cut roughly 65% of it with no behavioural change: enable esbuild `minify`, and import `sql-formatter`'s SQLite dialect directly instead of its barrel (which drags in ClickHouse, PostgreSQL, Snowflake, DuckDB, BigQuery, Trino, Spark, PL/SQL and 15 other dialects the viewer can never use). A third change — serving the bundle from the existing `/assets/web/bundle.js` route with an ETag instead of inlining it — makes reloads nearly free.

---

## Motivation

The viewer is a debugging tool that developers reload constantly: after a hot restart, after a schema change, after the server is restarted. Every one of those reloads re-transfers the entire bundle, because it is inlined into the HTML rather than referenced.

Measured, current state:

```bash
node -e "const fs=require('fs');console.log('bundle.js bytes', fs.statSync('assets/web/bundle.js').size)"
```

```
bundle.js bytes 1164549
```

Where those bytes come from (esbuild metafile, input bytes by origin):

```bash
node -e "require('esbuild').build({entryPoints:['assets/web/index.js'],outfile:'D:/tmp/bc3.js',bundle:true,format:'iife',target:'es2020',metafile:true,logLevel:'silent'}).then(r=>{const ins=r.metafile.inputs;let sf=0,nm=0,web=0,ext=0;for(const [k,v] of Object.entries(ins)){if(k.includes('sql-formatter'))sf+=v.bytes;else if(k.startsWith('node_modules'))nm+=v.bytes;else if(k.startsWith('extension/'))ext+=v.bytes;else web+=v.bytes;}console.log({sf,nm,ext,web})})"
```

```
sql-formatter bytes 498191
other node_modules 20116
extension/src      33297
assets/web         916257
```

The largest single inputs are dialects that are unreachable from viewer code:

```
40337 node_modules/sql-formatter/dist/esm/languages/clickhouse/clickhouse.functions.js
26069 node_modules/sql-formatter/dist/esm/parser/grammar.js
18965 node_modules/sql-formatter/dist/esm/formatter/ExpressionFormatter.js
15995 node_modules/sql-formatter/dist/esm/languages/postgresql/postgresql.functions.js
13843 node_modules/sql-formatter/dist/esm/languages/clickhouse/clickhouse.formatter.js
13597 node_modules/sql-formatter/dist/esm/languages/snowflake/snowflake.functions.js
13115 node_modules/sql-formatter/dist/esm/languages/duckdb/duckdb.functions.js
11635 node_modules/sql-formatter/dist/esm/languages/bigquery/bigquery.functions.js
```

The viewer uses exactly one dialect, and says so:

```bash
sed -n '1,20p' assets/web/sql-format.ts
```

```
/**
 * Thin wrapper over the `sql-formatter` package, pinned to the SQLite dialect.
 ...
import { format } from 'sql-formatter';
...
const FORMAT_OPTIONS = {
  language: 'sqlite' as const,
  keywordCase: 'upper' as const,
  tabWidth: 2,
};
```

`import { format }` selects the dialect **at runtime** by string, so the bundler cannot prove the other 23 dialects are dead and must keep them all.

The bundle is inlined into the HTML on every request, not linked:

```bash
sed -n '205,228p' lib/src/server/generation_handler.dart
```

```
  Future<void> sendHtml(HttpResponse response, HttpRequest request) async {
    ...
    res.headers.contentType = ContentType.html;
    res.write(
      HtmlContent.buildIndexHtml(
        inlineCss: _cachedStyleCss,
        inlineBundleJs: _cachedBundleJs,
```

and no cache validator is set on that response:

```bash
grep -rn "Cache-Control\|ETag\|lastModified" lib/src/server/generation_handler.dart lib/src/server/html_content.dart
# Expected: 0 matches
```

Minification is explicitly disabled, with a stated reason:

```bash
sed -n '5,18p' esbuild.config.mjs
```

```
const options = {
  entryPoints: ['assets/web/index.js'],
  outfile: 'assets/web/bundle.js',
  bundle: true,
  format: 'iife',
  target: 'es2020',
  // No minify or sourcemap — matches the current plain-JS setup.
  // Developers read bundle.js directly during debugging.
  minify: false,
  sourcemap: false,
```

That reason is real but is fully served by emitting a sourcemap, which the same config already declines.

---

## Detection / Behavior

### Should flag (problematic)

A dialect-by-string import that defeats tree shaking:

```ts
import { format } from 'sql-formatter';
const FORMAT_OPTIONS = { language: 'sqlite' as const, keywordCase: 'upper' as const, tabWidth: 2 };
export function formatSqlSafe(sql) { return format(text, FORMAT_OPTIONS); }
```

Measured cost of this exact pattern, isolated:

```bash
# barrel format() with language:'sqlite'
printf "import { format } from 'sql-formatter';\nglobalThis.x = format('select 1', { language: 'sqlite' });\n" > .sfprobe/b.mjs
node -e "require('esbuild').build({entryPoints:['.sfprobe/b.mjs'],outfile:'D:/tmp/out2.js',bundle:true,format:'iife',target:'es2020',logLevel:'silent'}).then(()=>console.log(require('fs').statSync('D:/tmp/out2.js').size))"
```

```
493383
```

### Should pass (correct)

A statically-resolvable dialect import:

```ts
import { formatDialect, sqlite } from 'sql-formatter';
const FORMAT_OPTIONS = { dialect: sqlite, keywordCase: 'upper' as const, tabWidth: 2 };
export function formatSqlSafe(sql) { return formatDialect(text, FORMAT_OPTIONS); }
```

Measured, same probe:

```bash
printf "import { formatDialect, sqlite } from 'sql-formatter';\nglobalThis.x = formatDialect('select 1', { dialect: sqlite });\n" > .sfprobe/a.mjs
node -e "require('esbuild').build({entryPoints:['.sfprobe/a.mjs'],outfile:'D:/tmp/out1.js',bundle:true,format:'iife',target:'es2020',logLevel:'silent'}).then(()=>console.log(require('fs').statSync('D:/tmp/out1.js').size))"
```

```
112745
```

**380,638 bytes saved (77% of the dependency, 33% of the whole bundle) from a three-line change.**

Minification, measured on the real entry point:

```bash
node -e "require('esbuild').build({entryPoints:['assets/web/index.js'],outfile:'D:/tmp/bc4.js',bundle:true,format:'iife',target:'es2020',minify:true,logLevel:'silent'}).then(()=>console.log(require('fs').statSync('D:/tmp/bc4.js').size))"
```

```
685914
```

**478,635 bytes saved (41%)** with minify alone, before the formatter change. Applied together the two are largely additive, since minification of the removed dialect code is not double-counted; the expected result is roughly 0.4 MB.

---

## Edge Cases

1. **`sql-formatter` version compatibility** — `formatDialect` and the named dialect exports are present in the installed version; verified against `node -e "console.log(Object.keys(require('sql-formatter')))"`, which lists `formatDialect` and `sqlite` among the exports. Should pass.
2. **Debuggability of a minified bundle** — the config comment says developers read `bundle.js` during debugging. Mitigate with `sourcemap: 'linked'` (or `'inline'` for the CDN path) rather than keeping the bundle unminified. Needs discussion on which sourcemap mode, since an inline map re-inflates the served bytes.
3. **`assets/web/bundle.js` is committed and must stay deterministic** — esbuild minification is deterministic for a fixed version, so the sync gate proposed in `bugs/015_infra_bundle_js_has_no_staleness_gate.md` still works. But minify makes the committed diff unreadable, which argues for gating on a rebuild-and-compare rather than reviewing the diff.
4. **Offline / CDN fallback path** — when the package root cannot be resolved (Flutter mobile), the HTML loads the bundle from jsDelivr, which already sets long-lived cache headers. Only the inlined path lacks caching. Should pass either way.
5. **De-inlining changes the failure mode** — the inline path exists specifically because the `onerror` fallback chain was unreliable in Firefox (documented at `lib/src/server/html_content.dart:5-13`). A local `<script src="/assets/web/bundle.js">` is same-origin and served by the same server, so it does not reintroduce the CDN `onerror` problem, but this needs verification before shipping. Needs discussion.
6. **Interaction with a future CSP** — `plans/history/2026.09/20260902/004_web_viewer_xss_esc_missing_quote_escaping.md` proposes a CSP; a linked same-origin script is easier to allow (`script-src 'self'`) than an inline one, so de-inlining and CSP reinforce each other.

---

## Alternatives Considered

- **Lazy-load the formatter on first Format click.** A dynamic `import()` would move all 498 KB out of the initial payload. Rejected as the primary fix because it changes the bundle to a multi-chunk output, which complicates the committed-artifact model; the dialect-only import gets 77% of the benefit with no structural change. Worth revisiting if the remaining 113 KB matters.
- **Drop `sql-formatter` and hand-roll SQLite pretty-printing.** Rejected — the existing wrapper is small and correct, and hand-rolled formatting of CTEs and window functions is exactly the sort of thing that generates false-positive bug reports.
- **Keep inlining but gzip the response.** Complementary rather than alternative; still re-transfers on every load and does not help parse time.

---

## Decision

<!-- Fill in when the proposal is accepted or declined -->

---

## Implementation Notes

Suggested order, smallest blast radius first:

1. `assets/web/sql-format.ts` — switch to `formatDialect` + `sqlite`. Comment why (barrel import selects the dialect by string at runtime, so no bundler can drop the other 23 dialects). Run `npm run test:web`, `npm run typecheck:web`, `npm run build:js`.
2. `esbuild.config.mjs` — set `minify: true` and `sourcemap: 'linked'`; replace the "No minify or sourcemap" comment with one explaining that debuggability now comes from the sourcemap. Update `.pubignore` if the `.map` should not ship.
3. `lib/src/server/generation_handler.dart` / `html_content.dart` — optional third step: reference `/assets/web/bundle.js` (the route already exists as `ServerConstants.pathWebApp`) instead of inlining, and give that route an `ETag` derived from `ServerConstants.packageVersion` plus the file length, with `Cache-Control: no-cache` so the browser revalidates cheaply. Keep the inline path as the fallback for when the package root is unresolved.
4. Land the sync gate from `bugs/015_infra_bundle_js_has_no_staleness_gate.md` first or in the same change — otherwise step 1 and 2 can be committed without the regenerated bundle.

---

## Commits

<!-- Add commit hashes as implementation lands -->
