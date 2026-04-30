/**
 * DVR panel–local type re-exports.
 *
 * Canonical shapes live in `api-types.ts`; this module keeps DVR feature imports
 * grouped without duplicating definitions.
 */

export type {
  IDvrEnvelope,
  IDvrQueriesPage,
  IDvrStatus,
  IRecordedQueryV1,
} from '../api-types';
