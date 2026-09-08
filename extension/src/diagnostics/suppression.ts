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
 * its own line suppresses the NEXT code line (skipping blank and comment-only
 * lines, so wrapped rationale text is ignored); a trailing directive (code
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
  /**
   * 0-based lines of field-level directives that resolved to no target
   * (no code line follows anywhere after them in the file). These suppress
   * nothing and are almost always a mistake — e.g. accidentally left at the
   * end of a file after a table/class was deleted or reordered.
   */
  unreachableDirectiveLines: number[];
}

/** Empty suppression set (file with no directives). */
export function emptySuppressions(): IInlineSuppressions {
  return {
    fileAll: false,
    fileCodes: new Set(),
    lineAll: new Set(),
    lineCodes: new Map(),
    unreachableDirectiveLines: [],
  };
}

// Matches `// drift-advisor:ignore` or `:ignore-file`, optional `:`/spaces,
// then everything to end-of-line (or `*/` for block comments). The captured
// tail is parsed by `parseCodes`, which strips `-- rationale` and extracts
// only valid kebab-case code slugs. Case-insensitive on the marker.
const DIRECTIVE_RE =
  /\/\/\s*drift-advisor:ignore(-file)?\b[:\s]*(.*?)(?:\*\/|$)/i;

/**
 * Split a captured code list (`a, b c`) into a normalized set.
 * Strips a rationale suffix first, so `high-null-rate -- by design: ...`
 * yields only `['high-null-rate']`. Accepts `--`, `—` (em dash), or `–` (en
 * dash) as the separator, with any amount of surrounding whitespace —
 * developers don't consistently type a single ASCII space-hyphen-hyphen.
 */
function parseCodes(raw: string): string[] {
  const codesPart = raw.replace(/\s+(--|—|–)\s+.*$/, '');
  return codesPart
    .split(/[\s,]+/)
    .map((c) => c.trim().toLowerCase())
    .filter((c) => /^[a-z0-9]([a-z0-9-]*[a-z0-9])?$/.test(c));
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
    // Skip past any continuation comment lines between the directive and
    // the actual code line it targets (e.g. wrapped rationale text).
    const targetLine = trailing ? i : nextCodeLine(lines, i + 1);
    if (targetLine < 0) {
      // Directive has nothing left to target — record it as unreachable
      // instead of silently dropping it, so it can be surfaced as a
      // diagnostic (see best-practice-provider.ts).
      result.unreachableDirectiveLines.push(i);
      continue;
    }

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

/**
 * First code line index at or after `from`, or -1 if none.
 * Skips blank lines AND comment-only lines, so a directive with a wrapped
 * rationale targets the actual code, not the continuation comment. Handles
 * both `//` line comments and block comments (including `*`-prefixed
 * continuation lines in the doc-comment style), since a rationale could
 * in principle wrap inside either style.
 */
function nextCodeLine(lines: string[], from: number): number {
  let inBlockComment = false;
  for (let i = from; i < lines.length; i++) {
    const trimmed = lines[i].trim();
    if (inBlockComment) {
      if (trimmed.endsWith('*/')) inBlockComment = false;
      continue;
    }
    if (trimmed.length === 0 || trimmed.startsWith('//') || trimmed.startsWith('*')) {
      continue;
    }
    if (trimmed.startsWith('/*')) {
      if (!trimmed.endsWith('*/')) inBlockComment = true;
      continue;
    }
    return i;
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
