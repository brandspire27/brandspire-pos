import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { assistConfig } = require('../dist/pos/assist-config.js');
const { PosAssistService } = require('../dist/pos/pos-assist.service.js');
assert.equal(assistConfig({}).missing.length, 3);
const config = assistConfig({ AI_PROVIDER: ' "Groq" ', GROQ_API_KEY: ' test-secret ', AI_PROVIDER_BASE_URL: 'https://old-provider.invalid' });
assert.equal(config.baseUrl, 'https://api.groq.com/openai/v1');
assert.equal(config.key, 'test-secret');
assert.equal(config.model, 'qwen/qwen3.8-27b');
assert.deepEqual(config.missing, []);
assert.equal(assistConfig({ GROQ_API_KEY: 'test-secret' }).missing.length, 0);
assert.ok(assistConfig({ AI_PROVIDER: 'openai-compatible', GROQ_API_KEY: 'test-secret', AI_PROVIDER_MODEL: 'model' }).missing.length);
process.env.AI_PROVIDER = 'groq';
process.env.GROQ_API_KEY = 'test-secret';
const service = new PosAssistService({});
for (const [status, message] of [[401, /API key/], [403, /denied access/], [429, /quota/], [404, /model/], [500, /temporarily unavailable/]]) {
  globalThis.fetch = async () => new Response('sensitive provider details', { status });
  await assert.rejects(service.draft('org', { mode: 'product', text: 'Please extract a product' }), message);
}
globalThis.fetch = async (url, options) => {
  assert.equal(url, 'https://api.groq.com/openai/v1/chat/completions');
  assert.equal(options.headers.Authorization, 'Bearer test-secret');
  return Response.json({ choices: [{ message: { content: '{"name":"Milk","selling_price":30}' } }] });
};
assert.deepEqual(await service.draft('org', { mode: 'product', text: 'Please extract a product' }), { name: 'Milk', selling_price: 30 });
console.log('AI configuration and mocked provider checks passed; no live provider call made.');
