/**
 * SELECT-list parsing for the SQL importer: plain qualified columns and
 * single-column aggregates (SUM/COUNT/AVG/MIN/MAX) with optional output alias.
 * `*` is treated as "all columns" (no explicit selection in the model).
 */
import {
  type AggregateFn,
  type IQueryModel,
} from './query-model';
import { parseQualified, splitCsvRespectingParensAndStrings } from './sql-import-utils';

export function parseSelectList(
  selectList: string,
  model: IQueryModel,
  aliasToInstanceId: Map<string, string>,
  warnings: string[],
  errors: string[],
): void {
  if (/^\*\s*$/i.test(selectList) || selectList === '*') {
    return;
  }
  const parts = splitCsvRespectingParensAndStrings(selectList);
  for (const part of parts) {
    const p = part.trim();
    if (!p) continue;
    const aggRe =
      /^(SUM|COUNT|AVG|MIN|MAX)\s*\(\s*("(?:[^"]|"")+"|(\w+))\s*\.\s*("(?:[^"]|"")+"|(\w+))\s*\)(?:\s+AS\s+("(?:[^"]|"")+"|(\w+)))?/i;
    const am = p.match(aggRe);
    if (am) {
      const fn = am[1].toUpperCase() as AggregateFn;
      const aAlias = am[2].startsWith('"')
        ? am[2].replace(/^"|"$/g, '').replace(/""/g, '"')
        : am[3]!;
      const aCol = am[4].startsWith('"')
        ? am[4].replace(/^"|"$/g, '').replace(/""/g, '"')
        : am[5]!;
      const outAlias = am[6]
        ? am[6].startsWith('"')
          ? am[6].replace(/^"|"$/g, '').replace(/""/g, '"')
          : am[7]
        : undefined;
      const tid = aliasToInstanceId.get(aAlias);
      if (!tid) {
        errors.push(`Unknown alias in aggregate: ${aAlias}`);
        return;
      }
      model.selectedColumns.push({
        tableId: tid,
        column: aCol,
        aggregation: fn,
        alias: outAlias,
      });
      continue;
    }
    const qc = parseQualified(p);
    if (qc) {
      const tid = aliasToInstanceId.get(qc.alias);
      if (!tid) {
        errors.push(`Unknown alias in SELECT: ${qc.alias}`);
        return;
      }
      model.selectedColumns.push({ tableId: tid, column: qc.col });
      continue;
    }
    warnings.push(`Skipped SELECT expression: ${p.slice(0, 80)}`);
  }
}
