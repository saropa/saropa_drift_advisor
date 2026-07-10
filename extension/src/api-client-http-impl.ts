/**
 * Barrel for the HTTP endpoint implementations. The endpoints are grouped by
 * domain into sibling modules; this file re-exports them so existing callers
 * (the api-client facade) keep a single import path. Schema/health/database
 * endpoints live in api-client-http-schema.ts.
 */
export {
  httpGeneration,
  httpMutations,
  httpSql,
  httpExplainSql,
} from './api-client-http-query';
export {
  httpIndexSuggestions,
  httpAnomalies,
  httpIssuesEnvelope,
  httpPerformance,
  httpClearPerformance,
  httpSizeAnalytics,
} from './api-client-http-analytics';
export {
  httpApplyEditsBatch,
  httpGetChangeDetection,
  httpSetChangeDetection,
  httpGetMonitoring,
  httpSetMonitoring,
} from './api-client-http-edits';
export {
  httpDvrStatus,
  httpDvrStart,
  httpDvrStop,
  httpDvrPause,
  httpDvrQueries,
  httpDvrConfig,
  httpDvrQuery,
} from './api-client-http-dvr';
