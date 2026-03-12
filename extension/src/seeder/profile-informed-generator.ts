/**
 * Profile-Informed Data Generator
 *
 * Extends the base DataGenerator to use column profiler data
 * for generating realistic test data that matches existing distributions.
 */

import type { DriftApiClient } from '../api-client';
import { buildProfileQueries, assembleProfile } from '../profiler/profiler-queries';
import type { IColumnProfile } from '../profiler/profiler-types';
import type { IColumnSeederConfig } from './seeder-types';
import { DataGenerator } from './data-generator';

export interface IProfileCache {
  [tableColumn: string]: IColumnProfile;
}

/**
 * Generate values informed by actual data distributions.
 *
 * When profile data is available:
 * - Numeric columns use actual min/max/mean/stddev
 * - Categorical columns use weighted random from top values
 * - Text columns match length distributions
 */
export class ProfileInformedGenerator extends DataGenerator {
  private _profiles: IProfileCache = {};
  private _loading = new Set<string>();

  constructor(private readonly _client: DriftApiClient) {
    super();
  }

  /**
   * Load profile data for a table's columns.
   * Call this before generating rows to enable profile-informed generation.
   */
  async loadProfiles(
    table: string,
    columns: { name: string; type: string }[],
  ): Promise<void> {
    const promises: Promise<void>[] = [];

    for (const col of columns) {
      const key = `${table}.${col.name}`;
      if (this._profiles[key] || this._loading.has(key)) continue;

      this._loading.add(key);
      promises.push(this._loadProfile(table, col.name, col.type, key));
    }

    await Promise.all(promises);
  }

  /**
   * Check if profile data is available for a column.
   */
  hasProfile(table: string, column: string): boolean {
    return `${table}.${column}` in this._profiles;
  }

  /**
   * Get the profile for a column (if loaded).
   */
  getProfile(table: string, column: string): IColumnProfile | undefined {
    return this._profiles[`${table}.${column}`];
  }

  /**
   * Generate a value using profile data if available.
   */
  override generate(config: IColumnSeederConfig, table?: string): unknown {
    if (!config.isPk && config.nullable) {
      if (Math.random() < config.nullProbability) return null;
    }

    if (table) {
      const profile = this._profiles[`${table}.${config.column}`];
      if (profile) {
        return this._generateFromProfile(config, profile);
      }
    }

    return super.generate(config);
  }

  /**
   * Generate a row using profile data for all columns.
   */
  override generateRow(
    tableName: string,
    columns: IColumnSeederConfig[],
  ): Record<string, unknown> {
    const row: Record<string, unknown> = {};
    for (const col of columns) {
      row[col.column] = this.generate(col, tableName);
    }
    return row;
  }

  /**
   * Clear all cached profiles.
   */
  clearProfiles(): void {
    this._profiles = {};
    this._loading.clear();
  }

  private async _loadProfile(
    table: string,
    column: string,
    type: string,
    key: string,
  ): Promise<void> {
    try {
      const queries = buildProfileQueries(table, column, type);
      const results = new Map<string, unknown[][]>();

      for (const q of queries) {
        try {
          const result = await this._client.sql(q.sql);
          results.set(q.name, result.rows);
        } catch {
          results.set(q.name, []);
        }
      }

      this._profiles[key] = assembleProfile(table, column, type, results);
    } catch {
      // Profile loading failed - will fall back to random generation
    } finally {
      this._loading.delete(key);
    }
  }

  private _generateFromProfile(
    config: IColumnSeederConfig,
    profile: IColumnProfile,
  ): unknown {
    if (profile.isNumeric) {
      return this._generateNumericFromProfile(config, profile);
    }
    return this._generateTextFromProfile(config, profile);
  }

  private _generateNumericFromProfile(
    config: IColumnSeederConfig,
    profile: IColumnProfile,
  ): unknown {
    if (profile.topValues.length > 0 && profile.distinctCount < 20) {
      return this._weightedRandomPick(profile.topValues);
    }

    if (profile.min !== undefined && profile.max !== undefined) {
      const mean = profile.mean ?? (profile.min + profile.max) / 2;
      const stdDev = profile.stdDev ?? (profile.max - profile.min) / 4;

      const value = this._gaussianRandom(mean, stdDev);
      const clamped = Math.max(profile.min, Math.min(profile.max, value));

      if (config.sqlType.toUpperCase().includes('INT')) {
        return Math.round(clamped);
      }
      return Number(clamped.toFixed(2));
    }

    return super.generate(config);
  }

  private _generateTextFromProfile(
    config: IColumnSeederConfig,
    profile: IColumnProfile,
  ): unknown {
    if (profile.topValues.length > 0 && profile.distinctCount < 50) {
      return this._weightedRandomPick(profile.topValues);
    }

    if (profile.patterns && profile.patterns.length > 0) {
      const isEmail = profile.patterns.some((p) => p.pattern.startsWith('@'));
      if (isEmail) {
        const domain = this._weightedRandomPick(
          profile.patterns.map((p) => ({
            value: p.pattern,
            count: p.count,
            percentage: p.percentage,
          })),
        );
        const prefix = this._randomString(8);
        return `${prefix}${domain}`;
      }
    }

    if (profile.minLength !== undefined && profile.maxLength !== undefined) {
      const avgLen = profile.avgLength ?? (profile.minLength + profile.maxLength) / 2;
      const targetLen = Math.round(
        this._gaussianRandom(avgLen, (profile.maxLength - profile.minLength) / 4),
      );
      const clampedLen = Math.max(
        profile.minLength,
        Math.min(profile.maxLength, targetLen),
      );
      return this._randomString(clampedLen);
    }

    return super.generate(config);
  }

  private _weightedRandomPick(
    values: { value: string; count: number; percentage: number }[],
  ): string {
    const totalWeight = values.reduce((sum, v) => sum + v.count, 0);
    let random = Math.random() * totalWeight;

    for (const v of values) {
      random -= v.count;
      if (random <= 0) return v.value;
    }

    return values[values.length - 1]?.value ?? '';
  }

  private _gaussianRandom(mean: number, stdDev: number): number {
    let u1 = Math.random();
    let u2 = Math.random();
    while (u1 === 0) u1 = Math.random();

    const z = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
    return mean + z * stdDev;
  }

  private _randomString(length: number): string {
    const chars = 'abcdefghijklmnopqrstuvwxyz';
    let result = '';
    for (let i = 0; i < length; i++) {
      result += chars[Math.floor(Math.random() * chars.length)];
    }
    return result;
  }
}
