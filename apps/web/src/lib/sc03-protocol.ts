// SC03h-C6DC: LSB-first rows physically verified on 16 November 2026.
export function sc03Packet(opcode: number, data: Uint8Array): Uint8Array {
  if (data.length > 65535) throw new Error('Printer packet too large');
  let crc = 0;
  for (const value of data) {
    crc ^= value;
    for (let bit = 0; bit < 8; bit++) crc = ((crc << 1) ^ (crc & 128 ? 7 : 0)) & 255;
  }
  return new Uint8Array([81, 120, opcode, 0, data.length & 255, data.length >> 8, ...data, crc, 255]);
}

export function sc03Row(black: (x: number) => boolean): Uint8Array {
  const row = new Uint8Array(48);
  for (let x = 0; x < 384; x++) if (black(x)) row[x >> 3] |= 1 << (x % 8);
  return sc03Packet(0xa2, row);
}

export function sc03Init(): Uint8Array[] {
  return [[0xa3, 0], [0xa4, 0x33], [0xaf, 0x70, 0x44], [0xbe, 0], [0xbd, 0x23]]
    .map(([op, ...data]) => sc03Packet(op, new Uint8Array(data)));
}
