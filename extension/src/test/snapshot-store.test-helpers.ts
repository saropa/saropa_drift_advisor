/**
 * Shared test helpers for snapshot-store tests.
 */

export function makeResponse(body: unknown): Response {
  return { ok: true, status: 200, json: async () => body } as unknown as Response;
}

export function metadataJson(tables = [
  { name: 'users', rowCount: 3, columns: [{ name: 'id', type: 'INTEGER', pk: true }, { name: 'name', type: 'TEXT', pk: false }] },
]) {
  return tables;
}

export function sqlJson(columns: string[], rows: unknown[][]) {
  // The real /api/sql emits object-rows ({col: value}), not the columnar
  // {columns, rows[][]} shape; client.sql() converts to columnar. Build the
  // server shape here so the test exercises that conversion (GitHub issue #32).
  return { rows: rows.map((r) => Object.fromEntries(columns.map((c, i) => [c, r[i]]))) };
}
