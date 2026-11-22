import assert from 'node:assert/strict';
import { sc03Packet, sc03Row, sc03Init } from '../src/lib/sc03-protocol.ts';
const row=sc03Row(x=>[0,2,7,8,383].includes(x));
assert.deepEqual([...row.slice(0,8)],[81,120,162,0,48,0,133,1]);
assert.equal(row[53],128);
assert.equal(row.length,56);
assert.equal(row.at(-1),255);
// CRC-8/ATM standard check vector.
assert.equal(sc03Packet(0xa2,new TextEncoder().encode('123456789')).at(-2),0xf4);
assert.throws(()=>sc03Packet(0,new Uint8Array(65536)),/too large/);
assert.equal(sc03Init().length,5);
console.log('SC03 protocol: LSB pixel ordering, row width, framing, CRC and oversized packet rejection passed. No hardware writes.');
