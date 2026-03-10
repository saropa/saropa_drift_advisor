import type { ColumnMetadata, ForeignKey } from '../api-types';
import type { GeneratorType, IColumnSeederConfig } from './seeder-types';

/** Name pattern → generator mapping, checked in order. */
const NAME_PATTERNS: readonly [RegExp, GeneratorType, Record<string, unknown>?][] = [
  [/^e?mail/, 'email'],
  [/phone|mobile|tel/, 'phone'],
  [/^url|website|link|href/, 'url'],
  [/^(full_?)?name$/, 'full_name'],
  [/^first_?name/, 'first_name'],
  [/^last_?name/, 'last_name'],
  [/^city/, 'city'],
  [/^country/, 'country'],
  [/^zip|postal/, 'zip_code'],
  [/created|updated|deleted|_at$|_date$|timestamp/, 'datetime'],
  [/^date/, 'date'],
  [/^(is_|has_|can_|should_|active|enabled|visible|published)/, 'boolean'],
  [/price|cost|amount|total|fee/, 'price'],
  [/^age$/, 'integer', { min: 18, max: 80 }],
  [/^(bio|description|content|body|notes|comment)/, 'paragraph'],
  [/^(title|subject|headline)/, 'sentence'],
];

/**
 * Detect the best generator for a column based on PK status,
 * FK relationship, column name patterns, and SQL type fallback.
 */
export function detectGenerator(
  col: ColumnMetadata,
  fk: ForeignKey | undefined,
  nullProbability: number,
): IColumnSeederConfig {
  const base: IColumnSeederConfig = {
    column: col.name,
    sqlType: col.type,
    generator: 'random_string',
    params: {},
    isPk: col.pk,
    nullable: !col.pk,
    nullProbability: col.pk ? 0 : nullProbability,
  };

  if (col.pk) {
    return pkGenerator(base, col.type);
  }

  if (fk) {
    return {
      ...base,
      generator: 'fk_reference',
      params: { toTable: fk.toTable, toColumn: fk.toColumn },
    };
  }

  return nameOrTypeGenerator(base, col);
}

/** Detect generators for all columns in a table. */
export function detectTableGenerators(
  columns: ColumnMetadata[],
  fks: ForeignKey[],
  nullProbability: number,
): IColumnSeederConfig[] {
  return columns.map((col) => {
    const fk = fks.find((f) => f.fromColumn === col.name);
    return detectGenerator(col, fk, nullProbability);
  });
}

function pkGenerator(
  base: IColumnSeederConfig,
  sqlType: string,
): IColumnSeederConfig {
  const isText = sqlType.toUpperCase().includes('TEXT');
  return {
    ...base,
    generator: isText ? 'uuid' : 'auto_increment',
  };
}

function nameOrTypeGenerator(
  base: IColumnSeederConfig,
  col: ColumnMetadata,
): IColumnSeederConfig {
  const name = col.name.toLowerCase();

  for (const [regex, gen, params] of NAME_PATTERNS) {
    if (regex.test(name)) {
      return { ...base, generator: gen, params: params ?? {} };
    }
  }

  return typeGenerator(base, col.type);
}

function typeGenerator(
  base: IColumnSeederConfig,
  sqlType: string,
): IColumnSeederConfig {
  const upper = sqlType.toUpperCase();

  if (upper.includes('INT')) return { ...base, generator: 'integer' };
  if (upper.includes('REAL') || upper.includes('FLOAT')) {
    return { ...base, generator: 'float' };
  }
  if (upper.includes('BOOL')) return { ...base, generator: 'boolean' };

  return base; // random_string default
}
