/**
 * FROM + chained JOIN parsing for the SQL importer. Fills [model.tables] and
 * [model.joins], mapping table aliases to instance ids so later clause parsers
 * can resolve qualified column references.
 */
import type { TableMetadata } from '../api-client';
import {
  createTableInstance,
  makeId,
  type IQueryJoin,
  type IQueryModel,
} from './query-model';
import { parseQualified, unquoteIdent } from './sql-import-utils';

/**
 * Parse FROM and chained JOINs; fills [model.tables] and [model.joins].
 */
export function parseFromAndJoins(
  segment: string,
  model: IQueryModel,
  tableByName: Map<string, TableMetadata>,
  aliasToInstanceId: Map<string, string>,
  warnings: string[],
  errors: string[],
): void {
  let rest = segment.trim();
  const first = /^("(?:[^"]|"")+"|(\w+))(?:\s+(?:AS\s+)?("(?:[^"]|"")+"|(\w+)))?\s*/i.exec(rest);
  if (!first) {
    errors.push('Could not parse first table in FROM');
    return;
  }
  const tableName = first[1]
    ? first[1].startsWith('"')
      ? unquoteIdent(first[1])
      : first[1]
    : first[2]!;
  const aliasToken = first[3] || first[4];
  const alias = aliasToken
    ? first[3]?.startsWith('"')
      ? unquoteIdent(first[3])
      : first[4]!
    : tableName;
  const meta = tableByName.get(tableName);
  if (!meta) {
    errors.push(`Unknown table in schema: ${tableName}`);
    return;
  }
  const root = createTableInstance(model, meta.name, meta.columns, { forcedAlias: alias });
  model.tables.push(root);
  aliasToInstanceId.set(root.alias, root.id);
  rest = rest.slice(first[0].length).trim();

  while (rest.length > 0) {
    const jm =
      /^(INNER|LEFT|RIGHT)?\s*JOIN\s+("(?:[^"]|"")+"|(\w+))(?:\s+(?:AS\s+)?("(?:[^"]|"")+"|(\w+)))?\s+ON\s+/i.exec(
        rest,
      );
    if (!jm) {
      if (/\S/.test(rest)) {
        warnings.push(`Trailing FROM/JOIN text not parsed: ${rest.slice(0, 80)}…`);
      }
      break;
    }
    const joinType = ((jm[1] || 'INNER').toUpperCase()) as IQueryJoin['type'];
    const rtName = jm[2]
      ? jm[2].startsWith('"')
        ? unquoteIdent(jm[2])
        : jm[2]
      : jm[3]!;
    const rtAliasTok = jm[4] || jm[5];
    const rtAlias = rtAliasTok
      ? jm[4]?.startsWith('"')
        ? jm[4].replace(/^"|"$/g, '').replace(/""/g, '"')
        : jm[5]!
      : rtName;
    const afterOn = rest.slice(jm[0].length);
    const nextJoinIdx = afterOn.search(/\b(?:INNER|LEFT|RIGHT)?\s+JOIN\b/i);
    const onClause = (nextJoinIdx >= 0 ? afterOn.slice(0, nextJoinIdx) : afterOn).trim();
    rest = nextJoinIdx >= 0 ? afterOn.slice(nextJoinIdx).trim() : '';

    const metaR = tableByName.get(rtName);
    if (!metaR) {
      errors.push(`Unknown join table: ${rtName}`);
      return;
    }
    const rightInst = createTableInstance(model, metaR.name, metaR.columns, { forcedAlias: rtAlias });
    model.tables.push(rightInst);
    aliasToInstanceId.set(rightInst.alias, rightInst.id);

    const eq = parseJoinOnEquality(onClause);
    if (!eq) {
      errors.push(`Could not parse JOIN ON as column equality: ${onClause}`);
      return;
    }
    let leftId: string;
    let leftCol: string;
    let rightId: string;
    let rightCol: string;
    const newAlias = rightInst.alias;
    if (eq.leftAlias === newAlias) {
      rightId = rightInst.id;
      rightCol = eq.leftCol;
      const other = aliasToInstanceId.get(eq.rightAlias);
      if (!other) {
        errors.push(`Unknown alias in JOIN ON: ${eq.rightAlias}`);
        return;
      }
      leftId = other;
      leftCol = eq.rightCol;
    } else if (eq.rightAlias === newAlias) {
      rightId = rightInst.id;
      rightCol = eq.rightCol;
      const other = aliasToInstanceId.get(eq.leftAlias);
      if (!other) {
        errors.push(`Unknown alias in JOIN ON: ${eq.leftAlias}`);
        return;
      }
      leftId = other;
      leftCol = eq.leftCol;
    } else {
      errors.push('JOIN ON does not reference the newly joined table alias');
      return;
    }

    model.joins.push({
      id: makeId('join'),
      leftTableId: leftId,
      leftColumn: leftCol,
      rightTableId: rightId,
      rightColumn: rightCol,
      type: joinType === 'LEFT' || joinType === 'RIGHT' || joinType === 'INNER' ? joinType : 'INNER',
    });
  }
}

function parseJoinOnEquality(
  on: string,
): { leftAlias: string; leftCol: string; rightAlias: string; rightCol: string } | null {
  const t = on.replace(/\s+/g, ' ').trim();
  const eq = t.indexOf('=');
  if (eq < 0) return null;
  const left = parseQualified(t.slice(0, eq).trim());
  const right = parseQualified(t.slice(eq + 1).trim());
  if (!left || !right) return null;
  return {
    leftAlias: left.alias,
    leftCol: left.col,
    rightAlias: right.alias,
    rightCol: right.col,
  };
}
