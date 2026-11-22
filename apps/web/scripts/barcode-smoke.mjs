import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { lookupBarcodeName, parseBarcodeSuggestion } from '../src/lib/barcode-lookup.ts';
const source={host:'world.openfoodfacts.org',name:'Open Food Facts'};
const code='8901234567890';
assert.equal(parseBarcodeSuggestion({status:0},code,source),null);
assert.equal(parseBarcodeSuggestion({status:1,product:{code:'999',product_name:'Wrong item'}},code,source),null);
const item=parseBarcodeSuggestion({status:1,product:{code,product_name:'Milk',brands:'Example',price:1,tax_rate:99,stock:50}},code,source);
assert.deepEqual(Object.keys(item).sort(),['barcode','name','source','sourceUrl'].sort());
assert.equal(item.name,'Example Milk');
let calls=0;
const original=globalThis.fetch;
try{
  globalThis.fetch=async(url,options)=>{calls++;assert.equal(options.credentials,'omit');return {ok:true,json:async()=>({status:1,product:{code,product_name:'Milk'}})};};
  assert.equal(await lookupBarcodeName('https://bad.example'),null);
  assert.equal(await lookupBarcodeName('PRIVATE-SKU'),null);
  assert.equal(calls,0,'URLs and internal SKUs never leave the shop');
  assert.equal((await lookupBarcodeName(code)).name,'Milk');
  const before=calls;await lookupBarcodeName(code);assert.equal(calls,before,'repeat scans use cache');
  globalThis.fetch=async()=>{throw Error('Offline');};
  assert.equal(await lookupBarcodeName('3017620422003'),null,'lookup failure allows manual entry');
  const abort=new AbortController();abort.abort();assert.equal(await lookupBarcodeName(code,{signal:abort.signal}),null);
}finally{globalThis.fetch=original;}
// Exercise the installed decoder against a real generated retail barcode, not a mocked result.
const require=createRequire(import.meta.url);
const lib=createRequire(require.resolve('@zxing/browser'))('@zxing/library');
const left=['0001101','0011001','0010011','0111101','0100011','0110001','0101111','0111011','0110111','0001011'];
const even=['0100111','0110011','0011011','0100001','0011101','0111001','0000101','0010001','0001001','0010111'];
const right=left.map(bits=>bits.replace(/[01]/g,bit=>bit==='0'?'1':'0'));
const input='5901234123457', parity='LGGLLG';
const bars='00000000000101'+[...input.slice(1,7)].map((digit,i)=>(parity[i]==='L'?left:even)[Number(digit)]).join('')+'01010'+[...input.slice(7)].map(digit=>right[Number(digit)]).join('')+'10100000000000';
const width=bars.length*4,height=120;
const gray=new Uint8ClampedArray(width*height);
for(let y=0;y<height;y++)for(let x=0;x<width;x++)gray[y*width+x]=bars[Math.floor(x/4)]==='1'?0:255;
const bitmap=new lib.BinaryBitmap(new lib.HybridBinarizer(new lib.RGBLuminanceSource(gray,width,height)));
assert.equal(new lib.MultiFormatReader().decode(bitmap).getText(),'5901234123457');
console.log('Barcode decoding, matching, privacy, cache and lookup fallback checks passed.');
