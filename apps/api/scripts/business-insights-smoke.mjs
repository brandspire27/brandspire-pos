import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
const {BusinessInsightsService}=require('../dist/ai/business-insights.service.js');
Object.assign(process.env,{AI_PROVIDER:'groq',GROQ_API_KEY:'test-only-key',AI_PROVIDER_MODEL:'test-model',AI_PROVIDER_BASE_URL:'https://stale.invalid/v1'});
const queries=[];const database={execute:async(sql,args)=>{queries.push({sql,args});return {rows:[]};}};
const service=new BusinessInsightsService(database);
const original=globalThis.fetch;
try{
 globalThis.fetch=async(url,options)=>{assert.equal(url,'https://api.groq.com/openai/v1/chat/completions');assert.equal(options.headers.Authorization,'Bearer test-only-key');assert.ok(options.signal);return {ok:true,json:async()=>({choices:[{message:{content:'No sales recorded in the supplied snapshot.'}}]})};};
 const result=await service.ask('shop-a','owner',{query:'sales batao'});
 assert.equal(result.configured,true);assert.ok(result.answer);
 for(const q of queries.filter(q=>q.sql.startsWith('SELECT')))assert.equal(q.args[0],'shop-a');
 globalThis.fetch=async()=>({ok:false,status:429});await assert.rejects(service.ask('shop-a','owner',{query:'hello'}),/usage limit/);
 globalThis.fetch=async()=>{throw Error('private upstream detail');};await assert.rejects(service.ask('shop-a','owner',{query:'hello'}),e=>!e.message.includes('private upstream')&&e.message.includes('connect'));
 delete process.env.GROQ_API_KEY;delete process.env.AI_PROVIDER_KEY;
 assert.equal((await service.ask('shop-a','owner',{query:'hello'})).configured,false);
 console.log('Business insights passed: Groq routing/key alias, tenant-scoped snapshot, timeout signal, rate-limit messaging, sanitized failures, missing credentials.');
}finally{globalThis.fetch=original;}
