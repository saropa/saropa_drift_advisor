/**
 * GROUP BY and ORDER BY parsing for the SQL importer. Both accept only
 * qualified `alias.column` references (ORDER BY additionally an ASC/DESC
 * direction); anything else is reported as a hard error.
 */
import { type IQueryModel } from './query-model';
import { parseQualified, splitCsvRespectingParensAndStrings } from './sql-import-utils';

export function parseGroupBy(
  groupSql: string,
  model: IQueryModel,
  aliasToInstanceId: Map<string, string>,
  errors: string[],
): void {
  for (const part of splitCsvRespectingParensAndStrings(groupSql)) {
    const qc = parseQualified(part.trim());
    if (!qc) {
      errors.push(`GROUP BY column not understood: ${part}`);
      return;
    }
    const tid = aliasToInstanceId.get(qc.alias);
    if (!tid) {
      errors.push(`Unknown alias in GROUP BY: ${qc.alias}`);
      return;
    }
    model.groupBy.push({ tableId: tid, column: qc.col });
  }
}

export function parseOrderBy(
  orderSql: string,
  model: IQueryModel,
  aliasToInstanceId: Map<string, string>,
  errors: string[],
): void {
  for (const part of splitCsvRespectingParensAndStrings(orderSql)) {
    const p = part.trim().replace(/\s+/g, ' ');
    const m = p.match(
      /^("(?:[^"]|"")+"|(\w+))\.("(?:[^"]|"")+"|(\w+))(?:\s+(ASC|DESC))?$/i,
    );
    if (!m) {
      errors.push(`ORDER BY column not understood: ${p}`);
      return;
    }
    const alias = m[1].startsWith('"')
      ? m[1].replace(/^"|"$/g, '').replace(/""/g, '"')
      : m[2]!;
    const col = m[3].startsWith('"')
      ? m[3].replace(/^"|"$/g, '').replace(/""/g, '"')
      : m[4]!;
    const dir = (m[5]?.toUpperCase() ?? 'ASC') as 'ASC' | 'DESC';
    const tid = aliasToInstanceId.get(alias);
    if (!tid) {
      errors.push(`Unknown alias in ORDER BY: ${alias}`);
      return;
    }
    model.orderBy.push({ tableId: tid, column: col, direction: dir === 'DESC' ? 'DESC' : 'ASC' });
  }
}
