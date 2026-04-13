# Plan 15/28: PII Masking & Data Anonymizer

This document merges **BUG-015** (no PII masking in web UI/exports) and **Feature 28** (PII anonymizer for export). Together they cover: (1) safe viewing—mask PII in the UI and exports; (2) safe sharing—anonymize the dataset and export fake data.

---

## Problem (from BUG-015)

There is no mechanism to detect or redact personally identifiable information (PII) in the web UI or exports. When debugging with production-like data, sensitive columns (emails, passwords, tokens, phone numbers, addresses) are displayed in plain text and included in exports.

**Requirement:** PII masking must be controlled by a **user toggle** (e.g. in the UI header). Without a toggle, users cannot choose when to see real data for debugging vs. when to mask for safety—always-on or always-off masking would be very confusing.

### Impact

- Teams debugging with production-mirror data risk exposing PII on shared screens or in exported files
- No compliance support for GDPR, CCPA, or similar data protection regulations
- Screenshots of the debug UI may inadvertently contain sensitive data
- Exported CSV/SQL dumps include all data unmasked

### Steps to Reproduce

1. Start the debug server with a database containing user PII (email, phone, password hashes)
2. Open the web UI and browse the users table
3. Observe: all PII columns displayed in plain text
4. Export as CSV — all PII included unmasked

---

## Implementation Status

### Web UI / Server (BUG-015) — Partial

**Done:** User toggle "Mask data" in the FAB menu; auto-detect PII columns by two-tier heuristic — substring patterns (email, password, phone, ssn, token, secret, api\_key, address, salary, credit\_card, passport, license, dob, biometric, etc.) and word-boundary patterns (name, first, last, username, tel, ip, city, zip, lat/lng, routing, etc.); format-aware masking (email preserves domain, names show initial, numeric PII fully redacted, locations show 2-char prefix); MASKED badge in masthead pill when active; mask values in table display, search results, and CSV export when toggle is on; copy button and cell popup show masked value when on; re-render on toggle without page refresh.

**Not done:** Server-side configuration of columns to always mask; `.drift-mask.json` config file.

**Component:** Web UI / Server  
**Files:** `lib/src/server/html_content.dart`, `lib/src/server/table_handler.dart`

### Expected Behavior (Web UI)

- **Toggle required:** A clear "Mask sensitive data" (or similar) toggle in the UI header so users can turn masking on or off.
- Auto-detect common PII column patterns (email, password, phone, ssn, token, secret, api_key) via column name heuristics
- When the toggle is *on*, mask values with partial redaction (e.g., "j***@example.com", "***-***-1234")
- Allow server-side configuration of columns to always mask
- Apply masking to exports as well as the UI display
- Consider a `.drift-mask.json` config file for persistent masking rules

---

## Feature 28: Data Anonymizer (Extension)

### What It Does

One-click anonymize sensitive data in the debug database. Auto-detect PII columns (email, name, phone, SSN, address) via column name patterns and replace with realistic fakes while preserving referential integrity and data distribution shape. Export the anonymized data as SQL, JSON, or a portable report.

### User Experience

1. Command palette → "Saropa Drift Advisor: Anonymize Database" or right-click snapshot → "Export Anonymized"
2. A configuration panel opens showing detected PII columns:

```
╔═══════════════════════════════════════════════════════════╗
║  PII ANONYMIZER                                           ║
╠═══════════════════════════════════════════════════════════╣
║                                                           ║
║  Detected PII columns:                                    ║
║                                                           ║
║  ▼ users (1,250 rows)                                    ║
║    ☑ name        TEXT   → Full Name      "Alice Smith"   ║
║    ☑ email       TEXT   → Email          "user42@x.com"  ║
║    ☑ phone       TEXT   → Phone          "+1555…"        ║
║    ☐ role        TEXT   (not PII)                         ║
║    ☐ created_at  TEXT   (not PII)                         ║
║                                                           ║
║  ▼ orders (3,400 rows)                                   ║
║    ☐ id          INT    (not PII)                         ║
║    ☑ shipping_address TEXT → Address   "123 Main St…"    ║
║    ☐ total       REAL   (not PII)                         ║
║                                                           ║
║  ▼ payments (890 rows)                                   ║
║    ☑ card_last4  TEXT   → Redacted       "****"          ║
║    ☑ billing_name TEXT  → Full Name      "Bob Jones"     ║
║                                                           ║
║  Options:                                                 ║
║    ☑ Preserve referential integrity (same input → same   ║
║      output across tables)                                ║
║    ☑ Preserve NULL values                                ║
║    ☐ Preserve data distribution (match length/format)    ║
║                                                           ║
║  Output: (●) SQL  ( ) JSON  ( ) Portable Report         ║
║                                                           ║
║  [Preview 5 Rows]  [Anonymize All]                       ║
╚═══════════════════════════════════════════════════════════╝
```

3. User reviews detected columns, toggles any false positives/negatives
4. Click "Preview" → see 5 sample rows with original vs anonymized side by side
5. Click "Anonymize All" → generates output in chosen format
6. SQL output opens in editor tab; JSON saves to file; Portable Report opens in browser

### New Files

```
extension/src/
  anonymizer/
    anonymizer-panel.ts         # Webview panel for configuration UI
    anonymizer-html.ts          # HTML/CSS/JS template
    pii-detector.ts             # Detects PII columns from name/type/sample data
    anonymizer-engine.ts        # Generates fake replacements with consistency
    anonymizer-formatter.ts     # Formats anonymized data as SQL/JSON
extension/src/test/
  pii-detector.test.ts
  anonymizer-engine.test.ts
  anonymizer-formatter.test.ts
```

### Dependencies

- `api-client.ts` — `schemaMetadata()`, `tableFkMeta()`, `sql()` for data reading
- `data-management/dependency-sorter.ts` (from Feature 20a) — FK-ordered export to maintain referential integrity
- `data-management/dataset-export.ts` (from Feature 20a) — export anonymized data as `.drift-dataset.json`
- `data-management/dataset-types.ts` (from Feature 20a) — `IDriftDataset`, `IFkContext` shared interfaces
- Reuses column name pattern logic from Feature 20 (Test Data Seeder) `column-detector.ts`

## Architecture

### PII Detector

Detects sensitive columns by name pattern, type, and optionally by sampling actual values:

```typescript
type PiiCategory =
  | 'full_name' | 'first_name' | 'last_name'
  | 'email' | 'phone' | 'ssn' | 'credit_card'
  | 'street_address' | 'city' | 'zip_code' | 'country'
  | 'ip_address' | 'url' | 'username' | 'password_hash'
  | 'date_of_birth' | 'custom';

interface IPiiColumn {
  table: string;
  column: string;
  category: PiiCategory;
  confidence: 'high' | 'medium' | 'low';
  sampleValue?: string;
  enabled: boolean;          // user can toggle
}

class PiiDetector {
  private static readonly NAME_PATTERNS: [RegExp, PiiCategory, 'high' | 'medium'][] = [
    [/^e?mail(_address)?$/, 'email', 'high'],
    [/^(full_?)?name$/, 'full_name', 'high'],
    [/^first_?name$/, 'first_name', 'high'],
    [/^last_?name$/, 'last_name', 'high'],
    [/^phone(_number)?$|^mobile$|^tel$/, 'phone', 'high'],
    [/^ssn$|^social_security/, 'ssn', 'high'],
    [/^card_?(number|num|last4)/, 'credit_card', 'high'],
    [/^(street_?)?address(_line)?/, 'street_address', 'high'],
    [/^city$/, 'city', 'medium'],
    [/^zip(_?code)?$|^postal/, 'zip_code', 'medium'],
    [/^country$/, 'country', 'medium'],
    [/^ip(_address)?$/, 'ip_address', 'medium'],
    [/^user_?name$|^login$/, 'username', 'medium'],
    [/^password|^pwd|^pass_hash/, 'password_hash', 'high'],
    [/^(date_of_)?birth|^dob$/, 'date_of_birth', 'high'],
  ];

  detect(
    tables: TableMetadata[],
    sampleData?: Map<string, Record<string, unknown>[]>,
  ): IPiiColumn[] {
    const results: IPiiColumn[] = [];

    for (const table of tables) {
      for (const col of table.columns) {
        if (col.pk) continue; // Never anonymize PKs

        const nameMatch = this._matchByName(col.name);
        if (nameMatch) {
          const sample = sampleData?.get(table.name)?.[0]?.[col.name];
          results.push({
            table: table.name,
            column: col.name,
            category: nameMatch.category,
            confidence: nameMatch.confidence,
            sampleValue: sample != null ? String(sample) : undefined,
            enabled: nameMatch.confidence === 'high',
          });
          continue;
        }

        // Value-based detection (if sample data provided)
        if (sampleData && col.type.toUpperCase().includes('TEXT')) {
          const values = sampleData.get(table.name)
            ?.map(r => r[col.name])
            .filter(v => typeof v === 'string') as string[] | undefined;
          const valueMatch = this._matchByValue(values ?? []);
          if (valueMatch) {
            results.push({
              table: table.name,
              column: col.name,
              category: valueMatch,
              confidence: 'low',
              sampleValue: values?.[0],
              enabled: false, // low confidence = off by default
            });
          }
        }
      }
    }

    return results;
  }

  private _matchByValue(values: string[]): PiiCategory | null {
    if (values.length === 0) return null;
    const sample = values.slice(0, 20);

    // Email pattern
    if (sample.every(v => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v))) return 'email';

    // Phone pattern (various formats)
    if (sample.every(v => /^[\d\s\-\+\(\)]{7,20}$/.test(v))) return 'phone';

    // IP address
    if (sample.every(v => /^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(v))) return 'ip_address';

    return null;
  }
}
```

### Anonymizer Engine

Generates consistent fake replacements — same input value always maps to the same output (preserves referential integrity across tables):

```typescript
class AnonymizerEngine {
  private _mappings = new Map<string, Map<string, unknown>>();
  // Key: "category:originalValue" → fakeValue

  anonymize(
    category: PiiCategory,
    originalValue: unknown,
    preserveDistribution: boolean,
  ): unknown {
    if (originalValue === null || originalValue === undefined) return null;

    const key = `${category}:${String(originalValue)}`;

    // Check consistency cache
    const cached = this._getMapping(key);
    if (cached !== undefined) return cached;

    // Generate new fake
    const fake = this._generate(category, originalValue, preserveDistribution);
    this._setMapping(key, fake);
    return fake;
  }

  private _generate(
    category: PiiCategory,
    original: unknown,
    preserveDistribution: boolean,
  ): unknown {
    const str = String(original);

    switch (category) {
      case 'email': {
        const id = this._nextId('email');
        return `user${id}@example.com`;
      }
      case 'full_name': {
        const first = FIRST_NAMES[this._nextId('fname') % FIRST_NAMES.length];
        const last = LAST_NAMES[this._nextId('lname') % LAST_NAMES.length];
        return `${first} ${last}`;
      }
      case 'first_name':
        return FIRST_NAMES[this._nextId('fname') % FIRST_NAMES.length];
      case 'last_name':
        return LAST_NAMES[this._nextId('lname') % LAST_NAMES.length];
      case 'phone':
        return `+1555${this._randomDigits(7)}`;
      case 'ssn':
        return `***-**-${this._randomDigits(4)}`;
      case 'credit_card':
        return `****${this._randomDigits(4)}`;
      case 'street_address': {
        const num = 100 + this._nextId('addr');
        return `${num} ${STREET_NAMES[this._nextId('street') % STREET_NAMES.length]}`;
      }
      case 'city':
        return CITIES[this._nextId('city') % CITIES.length];
      case 'zip_code':
        return this._randomDigits(5);
      case 'ip_address':
        return `10.0.${this._rand(0, 255)}.${this._rand(1, 254)}`;
      case 'username': {
        const id = this._nextId('user');
        return `user_${id}`;
      }
      case 'password_hash':
        return '[REDACTED]';
      case 'date_of_birth':
        return `${this._rand(1950, 2005)}-${this._pad(this._rand(1, 12))}-${this._pad(this._rand(1, 28))}`;
      case 'country':
        return COUNTRIES[this._nextId('country') % COUNTRIES.length];
      default:
        // Preserve length if distribution mode, otherwise generic
        return preserveDistribution
          ? 'x'.repeat(str.length)
          : '[ANONYMIZED]';
    }
  }

  private _counters = new Map<string, number>();
  private _nextId(ns: string): number {
    const n = (this._counters.get(ns) ?? 0) + 1;
    this._counters.set(ns, n);
    return n;
  }
}
```

### Anonymizer Formatter

Outputs the anonymized data in the chosen format:

```typescript
class AnonymizerFormatter {
  toSql(
    originalTables: Map<string, Record<string, unknown>[]>,
    anonymizedTables: Map<string, Record<string, unknown>[]>,
    piiColumns: IPiiColumn[],
  ): string {
    const lines: string[] = [
      '-- Anonymized database export',
      `-- Generated: ${new Date().toISOString()}`,
      `-- PII columns anonymized: ${piiColumns.filter(c => c.enabled).length}`,
      '',
    ];

    for (const [table, rows] of anonymizedTables) {
      const affected = piiColumns
        .filter(c => c.table === table && c.enabled)
        .map(c => c.column);
      lines.push(`-- ${table}: ${rows.length} rows (anonymized: ${affected.join(', ') || 'none'})`);

      for (const row of rows) {
        const cols = Object.keys(row);
        const vals = cols.map(c => sqlLiteral(row[c]));
        lines.push(
          `INSERT INTO "${table}" (${cols.map(c => `"${c}"`).join(', ')}) VALUES (${vals.join(', ')});`
        );
      }
      lines.push('');
    }

    return lines.join('\n');
  }

  toJson(anonymizedTables: Map<string, Record<string, unknown>[]>): string {
    return JSON.stringify(Object.fromEntries(anonymizedTables), null, 2);
  }
}
```

### Data Flow

```
schemaMetadata() + sql("SELECT * FROM t LIMIT 5")
    │
    ▼
PiiDetector.detect(tables, sampleData)
    │
    ▼
User reviews/toggles PII columns in panel
    │
    ▼
sql("SELECT * FROM t")  for each selected table
    │
    ▼
AnonymizerEngine.anonymize(category, value)  per PII cell
    │ (consistent mapping: same input → same output)
    ▼
AnonymizerFormatter.toSql() / toJson()
    │
    ▼
Output in editor tab or file
```

## Server-Side Changes

None for the anonymizer. It uses existing `schemaMetadata()`, `tableFkMeta()`, and `sql()` endpoints. All anonymization runs extension-side.

For **web UI masking** (BUG-015), server/UI changes are in `lib/src/server/html_content.dart` and `lib/src/server/table_handler.dart`; remaining work: server-side configuration of columns to always mask and `.drift-mask.json` config file.

## package.json Contributions

```jsonc
{
  "contributes": {
    "commands": [
      {
        "command": "driftViewer.anonymizeDatabase",
        "title": "Saropa Drift Advisor: Anonymize Database",
        "icon": "$(shield)"
      }
    ],
    "menus": {
      "view/title": [{
        "command": "driftViewer.anonymizeDatabase",
        "when": "view == driftViewer.databaseExplorer && driftViewer.serverConnected",
        "group": "navigation"
      }]
    },
    "configuration": {
      "properties": {
        "driftViewer.anonymizer.preserveReferentialIntegrity": {
          "type": "boolean",
          "default": true,
          "description": "Ensure the same original value always maps to the same anonymized value across all tables."
        },
        "driftViewer.anonymizer.preserveNulls": {
          "type": "boolean",
          "default": true,
          "description": "Keep NULL values as NULL (do not replace with fake data)."
        },
        "driftViewer.anonymizer.maxRowsPerTable": {
          "type": "number",
          "default": 5000,
          "description": "Maximum rows per table to anonymize."
        }
      }
    }
  }
}
```

## Wiring in extension.ts

```typescript
context.subscriptions.push(
  vscode.commands.registerCommand('driftViewer.anonymizeDatabase', async () => {
    const meta = await client.schemaMetadata();
    const tables = meta.tables.filter(t => !t.name.startsWith('sqlite_'));

    // Sample first 5 rows for PII detection
    const sampleData = new Map<string, Record<string, unknown>[]>();
    for (const t of tables) {
      const result = await client.sql(`SELECT * FROM "${t.name}" LIMIT 5`);
      sampleData.set(t.name, result.rows);
    }

    const detector = new PiiDetector();
    const piiColumns = detector.detect(tables, sampleData);

    if (piiColumns.length === 0) {
      vscode.window.showInformationMessage('No PII columns detected.');
      return;
    }

    AnonymizerPanel.createOrShow(context.extensionUri, client, piiColumns, tables);
  })
);
```

## Testing

- `pii-detector.test.ts`:
  - Detects all name patterns (email, name, phone, ssn, etc.)
  - Skips PK columns
  - Value-based detection for email/phone/IP patterns
  - Confidence levels are correct (high for strong matches, low for value-only)
  - Returns empty for tables with no PII columns
- `anonymizer-engine.test.ts`:
  - Same input → same output (consistency)
  - Different inputs → different outputs
  - NULL preservation
  - Each category generates valid-looking data (email has @, phone has digits, etc.)
  - Cross-table consistency (email in users and orders maps the same)
- `anonymizer-formatter.test.ts`:
  - SQL output has valid INSERT statements
  - JSON output is valid JSON
  - SQL escaping handles quotes and special characters
  - Comment header includes timestamp and PII column count

## Integration Points

### Shared Services Used

| Service | Usage |
|---------|-------|
| SchemaIntelligence | Cached table/column metadata for PII detection |
| RelationshipEngine | Ensure FK consistency when anonymizing related tables |

### Consumes From

| Feature | Data/Action |
|---------|-------------|
| Schema Intelligence Cache (1.2) | Table/column metadata |
| Column Profiler (29) | Value patterns help detect PII (e.g., email regex matches) |
| Data Branching (37) | "Anonymize Branch" before sharing |

### Produces For

| Feature | Data/Action |
|---------|-------------|
| Portable Report (25) | Pre-anonymize data before export |
| Data Branching (37) | "Export Anonymized Branch" |
| Test Data Seeder (20) | Anonymization patterns reused for realistic fake data |

### Cross-Feature Actions

| From | Action | To |
|------|--------|-----|
| Tree View | "Anonymize Database" | PII Anonymizer panel |
| Portable Report | "Export Anonymized" | Report with PII masked |
| Branch Manager | "Export Anonymized Branch" | Anonymized SQL/JSON |
| Column Profiler | "Mark as PII" | Add column to PII config |
| Column Profiler | "Anonymize Column" | Anonymizer with column pre-selected |

### Health Score Contribution

| Metric | Contribution |
|--------|--------------|
| Data Safety | Count of unmasked PII columns detected |
| Action | "Review PII Columns" → opens Anonymizer config |

### Integration with Seeder

The PII Anonymizer's fake data generators are shared with Test Data Seeder (Feature 20):

```typescript
// Shared generator registry
const GENERATORS = {
  'email': () => `user${nextId()}@example.com`,
  'full_name': () => `${randomFirst()} ${randomLast()}`,
  'phone': () => `+1555${randomDigits(7)}`,
  // ...
};

// Used by both:
// - AnonymizerEngine.anonymize(category, value)
// - SeederGenerator.generateValue(column)
```

### Pre-Export Workflow

```
Portable Report Export
    │
    ├── "Include Anonymization?" checkbox
    │
    ▼ (if checked)
PII Anonymizer runs
    │
    ▼
Report generated with masked data
```

---

## Remaining from BUG-015 (Web UI / Server)

- **Server-side configuration** of columns to always mask (independent of toggle).
- **`.drift-mask.json`** config file for persistent masking rules (shared or separate from extension anonymizer config as needed).

---

## Known Limitations

- Name-based detection only — columns named `data` or `notes` containing PII won't be detected
- Value-based detection requires at least 5 sample rows of consistent format
- No support for PII embedded in JSON columns or free-text fields
- Anonymization is one-way — no "de-anonymize" capability
- Large tables (10k+ rows) may take noticeable time to process extension-side
- Consistency map is in-memory — anonymizing the same database twice produces different results
- No support for preserving statistical distribution of numeric PII (e.g., age ranges)
- Generated fake data uses small built-in lists (~50 names) — may have collisions on large datasets
- BLOB columns are skipped entirely
