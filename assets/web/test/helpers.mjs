/**
 * Test harness for the NL→SQL converter.
 *
 * The converter is TypeScript bundled into the web app; there's no JS runtime
 * for it in unit tests. So we esbuild `nl-to-sql.ts` to an in-memory ESM module
 * (esbuild is already a dev dependency) and exercise the real exported
 * `nlToSql`. Generated SQL is then executed against in-memory SQLite
 * (`node:sqlite`) so the tests verify the queries actually RUN, not just that
 * the strings look right.
 */
import { build } from 'esbuild';
import { DatabaseSync } from 'node:sqlite';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));

let _nlToSql = null;

/** Bundles and imports the real nlToSql once, caching it for the suite. */
export async function loadConverter() {
  if (_nlToSql) return _nlToSql;
  const out = await build({
    entryPoints: [join(here, '..', 'nl-to-sql.ts')],
    bundle: true,
    format: 'esm',
    write: false,
    logLevel: 'silent',
  });
  const mod = await import('data:text/javascript,' + encodeURIComponent(out.outputFiles[0].text));
  _nlToSql = mod.nlToSql;
  return _nlToSql;
}

// One clock for the whole run so every temporal assertion shares "now".
export const NOW = Math.floor(Date.now() / 1000);

/** Builds a fresh in-memory DB from a fixture and seeds it. */
export function makeDb(fixture) {
  const db = new DatabaseSync(':memory:');
  for (const stmt of fixture.ddl) db.exec(stmt);
  fixture.seed(db, NOW);
  return db;
}

/**
 * Executes generated SQL against a fresh fixture DB and returns the row count.
 * Throws if the SQL is invalid — so a malformed query fails the test loudly.
 */
export function runCount(fixture, sql) {
  const db = makeDb(fixture);
  try {
    return db.prepare(sql).all().length;
  } finally {
    db.close();
  }
}
