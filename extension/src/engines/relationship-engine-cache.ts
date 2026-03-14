/**
 * Cached FK and schema fetchers for RelationshipEngine.
 * Extracted to keep relationship-engine.ts under 300 lines.
 */

import type { DriftApiClient } from '../api-client';
import type { ForeignKey, TableMetadata } from '../api-types';
import type { IRelationshipChain } from './relationship-types';

const DEFAULT_TTL_MS = 60_000;

export interface IRelationshipCache {
  getForeignKeys(table: string): Promise<ForeignKey[]>;
  getReverseForeignKeys(table: string): Promise<IRelationshipChain[]>;
  getSchema(): Promise<TableMetadata[]>;
  clear(): void;
}

/**
 * Create a cache that fetches FK metadata and schema with a TTL.
 */
export function createRelationshipCache(
  client: DriftApiClient,
  ttlMs: number = DEFAULT_TTL_MS,
): IRelationshipCache {
  const fkCache = new Map<string, { fks: ForeignKey[]; time: number }>();
  const reverseFkCache = new Map<string, { fks: IRelationshipChain[]; time: number }>();
  let schemaCache: TableMetadata[] | undefined;
  let schemaCacheTime = 0;

  const getForeignKeys = async (table: string): Promise<ForeignKey[]> => {
    const cached = fkCache.get(table);
    const now = Date.now();
    if (cached && (now - cached.time) < ttlMs) return cached.fks;
    const fks = await client.tableFkMeta(table);
    fkCache.set(table, { fks, time: now });
    return fks;
  };

  const getSchema = async (): Promise<TableMetadata[]> => {
    const now = Date.now();
    if (schemaCache && (now - schemaCacheTime) < ttlMs) return schemaCache;
    schemaCache = await client.schemaMetadata();
    schemaCacheTime = now;
    return schemaCache;
  };

  const getReverseForeignKeys = async (table: string): Promise<IRelationshipChain[]> => {
    const cached = reverseFkCache.get(table);
    const now = Date.now();
    if (cached && (now - cached.time) < ttlMs) return cached.fks;

    const schema = await getSchema();
    const reverseFks: IRelationshipChain[] = [];
    for (const t of schema) {
      if (t.name === table) continue;
      const fks = await getForeignKeys(t.name);
      for (const fk of fks) {
        if (fk.toTable === table) {
          reverseFks.push({
            table: t.name,
            column: fk.fromColumn,
            referencedTable: table,
            referencedColumn: fk.toColumn,
          });
        }
      }
    }
    reverseFkCache.set(table, { fks: reverseFks, time: now });
    return reverseFks;
  };

  const clear = (): void => {
    fkCache.clear();
    reverseFkCache.clear();
    schemaCache = undefined;
  };

  return { getForeignKeys, getReverseForeignKeys, getSchema, clear };
}
