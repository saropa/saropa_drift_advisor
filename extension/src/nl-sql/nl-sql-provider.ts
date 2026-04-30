import type { SchemaContextBuilder } from './schema-context-builder';
import type { LlmClient } from './llm-client';
import type { NlSqlHistory } from './nl-sql-history';
import { validateGeneratedSql } from './sql-validator';

/**
 * Orchestrates NL-to-SQL generation:
 * 1) build schema context, 2) call LLM, 3) validate SQL, 4) persist history.
 */
export class NlSqlProvider {
  private readonly _contextBuilder: SchemaContextBuilder;
  private readonly _llmClient: LlmClient;
  private readonly _history: NlSqlHistory;

  constructor(
    contextBuilder: SchemaContextBuilder,
    llmClient: LlmClient,
    history: NlSqlHistory,
  ) {
    this._contextBuilder = contextBuilder;
    this._llmClient = llmClient;
    this._history = history;
  }

  /** Generates, validates, and stores SQL for a natural-language question. */
  async ask(question: string): Promise<string> {
    const schemaContext = await this._contextBuilder.build();
    const sql = await this._llmClient.generateSql(schemaContext, question);
    validateGeneratedSql(sql);
    this._history.add(question, sql);
    return sql;
  }
}
