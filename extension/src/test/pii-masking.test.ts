import * as assert from 'assert';
import {
  isPiiColumn,
  maskPiiValue,
  getDisplayValue,
} from '../export/pii-masking';

// ---------------------------------------------------------------------------
// isPiiColumn — detection heuristic
// ---------------------------------------------------------------------------

describe('isPiiColumn', () => {
  // -- Substring-matched patterns (match anywhere in column name) -----------

  it('should detect email columns', () => {
    assert.strictEqual(isPiiColumn('email'), true);
    assert.strictEqual(isPiiColumn('user_email'), true);
    assert.strictEqual(isPiiColumn('EMAIL_ADDRESS'), true);
  });

  it('should detect phone columns (substring)', () => {
    assert.strictEqual(isPiiColumn('phone'), true);
    assert.strictEqual(isPiiColumn('home_phone'), true);
    // "telephone" contains "phone" as substring — matches.
    assert.strictEqual(isPiiColumn('telephone'), true);
  });

  it('should detect ssn columns', () => {
    assert.strictEqual(isPiiColumn('ssn'), true);
    assert.strictEqual(isPiiColumn('user_ssn'), true);
    assert.strictEqual(isPiiColumn('social_sec_number'), true);
  });

  it('should detect password/token/secret/api_key columns', () => {
    assert.strictEqual(isPiiColumn('password'), true);
    assert.strictEqual(isPiiColumn('auth_token'), true);
    assert.strictEqual(isPiiColumn('client_secret'), true);
    assert.strictEqual(isPiiColumn('api_key'), true);
    assert.strictEqual(isPiiColumn('apikey'), true);
  });

  it('should detect address columns', () => {
    assert.strictEqual(isPiiColumn('address'), true);
    assert.strictEqual(isPiiColumn('home_address'), true);
  });

  it('should detect financial columns', () => {
    assert.strictEqual(isPiiColumn('salary'), true);
    assert.strictEqual(isPiiColumn('annual_income'), true);
    assert.strictEqual(isPiiColumn('hourly_wage'), true);
    assert.strictEqual(isPiiColumn('credit_card'), true);
    assert.strictEqual(isPiiColumn('creditcard'), true);
    assert.strictEqual(isPiiColumn('card_num'), true);
    assert.strictEqual(isPiiColumn('iban'), true);
    assert.strictEqual(isPiiColumn('account_num'), true);
    assert.strictEqual(isPiiColumn('sort_code'), true);
  });

  it('should detect identity document columns', () => {
    assert.strictEqual(isPiiColumn('passport'), true);
    assert.strictEqual(isPiiColumn('passport_number'), true);
    assert.strictEqual(isPiiColumn('license'), true);
    assert.strictEqual(isPiiColumn('licence_no'), true);
    assert.strictEqual(isPiiColumn('national_id'), true);
    assert.strictEqual(isPiiColumn('tax_id'), true);
  });

  it('should detect biometric columns', () => {
    assert.strictEqual(isPiiColumn('biometric_data'), true);
    assert.strictEqual(isPiiColumn('fingerprint'), true);
    assert.strictEqual(isPiiColumn('face_id'), true);
  });

  it('should detect sensitive demographic columns', () => {
    assert.strictEqual(isPiiColumn('ethnicity'), true);
    assert.strictEqual(isPiiColumn('religion'), true);
    assert.strictEqual(isPiiColumn('dob'), true);
    assert.strictEqual(isPiiColumn('date_of_birth'), true);
  });

  // -- Word-boundary-matched patterns (exact segment match) -----------------

  it('should detect tel as a word boundary (not substring)', () => {
    // "home_tel" splits into ["home", "tel"] — "tel" matches.
    assert.strictEqual(isPiiColumn('home_tel'), true);
    // "hotel" does NOT split into a "tel" segment — no match.
    assert.strictEqual(isPiiColumn('hotel'), false);
    assert.strictEqual(isPiiColumn('hostel_rating'), false);
  });

  it('should detect name-related columns as word boundaries', () => {
    // "name" as a segment matches.
    assert.strictEqual(isPiiColumn('name'), true);
    assert.strictEqual(isPiiColumn('first_name'), true);
    assert.strictEqual(isPiiColumn('last_name'), true);
    assert.strictEqual(isPiiColumn('full_name'), true);
    assert.strictEqual(isPiiColumn('user_name'), true);
    assert.strictEqual(isPiiColumn('surname'), true);
    assert.strictEqual(isPiiColumn('username'), true);
    // "filename" — "name" is a substring but NOT a segment.
    assert.strictEqual(isPiiColumn('filename'), false);
    assert.strictEqual(isPiiColumn('table_name'), true);
  });

  it('should detect location columns as word boundaries', () => {
    assert.strictEqual(isPiiColumn('city'), true);
    assert.strictEqual(isPiiColumn('country'), true);
    assert.strictEqual(isPiiColumn('zip'), true);
    assert.strictEqual(isPiiColumn('postal'), true);
    assert.strictEqual(isPiiColumn('street'), true);
    assert.strictEqual(isPiiColumn('lat'), true);
    assert.strictEqual(isPiiColumn('lng'), true);
    assert.strictEqual(isPiiColumn('latitude'), true);
    assert.strictEqual(isPiiColumn('longitude'), true);
    // "capacity" contains "city" as substring but NOT as segment.
    assert.strictEqual(isPiiColumn('capacity'), false);
  });

  it('should detect ip as word boundary', () => {
    assert.strictEqual(isPiiColumn('ip'), true);
    assert.strictEqual(isPiiColumn('client_ip'), true);
    // "ip_addr" matches via substring pattern.
    assert.strictEqual(isPiiColumn('ip_addr'), true);
    // "recipe" contains "ip" as substring but not segment.
    assert.strictEqual(isPiiColumn('recipe'), false);
    // "zip" — "ip" is a substring but "zip" itself is a separate word pattern.
    assert.strictEqual(isPiiColumn('zip_code'), true);
  });

  it('should detect routing as word boundary', () => {
    assert.strictEqual(isPiiColumn('routing'), true);
    assert.strictEqual(isPiiColumn('bank_routing'), true);
    // "message_routing_key" — "routing" is a segment, matches.
    assert.strictEqual(isPiiColumn('message_routing_key'), true);
  });

  // -- Non-PII columns (false negatives are acceptable) ---------------------

  it('should return false for non-PII columns', () => {
    assert.strictEqual(isPiiColumn('id'), false);
    assert.strictEqual(isPiiColumn('created_at'), false);
    assert.strictEqual(isPiiColumn('status'), false);
    assert.strictEqual(isPiiColumn('description'), false);
    assert.strictEqual(isPiiColumn('count'), false);
    assert.strictEqual(isPiiColumn('is_active'), false);
    assert.strictEqual(isPiiColumn('order_total'), false);
  });

  it('should return false for empty/null-ish input', () => {
    assert.strictEqual(isPiiColumn(''), false);
  });
});

// ---------------------------------------------------------------------------
// maskPiiValue — format-aware masking
// ---------------------------------------------------------------------------

describe('maskPiiValue', () => {
  it('should mask emails preserving first char and domain', () => {
    assert.strictEqual(maskPiiValue('email', 'alice@example.com'), 'a***@example.com');
  });

  it('should handle email with single-char local part', () => {
    assert.strictEqual(maskPiiValue('email', 'a@b.com'), 'a***@b.com');
  });

  it('should mask phone numbers to ***-***-last4', () => {
    assert.strictEqual(maskPiiValue('phone', '555-123-4567'), '***-***-4567');
  });

  it('should mask tel columns the same as phone', () => {
    assert.strictEqual(maskPiiValue('home_tel', '555-123-4567'), '***-***-4567');
  });

  it('should mask phone with short digits', () => {
    assert.strictEqual(maskPiiValue('phone', '12'), '***-***-****');
  });

  it('should mask SSN to ***-**-last4', () => {
    assert.strictEqual(maskPiiValue('ssn', '123-45-6789'), '***-**-6789');
  });

  it('should mask social_sec the same as ssn', () => {
    assert.strictEqual(maskPiiValue('social_sec_number', '123-45-6789'), '***-**-6789');
  });

  it('should fully redact passwords', () => {
    assert.strictEqual(maskPiiValue('password', 'supersecret123'), '****');
  });

  it('should fully redact tokens', () => {
    assert.strictEqual(maskPiiValue('auth_token', 'tok_abc123'), '****');
  });

  it('should fully redact secrets', () => {
    assert.strictEqual(maskPiiValue('client_secret', 'shh'), '****');
  });

  it('should fully redact api keys', () => {
    assert.strictEqual(maskPiiValue('api_key', 'key123'), '****');
    assert.strictEqual(maskPiiValue('apikey', 'key456'), '****');
  });

  it('should fully redact biometric data', () => {
    assert.strictEqual(maskPiiValue('fingerprint', 'abc123hash'), '****');
    assert.strictEqual(maskPiiValue('face_id', 'fid_xyz'), '****');
  });

  it('should mask names to first initial + ***', () => {
    assert.strictEqual(maskPiiValue('name', 'Alice'), 'A***');
    assert.strictEqual(maskPiiValue('first_name', 'Bob'), 'B***');
    assert.strictEqual(maskPiiValue('last_name', 'Smith'), 'S***');
    assert.strictEqual(maskPiiValue('username', 'charlie99'), 'c***');
  });

  it('should fully redact numeric PII (salary, card numbers, etc.)', () => {
    assert.strictEqual(maskPiiValue('salary', '85000'), '***');
    assert.strictEqual(maskPiiValue('credit_card', '4111111111111111'), '***');
    assert.strictEqual(maskPiiValue('account_num', '12345678'), '***');
    assert.strictEqual(maskPiiValue('tax_id', 'XX-1234567'), '***');
  });

  it('should mask routing numbers (word-boundary) as numeric PII', () => {
    assert.strictEqual(maskPiiValue('routing', '021000021'), '***');
  });

  it('should mask addresses with first 2 chars', () => {
    assert.strictEqual(maskPiiValue('address', '123 Main St'), '12***');
  });

  it('should mask location columns with first 2 chars', () => {
    assert.strictEqual(maskPiiValue('city', 'New York'), 'Ne***');
    assert.strictEqual(maskPiiValue('country', 'United States'), 'Un***');
    assert.strictEqual(maskPiiValue('zip', '90210'), '90***');
    assert.strictEqual(maskPiiValue('street', '42 Wallaby Way'), '42***');
  });

  it('should mask short addresses', () => {
    assert.strictEqual(maskPiiValue('address', 'AB'), '***');
  });

  it('should use fallback mask for unrecognized PII categories', () => {
    // "avatar" is PII (detected) but has no specific mask format —
    // falls through to the 2-char prefix fallback.
    assert.strictEqual(maskPiiValue('avatar', 'https://example.com/pic.jpg'), 'ht***');
  });

  it('should return empty string for null', () => {
    assert.strictEqual(maskPiiValue('email', null), '');
  });

  it('should return empty string for undefined', () => {
    assert.strictEqual(maskPiiValue('email', undefined), '');
  });

  it('should return empty string for whitespace-only', () => {
    assert.strictEqual(maskPiiValue('email', '   '), '');
  });
});

// ---------------------------------------------------------------------------
// getDisplayValue — masking gate
// ---------------------------------------------------------------------------

describe('getDisplayValue', () => {
  it('should return raw value when masking is disabled', () => {
    assert.strictEqual(getDisplayValue('email', 'alice@test.com', false), 'alice@test.com');
  });

  it('should return raw value for non-PII column even when masking enabled', () => {
    // "description" is not PII, so masking has no effect.
    assert.strictEqual(getDisplayValue('description', 'Hello world', true), 'Hello world');
  });

  it('should mask PII column when masking is enabled', () => {
    assert.strictEqual(getDisplayValue('email', 'alice@test.com', true), 'a***@test.com');
  });

  it('should mask name columns when masking is enabled', () => {
    // "name" is now PII (word-boundary match).
    assert.strictEqual(getDisplayValue('name', 'Alice', true), 'A***');
    assert.strictEqual(getDisplayValue('first_name', 'Bob', true), 'B***');
  });

  it('should return empty string for null raw value', () => {
    assert.strictEqual(getDisplayValue('id', null, false), '');
    assert.strictEqual(getDisplayValue('id', undefined, false), '');
  });

  it('should stringify non-string raw values', () => {
    assert.strictEqual(getDisplayValue('id', 42, false), '42');
    assert.strictEqual(getDisplayValue('status', true, false), 'true');
  });
});
