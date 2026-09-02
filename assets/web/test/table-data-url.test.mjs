/**
 * Regression test for plans/history/2026.09/20260902/080_web_viewer_pagination_params_named_s_limit_so_server_ignores_paging.md.
 *
 * The Tables view built its data URL inline and a mechanical rename of the
 * state variable (`limit` -> `S.limit`) was applied INSIDE the string literal,
 * so requests went out as `?S.limit=200&S.offset=200`. The Dart server reads
 * only `limit`/`offset` (ServerConstants.queryParamLimit/queryParamOffset) and
 * ignores unknown parameters, so it fell back to its defaults and returned the
 * first 200 rows for every page while the pagination bar — which derives its
 * text from client state — claimed the user was on page 2, 3, 4...
 *
 * The construction now lives in one place, `buildTableDataUrl()` in utils.ts,
 * shared by table-list.ts and search-tab.ts. This test pins the exact
 * parameter names so the two call sites cannot silently diverge again.
 *
 * Run: `npm run test:web` (node --test).
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));

// buildTableDataUrl() is TypeScript bundled into the web app; there is no JS
// runtime for it in unit tests, so — like the other web-viewer harnesses —
// esbuild compiles the real utils.ts to an in-memory ESM module.
const out = await build({
  entryPoints: [join(here, '..', 'utils.ts')],
  bundle: true,
  format: 'esm',
  write: false,
  logLevel: 'silent',
});
const { buildTableDataUrl } = await import(
  'data:text/javascript,' + encodeURIComponent(out.outputFiles[0].text)
);

describe('buildTableDataUrl', () => {
  it('uses the server parameter names `limit` and `offset`', () => {
    assert.equal(buildTableDataUrl('x', 50, 200), '/api/table/x?limit=50&offset=200');
  });

  it('never emits the `S.`-prefixed names that the server ignores', () => {
    const url = buildTableDataUrl('contacts', 200, 400);
    assert.ok(!url.includes('S.limit'), 'S.limit must not appear in the URL');
    assert.ok(!url.includes('S.offset'), 'S.offset must not appear in the URL');
  });

  it('encodes table names containing URL-significant characters', () => {
    // Table names may legally contain `/`, `?` and `#`; an unencoded name
    // would silently retarget the request at a different endpoint.
    assert.equal(
      buildTableDataUrl('a/b?c#d', 10, 0),
      '/api/table/a%2Fb%3Fc%23d?limit=10&offset=0',
    );
  });

  it('accepts offset 0 without dropping the parameter', () => {
    // A falsy offset must still be sent — omitting it would make the server
    // apply its own default and mask a genuine "first page" request.
    assert.equal(buildTableDataUrl('t', 25, 0), '/api/table/t?limit=25&offset=0');
  });
});

describe('paging call sites share one URL builder', () => {
  it('table-list.ts and search-tab.ts both go through buildTableDataUrl', async () => {
    // Source-level assertion: an inline string here is exactly how the defect
    // was introduced, and only one of the two sites was wrong, so nothing at
    // runtime could reveal the divergence.
    for (const file of ['table-list.ts', 'search-tab.ts']) {
      const src = await readFile(join(here, '..', file), 'utf8');
      assert.ok(
        src.includes('buildTableDataUrl('),
        `${file} must build its table data URL via buildTableDataUrl()`,
      );
      assert.ok(
        !/['"]\?(S\.)?limit=/.test(src),
        `${file} must not hand-build the ?limit= query string`,
      );
    }
  });
});
