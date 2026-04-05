/**
 * PII detection and masking utilities for export.
 *
 * Mirrors the heuristic logic in assets/web/app.js so that
 * extension CSV exports can optionally mask sensitive columns
 * (email, phone, SSN, password, token, secret, api_key, address).
 */

/**
 * Column name substrings that indicate PII content.
 * Kept in sync with the heuristic in assets/web/app.js isPiiColumn().
 * Note: 'tel' is included alongside 'phone' because maskPiiValue
 * also checks for 'tel' (e.g. "telephone", "home_tel").
 */
const PII_PATTERNS = [
  'email', 'password', 'phone', 'tel', 'ssn', 'token',
  'secret', 'api_key', 'apikey', 'address',
];

/** Heuristic: true when the column name suggests PII. */
export function isPiiColumn(colName: string): boolean {
  if (!colName) return false;
  const lower = colName.toLowerCase();
  return PII_PATTERNS.some((p) => lower.includes(p));
}

/**
 * Masks a single value based on the column name heuristic.
 *
 * - email  → first char + *** + @domain
 * - phone  → ***-***-last4
 * - ssn    → ***-**-last4
 * - password/token/secret/api_key → ****
 * - address/other → first 2 chars + ***
 */
export function maskPiiValue(colName: string, value: unknown): string {
  if (value === null || value === undefined) return '';
  const s = String(value).trim();
  if (s.length === 0) return '';
  const lower = colName.toLowerCase();

  // Email: preserve first char and domain
  if (lower.includes('email') && s.includes('@')) {
    const at = s.indexOf('@');
    const first = s.charAt(0);
    return (first ? first + '***' : '***') + s.slice(at);
  }

  // Phone/tel: last 4 digits only
  if (lower.includes('phone') || lower.includes('tel')) {
    const digits = s.replace(/\D/g, '');
    const last4 = digits.length >= 4 ? digits.slice(-4) : '****';
    return '***-***-' + last4;
  }

  // SSN: last 4 digits only
  if (lower.includes('ssn')) {
    const digits = s.replace(/\D/g, '');
    const last4 = digits.length >= 4 ? digits.slice(-4) : '****';
    return '***-**-' + last4;
  }

  // Fully redact passwords, tokens, secrets, API keys
  if (
    lower.includes('password') ||
    lower.includes('token') ||
    lower.includes('secret') ||
    lower.includes('api_key') ||
    lower.includes('apikey')
  ) {
    return '****';
  }

  // Address and catch-all: first 2 chars + ***
  return s.length <= 2 ? '***' : s.slice(0, 2) + '***';
}

/**
 * Returns the display value for a cell, masked when the column is PII.
 *
 * @param maskEnabled - Whether masking is active for this export.
 */
export function getDisplayValue(
  colName: string,
  rawValue: unknown,
  maskEnabled: boolean,
): string {
  if (!maskEnabled || !isPiiColumn(colName)) {
    return rawValue !== null && rawValue !== undefined ? String(rawValue) : '';
  }
  return maskPiiValue(colName, rawValue);
}
