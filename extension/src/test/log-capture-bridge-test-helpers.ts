/**
 * Shared fixtures and fetch stubs for LogCaptureBridge tests.
 */

import * as sinon from 'sinon';

/** Base URL used by the test client. */
export const BASE = 'http://127.0.0.1:8642';

/** Minimal end context for onSessionEnd. */
export function mockEndContext(overrides: Partial<{ baseFileName: string; config: object }> = {}) {
  return {
    baseFileName: '20250319_120000_app',
    logUri: { fsPath: '/tmp/logs/20250319_120000_app.log' },
    logDirUri: { fsPath: '/tmp/logs' },
    sessionStartTime: Date.now() - 60000,
    sessionEndTime: Date.now(),
    config: {},
    ...overrides,
  };
}

/**
 * Stubs fetch for the session-end endpoints used by the bridge.
 * Unrecognized URLs reject to catch unexpected network calls in tests.
 */
export function stubSessionEndFetch(
  fetchStub: sinon.SinonStub,
  responses: {
    performance?: object;
    anomalies?: object[];
    schema?: object[];
    health?: object;
    indexSuggestions?: object[];
  },
): void {
  const defaultPerf = {
    totalQueries: 0,
    totalDurationMs: 0,
    avgDurationMs: 0,
    slowQueries: [],
    recentQueries: [],
  };

  fetchStub.callsFake((input: string | Request | URL) => {
    const url = typeof input === 'string' ? input : (input as Request).url;
    if (url.includes('/api/analytics/performance')) {
      return Promise.resolve(
        new Response(JSON.stringify(responses.performance ?? defaultPerf), { status: 200 }),
      );
    }
    if (url.includes('/api/analytics/anomalies')) {
      return Promise.resolve(
        new Response(JSON.stringify(responses.anomalies ?? []), { status: 200 }),
      );
    }
    if (url.includes('/api/schema/metadata')) {
      return Promise.resolve(
        new Response(JSON.stringify(responses.schema ?? []), { status: 200 }),
      );
    }
    if (url.includes('/api/health')) {
      return Promise.resolve(
        new Response(JSON.stringify(responses.health ?? { ok: false }), { status: 200 }),
      );
    }
    if (url.includes('/api/index-suggestions')) {
      return Promise.resolve(
        new Response(JSON.stringify(responses.indexSuggestions ?? []), { status: 200 }),
      );
    }
    return Promise.reject(new Error(`Unexpected fetch: ${url}`));
  });
}
