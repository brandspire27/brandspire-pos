import { sc03Init, sc03Packet, sc03Row } from './sc03-protocol';
import { sendSc03Packets, type Sc03Speed } from './sc03-transport';
import { saveSc03PrintIntent, takeSc03PrintIntent } from './sc03-print-intent';
export type { Sc03Speed } from './sc03-transport';

type Characteristic = {
  uuid: string;
  properties: { notify: boolean; indicate: boolean; writeWithoutResponse: boolean };
  startNotifications(): Promise<unknown>;
  writeValueWithoutResponse(value: Uint8Array): Promise<void>;
};
type Service = { getCharacteristics(): Promise<Characteristic[]> };
type Device = { id: string; name?: string; gatt?: { connected: boolean; connect(): Promise<{ getPrimaryService(uuid: string): Promise<Service> }>; disconnect(): void } };
type Bluetooth = {
  requestDevice(options: { filters: { namePrefix: string }[]; optionalServices: string[] }): Promise<Device>;
  getDevices?(): Promise<Device[]>;
};
const serviceId = '0000ae30-0000-1000-8000-00805f9b34fb';
const sleep = (ms: number) => new Promise<void>(resolve => setTimeout(resolve, ms));
let busy = false;
let connection: {device:Device; writer:Characteristic} | undefined;
let connecting: Promise<string> | undefined;
const SPEED_KEY='bsp.sc03.speed';
const DEVICE_KEY='bsp.sc03.device';
let rememberedDevice: Device | undefined;

export function getSc03Speed(): Sc03Speed {
  try { return localStorage.getItem(SPEED_KEY)==='compatible'?'compatible':'balanced'; } catch { return 'balanced'; }
}
export function setSc03Speed(speed: Sc03Speed) {
  try { localStorage.setItem(SPEED_KEY,speed); } catch { /* still usable for this print via options */ }
}
export function sc03ConnectionName(): string | null {
  return connection?.device.gatt?.connected ? connection.device.name ?? 'SC03h' : null;
}
function rememberDevice(device: Device) {
  rememberedDevice=device;
  try { localStorage.setItem(DEVICE_KEY,device.id); } catch { /* The in-memory connection remains usable. */ }
}
function forgetDevice(device: Device) {
  if(rememberedDevice?.id===device.id)rememberedDevice=undefined;
  try { if(localStorage.getItem(DEVICE_KEY)===device.id)localStorage.removeItem(DEVICE_KEY); } catch { /* A later print can still use the browser chooser. */ }
}
export async function prepareSc03Printer() {
  const bluetooth=(navigator as Navigator & { bluetooth?: Bluetooth }).bluetooth;
  if(!bluetooth?.getDevices)return;
  const devices=await bluetooth.getDevices();
  const matching=devices.filter(device=>/^SC03H/i.test(device.name??''));
  let preferredId='';
  try { preferredId=localStorage.getItem(DEVICE_KEY)??''; } catch { /* Use the only authorized SC03 device when storage is unavailable. */ }
  const selected=matching.find(device=>device.id===preferredId)??(matching.length===1?matching[0]:undefined);
  if(selected)rememberedDevice=selected;
}
export function queueSc03Print(invoiceId: string): string {
  const token=crypto.randomUUID();
  saveSc03PrintIntent(sessionStorage,invoiceId,token);
  return token;
}
export function consumeSc03Print(invoiceId: string, token: string): boolean {
  return takeSc03PrintIntent(sessionStorage,invoiceId,token);
}

/** Call from the Save & Print click before any network await to preserve chooser activation. */
export function connectSc03Printer(progress: (message:string)=>void = ()=>{}): Promise<string> {
  if (busy) return Promise.reject(new Error('A printer job is already running.'));
  if (sc03ConnectionName()) return Promise.resolve(sc03ConnectionName()!);
  if (connecting) return connecting;
  const bluetooth = (navigator as Navigator & { bluetooth?: Bluetooth }).bluetooth;
  if (!bluetooth) return Promise.reject(new Error('SC03 printing needs Chrome/Edge on Windows or Chrome on Android. Use PDF/system printing on other browsers.'));
  const reconnect=rememberedDevice??connection?.device;
  // requestDevice stays in the click path when no previously authorized device is available.
  const requested = reconnect
    ? Promise.resolve(reconnect)
    : bluetooth.requestDevice({ filters: [{ namePrefix: 'SC03h' }, { namePrefix: 'SC03H' }], optionalServices: [serviceId] });
  connecting = (async()=>{
    const device=await requested;
    try {
      progress(`Connecting to ${device.name ?? 'SC03h'}…`);
      if (!device.gatt) throw new Error('Bluetooth GATT is unavailable.');
      const server=await device.gatt.connect();
      const chars=await (await server.getPrimaryService(serviceId)).getCharacteristics();
      const writer=chars.find(c=>c.uuid.toLowerCase()==='0000ae01-0000-1000-8000-00805f9b34fb');
      const notifications=chars.filter(c=>c.properties.notify||c.properties.indicate);
      if (!writer?.properties.writeWithoutResponse||!notifications.length) throw new Error('This printer does not expose the expected SC03 interface.');
      for (const c of notifications) await c.startNotifications();
      connection={device,writer};
      rememberDevice(device);
      return device.name ?? 'SC03h';
    } catch(error) {
      try { device.gatt?.disconnect(); } catch { /* preserve connection error */ }
      forgetDevice(device);
      connection=undefined;
      throw error;
    }
  })().finally(()=>{connecting=undefined;});
  return connecting;
}

export function receiptPixels(lines: string[]): ImageData {
  const canvas = document.createElement('canvas');
  canvas.width = 384;
  const measure = canvas.getContext('2d');
  if (!measure) throw new Error('Receipt rendering is unavailable');
  measure.font = '22px sans-serif';
  const wrapped: string[] = [];
  for (const text of lines) {
    let line = '';
    for (const char of Array.from(text.replace(/[\x00-\x1f\x7f]/g, ' '))) {
      if (measure.measureText(line + char).width > 360 && line) { wrapped.push(line); line = ''; }
      line += char;
    }
    wrapped.push(line);
  }
  const height = 24 + wrapped.length * 30;
  if (height > 6000) throw new Error('Receipt is too long for the mini printer. Use PDF printing.');
  canvas.height = height;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = 'white'; ctx.fillRect(0, 0, 384, height);
  ctx.fillStyle = 'black'; ctx.font = '22px sans-serif'; ctx.textBaseline = 'top';
  wrapped.forEach((line, index) => ctx.fillText(line, 12, 12 + index * 30));
  return ctx.getImageData(0, 0, 384, height);
}

/** Manual action may open a chooser; checkout auto-print uses its already connected device. */
export async function printSc03Receipt(lines: string[], progress: (message: string) => void,
  options: {requireConnected?:boolean; speed?:Sc03Speed} = {}): Promise<void> {
  if (busy) throw new Error('A printer job is already running.');
  if (!sc03ConnectionName()) {
    if (options.requireConnected&&!rememberedDevice&&!connection?.device) throw new Error('Bill saved. Printer connection was lost. Use the Bluetooth print button below to reconnect and print this bill.');
    await connectSc03Printer(progress);
  }
  if (busy) throw new Error('A printer job is already running.');
  const active=connection;
  if (!active?.device.gatt?.connected) throw new Error('Printer is not connected.');
  busy=true;
  try {
    const pixels=receiptPixels(lines);
    function* packets() {
      yield* sc03Init();
      for(let y=0;y<pixels.height;y++) yield sc03Row(x=>{
        const i=(y*384+x)*4;
        return pixels.data[i]*299+pixels.data[i+1]*587+pixels.data[i+2]*114 < 128000;
      });
      yield sc03Packet(0xa1,new Uint8Array([80,0]));
    }
    await sendSc03Packets(packets(),{
      connected:()=>!!active.device.gatt?.connected,
      write:bytes=>active.writer.writeValueWithoutResponse(bytes),
      wait:sleep
    },options.speed??getSc03Speed(),count=>{
      if(count%100===0)progress(`Sending receipt… ${Math.min(100,Math.round(count/(pixels.height+6)*100))}%`);
    });
    progress('Receipt sent. Check the paper before choosing to print again.');
  } finally { busy=false; }
}
