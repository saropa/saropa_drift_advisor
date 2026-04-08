/**
 * PII masking utilities (BUG-015).
 * Pure functions — no shared state. Toggle reads DOM directly.
 */

/** Whether the "Mask sensitive data" FAB toggle is checked. */
export function isPiiMaskEnabled(): boolean {
  const cb = document.getElementById('fab-pii-mask-toggle') as HTMLInputElement | null;
  return cb ? cb.checked : false;
}

/** Heuristic: true if column name suggests PII (email, password, phone, ssn, token, secret, api_key). */
export function isPiiColumn(colName: string | null | undefined): boolean {
  if (!colName || typeof colName !== 'string') return false;
  const lower = colName.toLowerCase();
  const patterns = ['email', 'password', 'phone', 'ssn', 'token', 'secret', 'api_key', 'apikey', 'address'];
  return patterns.some(function (p) { return lower.indexOf(p) >= 0; });
}

/**
 * Returns a masked display value for PII when masking is enabled.
 * email -> first char + *** + @ + domain; phone -> ***-***-last4; ssn -> ***-**-last4;
 * password/token/secret/api_key -> ****; other PII -> first 2 chars + ***.
 */
export function maskPiiValue(colName: string, value: unknown): string {
  if (value == null) return '';
  const s = String(value).trim();
  if (s.length === 0) return '';
  const lower = colName.toLowerCase();
  if (lower.indexOf('email') >= 0 && s.indexOf('@') >= 0) {
    const at = s.indexOf('@');
    const local = s.slice(0, at);
    const domain = s.slice(at);
    const first = local.charAt(0);
    return (first ? first + '***' : '***') + domain;
  }
  if (lower.indexOf('phone') >= 0 || lower.indexOf('tel') >= 0) {
    const digits = s.replace(/\D/g, '');
    const last4 = digits.length >= 4 ? digits.slice(-4) : '****';
    return '***-***-' + last4;
  }
  if (lower.indexOf('ssn') >= 0) {
    const d = s.replace(/\D/g, '');
    const l4 = d.length >= 4 ? d.slice(-4) : '****';
    return '***-**-' + l4;
  }
  if (lower.indexOf('password') >= 0 || lower.indexOf('token') >= 0 || lower.indexOf('secret') >= 0 || lower.indexOf('api_key') >= 0 || lower.indexOf('apikey') >= 0) {
    return '****';
  }
  if (lower.indexOf('address') >= 0) {
    return s.length <= 2 ? '***' : s.slice(0, 2) + '***';
  }
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
