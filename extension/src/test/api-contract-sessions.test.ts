// Contract tests for API type definitions — Sessions and Import (doc/API.md).

import * as assert from 'assert';
import type {
  IImportResult,
  ISessionShareResult,
  ISessionData,
  IAnnotation,
} from '../api-types';
import { assertHasKeys } from './api-contract-helpers';

describe('API type contracts — Sessions & Import (doc/API.md)', () => {
  it('ISessionShareResult matches documented shape', () => {
    const result: ISessionShareResult = {
      id: 'abc123',
      url: 'http://localhost:8642/?session=abc123',
      expiresAt: '2025-06-15T11:30:00.000Z',
    };
    assertHasKeys(
      result as unknown as Record<string, unknown>,
      ['id', 'url', 'expiresAt'],
      'ISessionShareResult',
    );
  });

  it('IAnnotation matches documented shape', () => {
    const a: IAnnotation = {
      text: 'Found issue',
      author: 'dev@example.com',
      at: '2025-06-15T10:35:00.000Z',
    };
    assertHasKeys(
      a as unknown as Record<string, unknown>,
      ['text', 'author', 'at'],
      'IAnnotation',
    );
  });

  it('ISessionData matches documented shape', () => {
    const session: ISessionData = {
      state: { currentTable: 'items' },
      createdAt: '2025-06-15T10:30:00.000Z',
      expiresAt: '2025-06-15T11:30:00.000Z',
      annotations: [],
    };
    assertHasKeys(
      session as unknown as Record<string, unknown>,
      ['state', 'createdAt', 'expiresAt', 'annotations'],
      'ISessionData',
    );
    assert.ok(Array.isArray(session.annotations));
  });

  it('IImportResult matches documented shape', () => {
    const result: IImportResult = {
      imported: 5,
      errors: [],
      format: 'csv',
      table: 'users',
    };
    assertHasKeys(
      result as unknown as Record<string, unknown>,
      ['imported', 'errors', 'format', 'table'],
      'IImportResult',
    );
    assert.strictEqual(typeof result.imported, 'number');
    assert.ok(Array.isArray(result.errors));
    assert.strictEqual(typeof result.format, 'string');
    assert.strictEqual(typeof result.table, 'string');
  });
});
