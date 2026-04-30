/**
 * Lightweight OpenAI-compatible chat-completions client for NL-to-SQL.
 */
export interface ILlmConfig {
  apiUrl: string;
  apiKey: string;
  model: string;
  maxTokens: number;
}

/**
 * Performs provider-agnostic NL-to-SQL generation against chat-completions APIs.
 */
export class LlmClient {
  private readonly _config: ILlmConfig;

  constructor(config: ILlmConfig) {
    this._config = config;
  }

  /**
   * Sends schema context and question to the configured LLM and returns SQL.
   * Throws user-facing errors for HTTP and payload-shape failures.
   */
  async generateSql(schemaContext: string, question: string): Promise<string> {
    const systemPrompt = [
      'You are a SQL assistant for SQLite databases.',
      'Given the schema below, write a single SELECT query that answers the user question.',
      'Return ONLY SQL with no explanation.',
      'Use double quotes for identifiers and single quotes for strings.',
      '',
      'Schema:',
      schemaContext,
    ].join('\n');

    const response = await fetch(this._config.apiUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this._config.apiKey}`,
      },
      body: JSON.stringify({
        model: this._config.model,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: question },
        ],
        max_tokens: this._config.maxTokens,
        temperature: 0,
      }),
    });

    if (!response.ok) {
      throw new Error(`LLM request failed (${response.status}).`);
    }

    const json = (await response.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
    };
    const content = json.choices?.[0]?.message?.content;
    if (!content || content.trim().length === 0) {
      throw new Error('LLM returned an empty response.');
    }

    return this._extractSql(content);
  }

  private _extractSql(text: string): string {
    // Providers often wrap output in markdown code fences.
    const match = text.match(/```sql?\s*([\s\S]*?)```/i);
    return (match ? match[1] : text).trim();
  }
}
