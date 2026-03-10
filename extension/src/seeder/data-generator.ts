import type { IColumnSeederConfig } from './seeder-types';

/* ── Word lists ── */

const FIRST_NAMES = [
  'Alice', 'Bob', 'Carol', 'David', 'Eve', 'Frank', 'Grace', 'Henry',
  'Irene', 'Jack', 'Karen', 'Leo', 'Maria', 'Nick', 'Olivia', 'Paul',
  'Quinn', 'Rosa', 'Sam', 'Tina', 'Uma', 'Victor', 'Wendy', 'Xavier',
  'Yuki', 'Zara', 'Alex', 'Beth', 'Chris', 'Dana', 'Eli', 'Faye',
  'George', 'Holly', 'Ivan', 'Julia', 'Kyle', 'Luna', 'Max', 'Nora',
  'Oscar', 'Piper', 'Ray', 'Sofia', 'Tyler', 'Vera', 'Will', 'Xena',
];

const LAST_NAMES = [
  'Smith', 'Johnson', 'Williams', 'Brown', 'Jones', 'Garcia', 'Miller',
  'Davis', 'Rodriguez', 'Martinez', 'Hernandez', 'Lopez', 'Wilson',
  'Anderson', 'Thomas', 'Taylor', 'Moore', 'Jackson', 'Martin', 'Lee',
  'Perez', 'Thompson', 'White', 'Harris', 'Sanchez', 'Clark', 'Lewis',
  'Robinson', 'Walker', 'Young', 'Allen', 'King', 'Wright', 'Scott',
  'Hill', 'Green', 'Adams', 'Baker', 'Nelson', 'Carter', 'Mitchell',
  'Roberts', 'Turner', 'Phillips', 'Campbell', 'Parker', 'Evans', 'Chen',
];

const CITIES = [
  'New York', 'London', 'Tokyo', 'Paris', 'Berlin', 'Sydney', 'Toronto',
  'Mumbai', 'São Paulo', 'Seoul', 'Bangkok', 'Dubai', 'Singapore',
  'Istanbul', 'Mexico City', 'Cairo', 'Moscow', 'Jakarta', 'Lima',
  'Nairobi', 'Rome', 'Barcelona', 'Vienna', 'Prague', 'Oslo',
  'Amsterdam', 'Dublin', 'Lisbon', 'Helsinki', 'Warsaw',
];

const COUNTRIES = [
  'United States', 'United Kingdom', 'Japan', 'France', 'Germany',
  'Australia', 'Canada', 'India', 'Brazil', 'South Korea', 'Thailand',
  'UAE', 'Singapore', 'Turkey', 'Mexico', 'Egypt', 'Russia', 'Indonesia',
  'Peru', 'Kenya', 'Italy', 'Spain', 'Austria', 'Czech Republic',
  'Norway', 'Netherlands', 'Ireland', 'Portugal', 'Finland', 'Poland',
];

const LOREM_WORDS = [
  'lorem', 'ipsum', 'dolor', 'sit', 'amet', 'consectetur', 'adipiscing',
  'elit', 'sed', 'do', 'eiusmod', 'tempor', 'incididunt', 'ut', 'labore',
  'et', 'dolore', 'magna', 'aliqua', 'enim', 'ad', 'minim', 'veniam',
  'quis', 'nostrud', 'exercitation', 'ullamco', 'laboris', 'nisi',
  'aliquip', 'ex', 'ea', 'commodo', 'consequat', 'duis', 'aute', 'irure',
  'in', 'reprehenderit', 'voluptate', 'velit', 'esse', 'cillum', 'fugiat',
  'nulla', 'pariatur', 'excepteur', 'sint', 'occaecat', 'cupidatat',
  'proident', 'sunt', 'culpa', 'qui', 'officia', 'deserunt', 'mollit',
  'anim', 'id', 'est', 'laborum',
];

/* ── Helpers ── */

function pick<T>(arr: readonly T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

function randInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function randDigits(n: number): string {
  let s = '';
  for (let i = 0; i < n; i++) {
    s += String(Math.floor(Math.random() * 10));
  }
  return s;
}

function uuid(): string {
  const h = '0123456789abcdef';
  const seg = (n: number): string => {
    let s = '';
    for (let i = 0; i < n; i++) s += h[Math.floor(Math.random() * 16)];
    return s;
  };
  return `${seg(8)}-${seg(4)}-4${seg(3)}-${h[8 + Math.floor(Math.random() * 4)]}${seg(3)}-${seg(12)}`;
}

function randomDate(yearsBack = 3): string {
  const now = Date.now();
  const range = yearsBack * 365 * 24 * 60 * 60 * 1000;
  return new Date(now - Math.random() * range).toISOString();
}

function sentence(wordCount = 8): string {
  const words: string[] = [];
  for (let i = 0; i < wordCount; i++) words.push(pick(LOREM_WORDS));
  const s = words.join(' ');
  return s.charAt(0).toUpperCase() + s.slice(1) + '.';
}

function paragraph(sentenceCount = 3): string {
  const sentences: string[] = [];
  for (let i = 0; i < sentenceCount; i++) {
    sentences.push(sentence(randInt(5, 12)));
  }
  return sentences.join(' ');
}

/* ── Generator class ── */

/** Stateful generator that produces values based on column configs. */
export class DataGenerator {
  private _counters = new Map<string, number>();
  private _generatedPks = new Map<string, unknown[]>();

  /** Reset all counters and stored PKs. */
  reset(): void {
    this._counters.clear();
    this._generatedPks.clear();
  }

  /** Store generated PK values for a table (used for FK lookback). */
  registerPks(table: string, pks: unknown[]): void {
    this._generatedPks.set(table, pks);
  }

  /** Get stored PKs for a parent table (FK resolution). */
  getParentPks(table: string): unknown[] {
    return this._generatedPks.get(table) ?? [];
  }

  /** Generate a single value for a column configuration. */
  generate(config: IColumnSeederConfig): unknown {
    if (!config.isPk && config.nullable) {
      if (Math.random() < config.nullProbability) return null;
    }
    return this._dispatch(config);
  }

  /** Generate a full row (all columns) for a table. */
  generateRow(
    tableName: string,
    columns: IColumnSeederConfig[],
  ): Record<string, unknown> {
    const row: Record<string, unknown> = {};
    for (const col of columns) {
      row[col.column] = this.generate(col);
    }
    return row;
  }

  private _dispatch(config: IColumnSeederConfig): unknown {
    switch (config.generator) {
      case 'auto_increment': return this._autoIncrement(config.column);
      case 'uuid': return uuid();
      case 'full_name': return `${pick(FIRST_NAMES)} ${pick(LAST_NAMES)}`;
      case 'first_name': return pick(FIRST_NAMES);
      case 'last_name': return pick(LAST_NAMES);
      case 'email': return this._email();
      case 'phone': return `+1${randDigits(10)}`;
      case 'url': return `https://example.com/${randDigits(6)}`;
      case 'city': return pick(CITIES);
      case 'country': return pick(COUNTRIES);
      case 'zip_code': return randDigits(5);
      case 'datetime': return randomDate();
      case 'date': return randomDate().slice(0, 10);
      case 'boolean': return Math.random() > 0.5 ? 1 : 0;
      case 'integer': return this._integer(config.params);
      case 'float': return this._float(config.params);
      case 'price': return +(Math.random() * 998 + 1).toFixed(2);
      case 'paragraph': return paragraph();
      case 'sentence': return sentence();
      case 'fk_reference': return this._fkReference(config.params);
      case 'random_string': return sentence(3).slice(0, 20);
    }
  }

  private _autoIncrement(column: string): number {
    const current = this._counters.get(column) ?? 0;
    const next = current + 1;
    this._counters.set(column, next);
    return next;
  }

  private _email(): string {
    const first = pick(FIRST_NAMES).toLowerCase();
    return `${first}${randInt(1, 999)}@example.com`;
  }

  private _integer(params: Record<string, unknown>): number {
    const min = typeof params.min === 'number' ? params.min : 0;
    const max = typeof params.max === 'number' ? params.max : 10000;
    return randInt(min, max);
  }

  private _float(params: Record<string, unknown>): number {
    const min = typeof params.min === 'number' ? params.min : 0;
    const max = typeof params.max === 'number' ? params.max : 1000;
    return +(Math.random() * (max - min) + min).toFixed(2);
  }

  private _fkReference(params: Record<string, unknown>): unknown {
    const table = params.toTable as string | undefined;
    if (!table) return null;
    const pks = this.getParentPks(table);
    return pks.length > 0 ? pick(pks) : null;
  }
}
