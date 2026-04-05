import * as assert from 'assert';
import {
  isPiiColumn,
  maskPiiValue,
  getDisplayValue,
} from '../export/pii-masking';

describe('isPiiColumn', () => {
  it('should detect email columns', () => {
    assert.strictEqual(isPiiColumn('email'), true);
    assert.strictEqual(isPiiColumn('user_email'), true);
    assert.strictEqual(isPiiColumn('EMAIL_ADDRESS'), true);
  });

  it('should detect phone and tel columns', () => {
    assert.strictEqual(isPiiColumn('phone'), true);
    assert.strictEqual(isPiiColumn('home_phone'), true);
    assert.strictEqual(isPiiColumn('telephone'), true);
    assert.strictEqual(isPiiColumn('home_tel'), true);
  });

  it('should detect ssn columns', () => {
    assert.strictEqual(isPiiColumn('ssn'), true);
    assert.strictEqual(isPiiColumn('user_ssn'), true);
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

  it('should return false for non-PII columns', () => {
    assert.strictEqual(isPiiColumn('id'), false);
    assert.strictEqual(isPiiColumn('name'), false);
    assert.strictEqual(isPiiColumn('created_at'), false);
    assert.strictEqual(isPiiColumn('status'), false);
  });

  it('should return false for empty/null-ish input', () => {
    assert.strictEqual(isPiiColumn(''), false);
  });
});

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

  it('should mask phone with short digits', () => {
    assert.strictEqual(maskPiiValue('phone', '12'), '***-***-****');
  });

  it('should mask SSN to ***-**-last4', () => {
    assert.strictEqual(maskPiiValue('ssn', '123-45-6789'), '***-**-6789');
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

  it('should mask addresses with first 2 chars', () => {
    assert.strictEqual(maskPiiValue('address', '123 Main St'), '12***');
  });

  it('should mask short addresses', () => {
    assert.strictEqual(maskPiiValue('address', 'AB'), '***');
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

describe('getDisplayValue', () => {
  it('should return raw value when masking is disabled', () => {
    assert.strictEqual(getDisplayValue('email', 'alice@test.com', false), 'alice@test.com');
  });

  it('should return raw value for non-PII column even when masking enabled', () => {
    assert.strictEqual(getDisplayValue('name', 'Alice', true), 'Alice');
  });

  it('should mask PII column when masking is enabled', () => {
    assert.strictEqual(getDisplayValue('email', 'alice@test.com', true), 'a***@test.com');
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
