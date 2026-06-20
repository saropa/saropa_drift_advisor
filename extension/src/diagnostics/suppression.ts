/**
 * Inline suppression directives for Drift Advisor diagnostics.
 *
 * Lets users silence findings from the Dart source itself, the way Dart's own
 * `// ignore:` / `// ignore_for_file:` work, instead of (or alongside) the
 * settings-based `disabledRules` / `tableExclusions` / `columnExclusions`.
 *
 * Two scopes, a dedicated marker (NOT Dart's `// ignore:` — reusing that would
 * make the Dart analyzer warn about an unknown lint and conflate two systems):
 *
 *   // drift-advisor:ignore high-null-rate
 *   TextColumn get middleName => text().nullable()();
 *
 *   // drift-advisor:ignore-file high-null-rate, data-skew   (anywhere in file)
 *
 * Code list is optional: a bare `ignore` / `ignore-file` suppresses ALL advisor
 * codes for that line / file. Multiple codes are comma- or space-separated.
 *
 * Field-level association mirrors the Dart analyzer: a directive that occupies
 * its own line suppresses the NEXT non-blank line; a trailing directive (code
 * before it on the same line) suppresses its own line. Advisor diagnostics pin
 * to the column getter's line (or the table class line), so the target line is
 * exactly what gets matched against `diagnostic.range.start.line`.
 */

/** Parsed inline suppression state for a single Dart file. */
export interface IInlineSuppressions {
  /** `ignore-file` with no codes — suppress every advisor code in the file. */
  fileAll: boolean;
  /** Codes named by `ignore-file <codes>`. */
  fileCodes: Set<string>;
  /** Lines (0-based) carrying a bare `ignore` — suppress every code there. */
  lineAll: Set<number>;
  /** 0-based line -> codes named by `ignore <codes>` targeting that line. */
  lineCodes: Map<number, Set<string>>;
}

/** Empty suppression set (file with no directives). */
export function emptySuppressions(): IInlineSuppressions {
  return {
    fileAll: false,
    fileCodes: new Set(),
    lineAll: new Set(),
    lineCodes: new Map(),
  };
}

// Matches `// drift-advisor:ignore` or `:ignore-file`, optional `:`/spaces,
// then an optional comma/space-separated code list. Case-insensitive on the
// marker; codes are kebab-case (lowercased on capture).
const DIRECTIVE_RE =
  /\/\/\s*drift-advisor:ignore(-file)?\b[:\s]*([a-z0-9\-,\s]*?)(?:\*\/|$)/i;

/** Split a captured code list (`a, b c`) into a normalized set. */
function parseCodes(raw: string): string[] {
  return raw
    .split(/[\s,]+/)
    .map((c) => c.trim().toLowerCase())
    .filter((c) => c.length > 0);
}

/** True when everything before `index` on the line is whitespace. */
function isFullLineComment(line: string, index: number): boolean {
  return line.slice(0, index).trim().length === 0;
}

/**
 * Parse all inline suppression directives in a Dart source string. Pure: no I/O,
 * so it is fully unit-testable. Lines are 0-based to match VS Code ranges.
 */
export function parseInlineSuppressions(source: string): IInlineSuppressions {
  const result = emptySuppressions();
  // CRLF-safe: the repo stores files with CRLF, so split on either.
  const lines = source.split(/\r?\n/);

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const match = DIRECTIVE_RE.exec(line);
    if (!match) continue;

    // The case-insensitive regex preserves the matched case in the capture, so
    // an uppercase `-FILE` must be lowered before comparison.
    const isFile = (match[1] ?? '').toLowerCase() === '-file';
    const codes = parseCodes(match[2] ?? '');

    if (isFile) {
      // File scope ignores location entirely.
      if (codes.length === 0) result.fileAll = true;
      else for (const c of codes) result.fileCodes.add(c);
      continue;
    }

    // Field scope: a full-line directive targets the next non-blank line; a
    // trailing directive targets its own line.
    const commentIndex = line.indexOf('//');
    const trailing = !isFullLineComment(line, commentIndex);
    const targetLine = trailing ? i : nextNonBlankLine(lines, i + 1);
    if (targetLine < 0) continue;

    if (codes.length === 0) {
      result.lineAll.add(targetLine);
    } else {
      const set = result.lineCodes.get(targetLine) ?? new Set<string>();
      for (const c of codes) set.add(c);
      result.lineCodes.set(targetLine, set);
    }
  }

  return result;
}

/** First non-blank line index at or after `from`, or -1 if none. */
function nextNonBlankLine(lines: string[], from: number): number {
  for (let i = from; i < lines.length; i++) {
    if (lines[i].trim().length > 0) return i;
  }
  return -1;
}

/**
 * True when `code` is inline-suppressed at `line` (0-based) by file-level or
 * line-level directives. Compares codes case-insensitively.
 */
export function isInlineSuppressed(
  supps: IInlineSuppressions,
  code: string,
  line: number,
): boolean {
  const c = code.toLowerCase();
  if (supps.fileAll || supps.fileCodes.has(c)) return true;
  if (supps.lineAll.has(line)) return true;
  return supps.lineCodes.get(line)?.has(c) ?? false;
}
