import assert from 'node:assert/strict';
import { sendSc03Packets } from '../src/lib/sc03-transport.ts';
import { saveSc03PrintIntent, takeSc03PrintIntent } from '../src/lib/sc03-print-intent.ts';

const data=new Map();
const store={getItem:key=>data.get(key)??null,setItem:(key,value)=>data.set(key,value),removeItem:key=>data.delete(key)};
saveSc03PrintIntent(store,'saved-invoice','intent',100);
assert.equal(takeSc03PrintIntent(store,'different-invoice','intent',101),false);
assert.equal(takeSc03PrintIntent(store,'saved-invoice','wrong-token',101),false);
assert.equal(takeSc03PrintIntent(store,'saved-invoice','intent',101),true);
assert.equal(takeSc03PrintIntent(store,'saved-invoice','intent',101),false,'reload/duplicate effect cannot consume twice');
saveSc03PrintIntent(store,'saved-invoice','expired',100);
assert.equal(takeSc03PrintIntent(store,'saved-invoice','expired',600101),false);
saveSc03PrintIntent(store,'saved-invoice','clock-error',100);
assert.equal(takeSc03PrintIntent(store,'saved-invoice','clock-error',99),false);
saveSc03PrintIntent(store,'saved-invoice','storage-error',100);
assert.throws(()=>takeSc03PrintIntent({...store,removeItem:()=>{throw Error('read-only');}},'saved-invoice','storage-error',101),/read-only/,'failure to consume must stop printing');
assert.throws(()=>saveSc03PrintIntent({...store,setItem:()=>{throw Error('full');}},'saved','token',100),/full/);

const packets=Array.from({length:140},(_,i)=>Uint8Array.from({length:56},(_,j)=>(i+j)%256));
async function run(speed){
  const chunks=[], waits=[];
  await sendSc03Packets(packets,{connected:()=>true,write:async bytes=>chunks.push(bytes),wait:async ms=>waits.push(ms)},speed);
  assert.ok(chunks.every(chunk=>chunk.length<=20),'never assume a negotiated larger MTU');
  assert.deepEqual(Buffer.concat(chunks.map(chunk=>Buffer.from(chunk))),Buffer.concat(packets.map(packet=>Buffer.from(packet))));
  assert.equal(waits.filter(ms=>ms===600).length,2,'buffer drains retained');
  assert.equal(waits.at(-1),5000,'end drain retained');
  return waits.reduce((total,ms)=>total+ms,0);
}
const faster=await run('balanced'), compatible=await run('compatible');
assert.ok(faster<compatible);
let attempts=0;
await assert.rejects(sendSc03Packets(packets,{
  connected:()=>true,write:async()=>{if(++attempts===2)throw Error('buffer rejected');},wait:async()=>{}
},'balanced'),/Output may be partial/);
assert.equal(attempts,2,'no retry after possible partial output');
await assert.rejects(sendSc03Packets(packets,{
  connected:()=>false,write:async()=>{throw Error('should not write');},wait:async()=>{}
},'balanced'),/Printer disconnected/);
console.log(`SC03 checkout tests passed: one-shot invoice intent, refresh protection, storage failure, 20-byte chunks, exact packet stream, pacing/drains, partial failure without retry. Simulated waits: ${faster}ms vs ${compatible}ms. Physical speed/output still needs testing.`);
