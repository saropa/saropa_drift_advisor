/**
 * CSV serialization and result routing for the sidebar SQL console.
 *
 * Work package B of plans/PLAN_SQL_CONSOLE_SIDEBAR.md. This module is deliberately
 * free of any `vscode` import: the `openTextDocument`/`showTextDocument` calls
 * that actually surface the CSV live in the view layer (package C), so this file
 * stays a pure function library that unit tests can exercise without the vscode
 * mock. Do not add a vscode import here.
 *
 * Input shape: `DriftApiClient.sql()` resolves to the COLUMNAR contract
 * `{ columns: string[], rows: unknown[][] }` (see api-client.ts and
 * api-client-http-query.ts, which normalizes the server's object-rows into
 * columns/rows before returning). Every function here assumes that shape —
 * `rows[r][c]` lines up with `columns[c]`.
 *
 * Why blobs are never written into a cell: the host serializes a BLOB as a JSON
 * array of integers, so a single image column can expand into a multi-megabyte
 * payload. That is the same failure family that forced the `length()` projection
 * in sql/blob-safe-select.ts, where `SELECT *` over blob columns exhausted the
 * connected app's native heap and SIGABRT-crashed it. `/api/sql` runs the user's
 * own ad-hoc query, so it has no such projection and can still hand us raw blob
 * bytes. Pasting those into a CSV cell would (a) produce a garbage payload no CSV
 * consumer can read, and (b) balloon the in-memory string we then hand to the
 * editor. A short placeholder is the only safe rendering.
 */

/** Field separator. Fixed by Decision 4 — CSV only, comma only. */
const FIELD_SEPARATOR = ',';

/** Line terminator. `\n`, not CRLF, per Decision 4. */
const LINE_TERMINATOR = '\n';

/** The quote character, and its own escape (a quote is escaped by doubling). */
const QUOTE = '"';

/** A field containing any of these characters must be quoted. */
const MUST_QUOTE_CHARS = [FIELD_SEPARATOR, QUOTE, '\n', '\r'];

/** Rendering of a blob whose byte length could be derived. */
function blobPlaceholder(byteLength: number): string {
  return `<${byteLength} bytes>`;
}

/** Rendering of a blob whose byte length could NOT be derived. */
const BLOB_PLACEHOLDER_UNKNOWN = '<blob>';

/** Inline rendering of SQL NULL in the single-cell view (not in CSV). */
const NULL_DISPLAY = 'NULL';

/**
 * Byte length of a base64 payload without decoding it. Each 4-character group
 * encodes 3 bytes, minus one byte per trailing `=`. Computed rather than decoded
 * so a large blob is never materialized just to report its size — the same
 * "never move the payload" reasoning as blob-safe-select.ts.
 */
function base64ByteLength(text: string): number {
  const trimmed = text.trim();
  if (trimmed.length === 0) return 0;
  const padding = trimmed.endsWith('==') ? 2 : trimmed.endsWith('=') ? 1 : 0;
  return Math.max(0, Math.floor(trimmed.length / 4) * 3 - padding);
}

/**
 * True when every element is a number in byte range. The host's JSON encoding of
 * a BLOB is exactly this — an array of 0..255 integers — so it is the shape we
 * must recognize. Checked strictly (integers, in range) so a legitimate array
 * value from some other source is not silently reported as "N bytes".
 */
function isByteArray(value: unknown[]): boolean {
  return value.every(
    (b) => typeof b === 'number' && Number.isInteger(b) && b >= 0 && b <= 255,
  );
}

/**
 * Derives a blob's byte length from the several shapes a blob can arrive in,
 * returning undefined when none applies (caller then falls back to `<blob>`).
 *
 * Note that plain strings are never sniffed for base64: a TEXT column can hold
 * text that happens to look base64-ish, and misreporting it as a blob would lose
 * real data from the export. Only an explicitly blob-shaped wrapper object is
 * treated as base64.
 */
function deriveByteLength(value: object): number | undefined {
  // Uint8Array and every other typed-array view / DataView expose byteLength.
  if (ArrayBuffer.isView(value)) return value.byteLength;
  if (value instanceof ArrayBuffer) return value.byteLength;
  // The host's JSON blob encoding: an array of byte-valued integers.
  if (Array.isArray(value)) return isByteArray(value) ? value.length : undefined;

  const record = value as Record<string, unknown>;
  // A wrapper object that states its own size wins over any payload inspection.
  const declared = record.byteLength ?? record.length;
  if (typeof declared === 'number' && Number.isFinite(declared) && declared >= 0) {
    return declared;
  }
  // A blob-shaped wrapper carrying its payload as base64.
  const base64 = record.base64 ?? record.data;
  if (typeof base64 === 'string') return base64ByteLength(base64);
  return undefined;
}

/**
 * True when the value is not a scalar SQLite result and therefore must be
 * rendered as a placeholder rather than stringified. Everything a SQLite cell can
 * legitimately be — NULL, INTEGER, REAL, TEXT, plus JS booleans and bigints the
 * transports may produce — is scalar; anything else is blob-or-worse.
 */
function isBlobLike(value: unknown): boolean {
  if (value === null || value === undefined) return false;
  const type = typeof value;
  return type === 'object' || type === 'function' || type === 'symbol';
}

/** Placeholder text for a blob-like value, sized when the size is derivable. */
function renderBlob(value: unknown): string {
  const length = deriveByteLength(value as object);
  return length === undefined ? BLOB_PLACEHOLDER_UNKNOWN : blobPlaceholder(length);
}

/**
 * Renders one cell as its unquoted CSV text, before quoting rules are applied.
 * Returns undefined for SQL NULL, which the caller must emit as a bare empty
 * field — the sentinel is deliberately distinct from the empty string so the
 * quoting step can tell the two apart (see csvField).
 */
function cellText(value: unknown): string | undefined {
  if (value === null || value === undefined) return undefined;
  if (isBlobLike(value)) return renderBlob(value);
  // Booleans render as `true`/`false`; numbers and bigints use their normal
  // string forms. String() covers all three without special-casing.
  return String(value);
}

/**
 * Quotes a field per Decision 4: quote if and only if the text contains the
 * separator, a quote, LF, or CR; escape an embedded quote by doubling it.
 */
function quoteIfNeeded(text: string): string {
  if (!MUST_QUOTE_CHARS.some((c) => text.includes(c))) return text;
  return QUOTE + text.split(QUOTE).join(QUOTE + QUOTE) + QUOTE;
}

/**
 * Serializes one cell to a CSV field.
 *
 * The NULL / empty-string distinction is the whole reason this function is not
 * just `quoteIfNeeded(String(v))`. CSV has no NULL token, so the two would
 * otherwise both come out as nothing at all and a reader could not tell "no
 * value" from "a value that is the empty string" — a real difference in SQL, and
 * one a developer inspecting a query result cares about. The convention: NULL is
 * an empty UNQUOTED field, the empty string is written as an explicitly quoted
 * `""`. That is why the empty string gets quotes even though it contains none of
 * the characters that normally force quoting.
 */
function csvField(value: unknown): string {
  const text = cellText(value);
  if (text === undefined) return ''; // SQL NULL: empty, unquoted.
  if (text === '') return QUOTE + QUOTE; // Empty string: explicitly quoted.
  return quoteIfNeeded(text);
}

/** Joins one already-serialized row. */
function csvRow(fields: string[]): string {
  return fields.join(FIELD_SEPARATOR);
}

/**
 * Serializes a columnar result to CSV per the conventions in Decision 4.
 *
 * The header row of column names is always emitted, even for a zero-row result,
 * so an empty result still tells the reader what was queried rather than opening
 * a blank document. Column names go through the same quoting rules as data — a
 * column can be an arbitrary SQLite identifier, including one with a comma or a
 * quote in it.
 */
export function rowsToCsv(columns: string[], rows: unknown[][]): string {
  const lines: string[] = [csvRow(columns.map((c) => csvField(c)))];
  for (const row of rows) {
    lines.push(csvRow(row.map((cell) => csvField(cell))));
  }
  // Trailing terminator included so appending or concatenating stays well-formed
  // and the opened document ends on a newline like any other text file.
  return lines.join(LINE_TERMINATOR) + LINE_TERMINATOR;
}

/**
 * True when the result is exactly 1x1 and should render inline instead.
 *
 * Strictly one column AND one row (Decision 5). A 1-row multi-column result is
 * NOT single-cell: squeezing several labeled values into the sidebar's one-line
 * inline slot would drop the column names, so it goes to the CSV document where
 * the header carries them.
 */
export function isSingleCell(columns: string[], rows: unknown[][]): boolean {
  return columns.length === 1 && rows.length === 1;
}

/**
 * Formats a 1x1 value for inline display (NULL -> 'NULL', blob -> '<N bytes>').
 *
 * Unlike the CSV path there is no quoting and no NULL/empty-string ambiguity to
 * resolve: this text is read by a human in the sidebar, so NULL is spelled out as
 * the literal word rather than rendered as absence. The blob placeholder is
 * shared with the CSV path for the same anti-payload reason.
 */
export function formatSingleCell(value: unknown): string {
  const text = cellText(value);
  return text === undefined ? NULL_DISPLAY : text;
}
