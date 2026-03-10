/** All recognized generator types for column data synthesis. */
export type GeneratorType =
  | 'auto_increment'
  | 'uuid'
  | 'full_name'
  | 'first_name'
  | 'last_name'
  | 'email'
  | 'phone'
  | 'url'
  | 'city'
  | 'country'
  | 'zip_code'
  | 'datetime'
  | 'date'
  | 'boolean'
  | 'integer'
  | 'float'
  | 'price'
  | 'paragraph'
  | 'sentence'
  | 'fk_reference'
  | 'random_string';

/** All generator types as an array (for UI dropdowns). */
export const GENERATOR_TYPES: readonly GeneratorType[] = [
  'auto_increment',
  'uuid',
  'full_name',
  'first_name',
  'last_name',
  'email',
  'phone',
  'url',
  'city',
  'country',
  'zip_code',
  'datetime',
  'date',
  'boolean',
  'integer',
  'float',
  'price',
  'paragraph',
  'sentence',
  'fk_reference',
  'random_string',
];

/** Configuration for how a single column should be seeded. */
export interface IColumnSeederConfig {
  column: string;
  sqlType: string;
  generator: GeneratorType;
  params: Record<string, unknown>;
  isPk: boolean;
  nullable: boolean;
  nullProbability: number;
}

/** Configuration for an entire table's seed plan. */
export interface ITableSeederConfig {
  table: string;
  rowCount: number;
  columns: IColumnSeederConfig[];
}

/** Result of seed generation for one table. */
export interface ITableSeedResult {
  table: string;
  rows: Record<string, unknown>[];
}

/** Output format for generated seed data. */
export type SeederOutputMode = 'sql' | 'json' | 'execute';

/** Messages from webview to extension. */
export interface ISeederGenerateMessage {
  command: 'generate' | 'preview' | 'exportDataset';
  outputMode: SeederOutputMode;
}

export interface ISeederOverrideMessage {
  command: 'overrideGenerator';
  table: string;
  column: string;
  generator: GeneratorType;
}

export interface ISeederRowCountMessage {
  command: 'setRowCount';
  table: string;
  rowCount: number;
}

export type SeederMessage =
  | ISeederGenerateMessage
  | ISeederOverrideMessage
  | ISeederRowCountMessage;
