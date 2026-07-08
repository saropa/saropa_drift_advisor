# Feature & Fix Specification: Semantic Boolean Mapping via Drift Metadata

## Overview & Objective

In SQLite, a native boolean type does not exist; booleans are stored as `INTEGER` types containing `0` or `1`. Because `saropa_drift_advisor` currently reads column structures directly from raw SQLite query results or `PRAGMA table_info`, boolean fields authored in Drift are incorrectly displayed as `int` (showing `0` or `1`) in the VS Code data grids and table inspector.

The objective is to fix this by bridging the raw SQLite results with Drift's generated Dart metadata (`TableInfo` and `DriftSqlType`). By inspecting the actual Drift schema in the Dart debug server, we can instruct the VS Code extension to render these specific integers as `true` / `false` booleans.

---

## 1. Technical Analysis & Root Cause

When a user defines a boolean in Drift:
```dart
BoolColumn get isActive => boolean()();
```
Drift's generator builds a `TableInfo` class where this column's `.type` property is explicitly set to `DriftSqlType.bool`. However, when the database is queried, the underlying `sqlite3` driver returns standard integers. 

To fix this, the Dart debug server must map the raw SQLite columns to their corresponding `GeneratedColumn` in Drift's `TableInfo`, extract the `DriftSqlType`, and pass this semantic type across the IPC/WebSocket boundary to the extension.

---

## 2. Implementation Architecture

As a mixed-language repository, the fix requires coordinated changes in both the Dart server and the TypeScript extension.

### 2a. Dart Debug Server (`lib/src/`)
The server's schema-discovery mechanism must be upgraded to read from the `GeneratedDatabase` instance rather than relying solely on database pragmas.

1. **Extracting Drift Types:**
   When generating the table manifest to send to the client, iterate through the database's tables and check the `type` property of each column:
   ```dart
   final db = // ... instance of GeneratedDatabase
   for (final table in db.allTables) {
     for (final column in table.$columns) {
       final isBoolean = column.type == DriftSqlType.bool;
       // Package this flag into the schema payload
     }
   }
   ```
2. **Payload Enrichment:**
   The JSON payload sent to the VS Code extension must now include a `driftType` alongside the raw SQLite type:
   ```json
   {
     "name": "is_active",
     "sqliteType": "INTEGER",
     "driftType": "bool"
   }
   ```

### 2b. VS Code Extension (`extension/src/`)
The TypeScript layer must consume the `driftType` property to format the UI correctly.

1. **Data Grid Formatting:**
   In the grid renderer, intercept the cell value evaluation. If the schema defines the column as `driftType: 'bool'`, cast the raw `0`/`1` integer to a boolean string:
   ```typescript
   function formatCell(value: any, meta: ColumnMetadata): string {
     if (meta.driftType === 'bool') {
       if (value === 1) return 'true';
       if (value === 0) return 'false';
       if (value === null) return 'NULL';
     }
     return String(value);
   }
   ```
2. **Database Sidebar Icons:**
   Update the tree view provider. Columns matching `driftType === 'bool'` should display a distinct boolean icon (e.g., a checkbox or `[B]`) instead of the numeric `[#]` icon used for standard integers.

---

## 3. Edge Cases & Fallbacks

* **Raw Custom SQL Queries:** When a user executes a custom `SELECT` statement in the SQL Notebook (e.g., `SELECT is_active, COUNT(*) FROM users`), the result set might not immediately map to a known `TableInfo` column. The extension should attempt to match the column name to the table's schema if the context is known. If it cannot be matched, it must safely fall back to displaying the raw integer without crashing.
* **Legacy Compatibility:** If the extension connects to an older version of the Dart debug server that does not transmit `driftType`, the UI must gracefully default to the raw `sqliteType`.

---

## 4. Verification & Testing Guardrails

Prior to release, the following checks must be satisfied, matching the strict standards of the repository:

- [ ] **Dart Schema Serialization Test:** Write a unit test in `lib/src/` asserting that a table defined with `BoolColumn` correctly outputs `"driftType": "bool"` in its JSON map.
- [ ] **TypeScript Renderer Test:** Write a unit test in `extension/src/` asserting that `formatCell(1, { driftType: 'bool' })` outputs `'true'` and not `'1'`.
- [ ] **Mixed-Language CI Pass:** Ensure all builds pass cleanly without warnings:
  ```bash
  npm run check-types
  npm run lint
  npm run compile