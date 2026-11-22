export type Sc03Speed = 'balanced' | 'compatible';
export type Sc03Transport = {
  connected(): boolean;
  write(value: Uint8Array): Promise<void>;
  wait(ms: number): Promise<void>;
};

/** Keep minimum-MTU writes. Faster pacing is opt-out; never retry partial paper output. */
export async function sendSc03Packets(packets: Iterable<Uint8Array>, transport: Sc03Transport,
  speed: Sc03Speed, progress: (sentPackets: number) => void = () => {}): Promise<void> {
  let attempted = false;
  let count = 0;
  try {
    for (const packet of packets) {
      for (let offset = 0; offset < packet.length; offset += 20) {
        if (!transport.connected()) throw new Error('Printer disconnected');
        attempted = true;
        await transport.write(packet.slice(offset, offset + 20));
        await transport.wait(speed === 'compatible' ? 25 : 12);
      }
      progress(++count);
      if (count % 70 === 0) await transport.wait(600);
    }
    await transport.wait(5000);
    if (!transport.connected()) throw new Error('Printer disconnected before completion could be checked');
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Printer write failed';
    throw new Error(attempted ? `${message}. Output may be partial; check the paper before reprinting. No automatic retry was made.` : message);
  }
}
