import * as assert from 'node:assert';
import * as sinon from 'sinon';
import { LlmClient } from '../nl-sql/llm-client';

describe('LlmClient', () => {
  let fetchStub: sinon.SinonStub;

  beforeEach(() => {
    fetchStub = sinon.stub(globalThis, 'fetch');
  });

  afterEach(() => {
    fetchStub.restore();
  });

  it('extracts SQL from markdown code fences', async () => {
    fetchStub.resolves({
      ok: true,
      json: async () => ({
        choices: [{ message: { content: '```sql\nSELECT 1;\n```' } }],
      }),
    } as Response);

    const client = new LlmClient({
      apiUrl: 'https://example.test/chat',
      apiKey: 'k',
      model: 'm',
      maxTokens: 100,
    });
    const sql = await client.generateSql('users(id INTEGER)', 'all users');
    assert.strictEqual(sql, 'SELECT 1;');
  });

  it('throws for non-200 responses', async () => {
    fetchStub.resolves({ ok: false, status: 429 } as Response);
    const client = new LlmClient({
      apiUrl: 'https://example.test/chat',
      apiKey: 'k',
      model: 'm',
      maxTokens: 100,
    });
    await assert.rejects(
      () => client.generateSql('users(id INTEGER)', 'all users'),
      /failed \(429\)/i,
    );
  });
});
