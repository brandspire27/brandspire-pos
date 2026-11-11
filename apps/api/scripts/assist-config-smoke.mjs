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
const { GlobalExceptionFilter } = require('../dist/common/filters/global-exception.filter.js');
const { AiProviderException } = require('../dist/common/filters/ai-provider.exception.js');
const { BadGatewayException } = require('@nestjs/common');
let responseBody;
const response = { status() { return this; }, json(body) { responseBody = body; } };
const host = { switchToHttp: () => ({ getResponse: () => response, getRequest: () => ({}) }) };
const originalError = console.error;
console.error = () => {};
try {
  const filter = new GlobalExceptionFilter();
  filter.catch(new AiProviderException('AI provider quota reached.'), host);
  assert.equal(responseBody.message, 'AI provider quota reached.');
  for (const error of [new Error('private details'), new BadGatewayException('private upstream details')]) {
    filter.catch(error, host);
    assert.equal(responseBody.message, 'Internal server error');
  }
} finally { console.error = originalError; }
console.log('Error filter passed: safe AI messages visible; other server errors redacted.');
const productId = '11111111-1111-4111-8111-111111111111';
const billing = new PosAssistService({ listProducts: async () => [{id:productId,name:'Milk',stock:10}] });
globalThis.fetch = async () => Response.json({ choices: [{message:{content:JSON.stringify({items:[{productId,quantity:1}],unresolved:['Bread not found']})}}] });
await assert.rejects(billing.draft('org',{mode:'bill',text:'Please bill milk and bread'}), /Please clarify/);
globalThis.fetch = async () => Response.json({ choices: [{message:{content:JSON.stringify({items:[{productId,quantity:1}],unresolved:[]})}}] });
assert.equal((await billing.draft('org',{mode:'bill',text:'Please bill one milk'})).items[0].quantity,1);
console.log('Cloud bill clarification checks passed.');
