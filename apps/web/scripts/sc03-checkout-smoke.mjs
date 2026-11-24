import assert from 'node:assert/strict';
import { sendSc03Packets } from '../src/lib/sc03-transport.ts';
import { saveSc03PrintIntent, takeSc03PrintIntent } from '../src/lib/sc03-print-intent.ts';
import { connectSc03Printer, prepareSc03Printer, sc03ConnectionName } from '../src/lib/sc03-printer.ts';

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

const originalNavigator=Object.getOwnPropertyDescriptor(globalThis,'navigator');
const originalStorage=Object.getOwnPropertyDescriptor(globalThis,'localStorage');
const printerStorage=new Map();
let chooserCalls=0,connectCalls=0;
const writer={uuid:'0000ae01-0000-1000-8000-00805f9b34fb',properties:{notify:false,indicate:false,writeWithoutResponse:true},startNotifications:async()=>{},writeValueWithoutResponse:async()=>{}};
const notifier={uuid:'0000ae02-0000-1000-8000-00805f9b34fb',properties:{notify:true,indicate:false,writeWithoutResponse:false},startNotifications:async()=>{},writeValueWithoutResponse:async()=>{}};
const printer={id:'sc03-test-device',name:'SC03h test',gatt:{
  connected:false,
  async connect(){this.connected=true;connectCalls+=1;return{getPrimaryService:async()=>({getCharacteristics:async()=>[writer,notifier]})};},
  disconnect(){this.connected=false;}
}};
Object.defineProperty(globalThis,'localStorage',{configurable:true,value:{
  getItem:key=>printerStorage.get(key)??null,
  setItem:(key,value)=>printerStorage.set(key,value),
  removeItem:key=>printerStorage.delete(key)
}});
Object.defineProperty(globalThis,'navigator',{configurable:true,value:{bluetooth:{
  getDevices:async()=>[printer],
  requestDevice:async()=>{chooserCalls+=1;return printer;}
}}});
try {
  await prepareSc03Printer();
  await connectSc03Printer();
  printer.gatt.connected=false;
  await connectSc03Printer();
  assert.equal(chooserCalls,0,'a previously authorized printer reconnects without opening the pairing chooser');
  assert.equal(connectCalls,2,'a disconnected printer reconnects using its saved device');
  assert.equal(sc03ConnectionName(),'SC03h test');
} finally {
  if(originalNavigator)Object.defineProperty(globalThis,'navigator',originalNavigator);else delete globalThis.navigator;
  if(originalStorage)Object.defineProperty(globalThis,'localStorage',originalStorage);else delete globalThis.localStorage;
}
console.log(`SC03 checkout tests passed: reconnect without repeat pairing, one-shot invoice intent, refresh protection, storage failure, 20-byte chunks, exact packet stream, pacing/drains, partial failure without retry. Simulated waits: ${faster}ms vs ${compatible}ms. Physical speed/output still needs testing.`);
