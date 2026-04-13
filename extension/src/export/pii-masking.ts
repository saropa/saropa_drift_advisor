/**
 * PII detection and masking utilities for export.
 *
 * Mirrors the heuristic logic in assets/web/pii.ts so that
 * extension CSV exports can optionally mask sensitive columns.
 * When updating patterns here, keep assets/web/pii.ts in sync.
 *
 * Two tiers prevent false positives on short words like "tel" (hotel)
 * or "name" (filename):
 *
 * Substring matches (long/specific enough to match anywhere):
 *   email, password, phone, ssn, token, secret, api_key, apikey,
 *   address, salary, wage, income, credit_card, creditcard, card_num,
 *   ip_addr, ipaddr, dob, birth, passport, license, licence, iban,
 *   account_num, acct_num, sort_code, national_id, tax_id, sin_num,
 *   medicare, beneficiary, ethnicity, religion, biometric,
 *   fingerprint, retina, face_id, social_sec
 *
 * Word-boundary matches (split on _ - . space, then exact segment):
 *   name, first, last, full, surname, username, login, nick, alias,
 *   avatar, photo, tel, ip, sin, tin, zip, postal, city, country,
 *   street, lat, lng, latitude, longitude, geo, coords, routing
 */

/**
 * Substring patterns — long/specific enough to match safely anywhere
 * in a column name without false positives.
 */
const PII_SUBSTRING_PATTERNS = [
  'email', 'password', 'phone', 'ssn', 'token', 'secret',
  'api_key', 'apikey', 'address', 'salary', 'wage', 'income',
  'credit_card', 'creditcard', 'card_num', 'ip_addr', 'ipaddr',
  'dob', 'birth', 'passport', 'license', 'licence', 'iban',
  'account_num', 'acct_num', 'sort_code', 'national_id',
  'tax_id', 'sin_num', 'medicare', 'beneficiary', 'ethnicity',
  'religion', 'biometric', 'fingerprint', 'retina', 'face_id',
  'social_sec',
];

/**
 * Word-boundary patterns — short words that would false-positive as
 * substrings (e.g. "name" inside "filename", "tel" inside "hotel").
 * Matched as exact segments after splitting on _ - . space.
 */
const PII_WORD_PATTERNS = new Set([
  'name', 'first', 'last', 'full', 'surname', 'username',
  'login', 'nick', 'alias', 'avatar', 'photo',
  'tel', 'ip', 'sin', 'tin', 'zip', 'postal', 'city', 'country',
  'street', 'lat', 'lng', 'latitude', 'longitude', 'geo', 'coords',
  'routing',
]);

/** Heuristic: true when the column name suggests PII. */
export function isPiiColumn(colName: string): boolean {
  if (!colName) return false;
  const lower = colName.toLowerCase();

  // Check substring patterns first (longer, no false-positive risk).
  if (PII_SUBSTRING_PATTERNS.some((p) => lower.includes(p))) {
    return true;
  }

  // Check word-boundary patterns (split on delimiters, exact match).
  const segments = lower.split(/[_\-.\s]+/);
  return segments.some((seg) => PII_WORD_PATTERNS.has(seg));
}

/**
 * Masks a single value based on the column name heuristic.
 *
 * Format-aware masking by column type:
 *   email      -> first char + *** + @domain
 *   phone/tel  -> ***-***-last4
 *   ssn        -> ***-**-last4
 *   secrets    -> **** (passwords, tokens, api keys, etc.)
 *   names      -> first char + ***
 *   numeric    -> *** (salary, income, card numbers, etc.)
 *   location   -> first 2 chars + ***
 *   other PII  -> first 2 chars + ***
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

  // Compute segments once for all word-boundary checks below.
  const segments = lower.split(/[_\-.\s]+/);

  // Phone / telephone — show last 4 digits.
  // "phone" is a safe substring; "tel" needs word-boundary to avoid "hotel".
  if (lower.includes('phone') || segments.includes('tel')) {
    const digits = s.replace(/\D/g, '');
    const last4 = digits.length >= 4 ? digits.slice(-4) : '****';
    return '***-***-' + last4;
  }

  // SSN / social security — show last 4 digits
  if (lower.includes('ssn') || lower.includes('social_sec')) {
    const digits = s.replace(/\D/g, '');
    const last4 = digits.length >= 4 ? digits.slice(-4) : '****';
    return '***-**-' + last4;
  }

  // Secrets — fully redact (passwords, tokens, API keys, etc.)
  const secretPatterns = ['password', 'token', 'secret', 'api_key', 'apikey',
    'biometric', 'fingerprint', 'retina', 'face_id'];
  if (secretPatterns.some((p) => lower.includes(p))) {
    return '****';
  }

  // Names — show first initial only
  const nameWords = new Set(['name', 'first', 'last', 'full', 'surname',
    'username', 'login', 'nick', 'alias']);
  if (segments.some((seg) => nameWords.has(seg))) {
    return s.charAt(0) + '***';
  }

  // Numeric PII — fully redact (salary, credit card, account numbers, etc.)
  const numericSubstrings = ['salary', 'wage', 'income', 'credit_card',
    'creditcard', 'card_num', 'account_num', 'acct_num', 'sort_code',
    'iban', 'sin_num', 'tax_id', 'national_id', 'medicare'];
  const numericSegments = new Set(['routing', 'tin', 'sin']);
  if (numericSubstrings.some((p) => lower.includes(p)) ||
      segments.some((seg) => numericSegments.has(seg))) {
    return '***';
  }

  // Location / address — show first 2 chars
  const locationWords = new Set(['address', 'street', 'city',
    'country', 'zip', 'postal', 'lat', 'lng', 'latitude', 'longitude',
    'geo', 'coords']);
  if (segments.some((seg) => locationWords.has(seg)) ||
      lower.includes('ip_addr') || lower.includes('ipaddr')) {
    return s.length <= 2 ? '***' : s.slice(0, 2) + '***';
  }

  // Fallback — first 2 chars + ***
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
