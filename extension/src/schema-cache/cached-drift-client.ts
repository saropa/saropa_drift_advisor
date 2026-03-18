/**
 * DriftApiClient wrapper that routes schemaMetadata() through SchemaCache.
 * All other methods delegate to the underlying client.
 */

import type { DriftApiClient } from '../api-client';
import type { SchemaCache } from './schema-cache';

/**
 * Client that uses the shared schema cache for schemaMetadata() and delegates
 * all other calls to the underlying DriftApiClient.
 */
export function createCachedDriftClient(
  client: DriftApiClient,
  schemaCache: SchemaCache,
): DriftApiClient {
  return new Proxy(client, {
    get(target, prop: keyof DriftApiClient) {
      if (prop === 'schemaMetadata') {
        return (forceRefresh?: boolean) =>
          schemaCache.getSchemaMetadata(forceRefresh === true);
      }
      const value = target[prop as keyof DriftApiClient];
      if (typeof value === 'function') {
        return (value as (...args: unknown[]) => unknown).bind(target);
      }
      return value;
    },
  }) as DriftApiClient;
}
