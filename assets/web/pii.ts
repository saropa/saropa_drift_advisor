/**
 * PII masking utilities (BUG-015).
 * Pure functions — no shared state. Toggle reads DOM directly.
 */

/** Whether the "Mask sensitive data" toolbar toggle is checked. */
export function isPiiMaskEnabled(): boolean {
  const cb = document.getElementById('tb-mask-checkbox') as HTMLInputElement | null;
  return cb ? cb.checked : false;
}

/**
 * Heuristic: true if column name suggests PII.
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
export function isPiiColumn(colName: string | null | undefined): boolean {
  if (!colName || typeof colName !== 'string') return false;
  const lower = colName.toLowerCase();

  // Substring patterns — safe to match anywhere in the column name
  // because they are long/specific enough to avoid false positives.
  const substringPatterns = [
    'email', 'password', 'phone', 'ssn', 'token', 'secret',
    'api_key', 'apikey', 'address', 'salary', 'wage', 'income',
    'credit_card', 'creditcard', 'card_num', 'ip_addr', 'ipaddr',
    'dob', 'birth', 'passport', 'license', 'licence', 'iban',
    'account_num', 'acct_num', 'sort_code', 'national_id',
    'tax_id', 'sin_num', 'medicare', 'beneficiary', 'ethnicity',
    'religion', 'biometric', 'fingerprint', 'retina', 'face_id',
    'social_sec',
  ];
  if (substringPatterns.some(function (p) { return lower.indexOf(p) >= 0; })) {
    return true;
  }

  // Word-boundary patterns — short names that would false-positive as
  // substrings (e.g. "name" inside "filename", "tel" inside "hotel").
  // Split on common delimiters and check for exact segment matches.
  const segments = lower.split(/[_\-.\s]+/);
  const wordPatterns = new Set([
    'name', 'first', 'last', 'full', 'surname', 'username',
    'login', 'nick', 'alias', 'avatar', 'photo',
    'tel', 'ip', 'sin', 'tin', 'zip', 'postal', 'city', 'country',
    'street', 'lat', 'lng', 'latitude', 'longitude', 'geo', 'coords',
    'routing',
  ]);
  return segments.some(function (seg) { return wordPatterns.has(seg); });
}

/**
 * Returns a masked display value for PII when masking is enabled.
 *
 * Format-aware masking by column type:
 *   email      -> first char + *** + @ + domain
 *   phone/tel  -> ***-***-last4
 *   ssn        -> ***-**-last4
 *   secrets    -> **** (passwords, tokens, api keys, etc.)
 *   names      -> first char + ***
 *   numeric    -> *** (salary, income, card numbers, etc.)
 *   location   -> first 2 chars + ***
 *   other PII  -> first 2 chars + ***
 */
export function maskPiiValue(colName: string, value: unknown): string {
  if (value == null) return '';
  const s = String(value).trim();
  if (s.length === 0) return '';
  const lower = colName.toLowerCase();

  // Email — preserve domain for readability
  if (lower.indexOf('email') >= 0 && s.indexOf('@') >= 0) {
    const at = s.indexOf('@');
    const local = s.slice(0, at);
    const domain = s.slice(at);
    const first = local.charAt(0);
    return (first ? first + '***' : '***') + domain;
  }

  // Compute segments once for all word-boundary checks below.
  const segments = lower.split(/[_\-.\s]+/);

  // Phone / telephone — show last 4 digits.
  // "phone" is a safe substring; "tel" needs word-boundary to avoid "hotel".
  if (lower.indexOf('phone') >= 0 || segments.indexOf('tel') >= 0) {
    const digits = s.replace(/\D/g, '');
    const last4 = digits.length >= 4 ? digits.slice(-4) : '****';
    return '***-***-' + last4;
  }

  // SSN / social security — show last 4 digits
  if (lower.indexOf('ssn') >= 0 || lower.indexOf('social_sec') >= 0) {
    const d = s.replace(/\D/g, '');
    const l4 = d.length >= 4 ? d.slice(-4) : '****';
    return '***-**-' + l4;
  }

  // Secrets — fully redact (passwords, tokens, API keys, etc.)
  const secretPatterns = ['password', 'token', 'secret', 'api_key', 'apikey',
    'biometric', 'fingerprint', 'retina', 'face_id'];
  if (secretPatterns.some(function (p) { return lower.indexOf(p) >= 0; })) {
    return '****';
  }

  // Names — show first initial only
  const nameWords = new Set(['name', 'first', 'last', 'full', 'surname',
    'username', 'login', 'nick', 'alias']);
  if (segments.some(function (seg) { return nameWords.has(seg); })) {
    return s.charAt(0) + '***';
  }

  // Numeric PII — fully redact (salary, credit card, account numbers, etc.)
  const numericSubstrings = ['salary', 'wage', 'income', 'credit_card',
    'creditcard', 'card_num', 'account_num', 'acct_num', 'sort_code',
    'iban', 'sin_num', 'tax_id', 'national_id', 'medicare'];
  const numericSegments = new Set(['routing', 'tin', 'sin']);
  if (numericSubstrings.some(function (p) { return lower.indexOf(p) >= 0; }) ||
      segments.some(function (seg) { return numericSegments.has(seg); })) {
    return '***';
  }

  // Location / address — show first 2 chars
  const locationWords = new Set(['address', 'street', 'city',
    'country', 'zip', 'postal', 'lat', 'lng', 'latitude', 'longitude',
    'geo', 'coords']);
  if (segments.some(function (seg) { return locationWords.has(seg); }) ||
      lower.indexOf('ip_addr') >= 0 || lower.indexOf('ipaddr') >= 0) {
    return s.length <= 2 ? '***' : s.slice(0, 2) + '***';
  }

  // Fallback — first 2 chars + ***
  return s.length <= 2 ? '***' : s.slice(0, 2) + '***';
}

/**
 * Returns the value to display/copy for a cell: masked when PII mask is on and column is PII, else raw.
 * Optional _optMaskOn and _optIsPii avoid repeated DOM/heuristic work when building many cells.
 */
export function getDisplayValue(colName: string, rawValue: unknown, _optMaskOn?: boolean, _optIsPii?: boolean): string {
  const maskOn = _optMaskOn !== undefined ? _optMaskOn : isPiiMaskEnabled();
  const isPii = _optIsPii !== undefined ? _optIsPii : isPiiColumn(colName);
  if (!maskOn || !isPii) return rawValue != null ? String(rawValue) : '';
  return maskPiiValue(colName, rawValue);
}
