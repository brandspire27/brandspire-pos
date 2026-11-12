import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
const listeners={},storage=new Map(),cachedAssets=[];
let disconnected=false,failAssets=false;
const origin='https://pos.example';
const cache={match:async key=>storage.get(typeof key==='string'?key:key.url)?.clone(),put:async(key,value)=>storage.set(key,value.clone()),addAll:async urls=>{if(failAssets)throw Error('quota');cachedAssets.push(...urls);}};
const fetch=async request=>{if(disconnected)throw Error('offline');const path=typeof request==='string'?request:request.url;const response=new Response('<html><script src="/_next/static/app.js"></script><link href="https://external.example/tracker.js"><link href="/api/secret"></html>',{headers:{'content-type':'text/html'}});Object.defineProperty(response,'url',{value:new URL(path,origin).href});return response;};
vm.runInNewContext(await readFile(new URL('../public/pos-sw.js',import.meta.url),'utf8'),{URL,Response,fetch,caches:{open:async()=>cache},self:{location:{origin},addEventListener:(name,handler)=>listeners[name]=handler,skipWaiting(){},clients:{claim(){}}}});
async function prepare(path){let task,result;listeners.message({data:{type:'PREPARE',path,assets:[origin+'/_next/static/lazy.js',origin+'/api/token']},ports:[{postMessage:v=>result=v}],waitUntil:p=>task=p});await task;return result;}
assert.equal((await prepare('/owner/billing')).ok,true);
assert(cachedAssets.every(url=>url.startsWith(origin+'/_next/static/')));
assert.equal(cachedAssets.length,2);
assert(storage.has('/owner/billing'));
failAssets=true;assert.equal((await prepare('/staff/billing')).ok,false);assert.equal(storage.has('/staff/billing'),false);
function request(path,mode='navigate',method='GET'){let response;listeners.fetch({request:{url:origin+path,mode,method},respondWith:p=>response=p});return response;}
disconnected=true;assert.equal((await request('/owner/billing')).status,200);assert.equal((await request('/staff/billing')).status,503);
assert.equal(request('/api/pos/products'),undefined);assert.equal(request('/auth/login'),undefined);assert.equal(request('/owner/billing','cors'),undefined);assert.equal(request('/owner/billing','navigate','POST'),undefined);
console.log('Service worker tests passed: prepared billing fallback, incomplete cache rejection, API/auth/POST exclusion, static asset allowlist. Simulated worker; device offline launch still needs acceptance testing.');
