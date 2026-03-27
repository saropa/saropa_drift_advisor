/**
 * Public HTTP endpoint exports for DriftApiClient.
 * Implementation lives in api-client-http-impl to keep this API surface compact.
 */

export type ApiHeaders = Record<string, string>;
export * from './api-client-http-impl';
