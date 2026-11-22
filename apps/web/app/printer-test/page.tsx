'use client';

import { useEffect, useState } from 'react';
import { printSc03Receipt, getSc03Speed, setSc03Speed, type Sc03Speed } from '@/lib/sc03-printer';

export default function PrinterTestPage() {
  const [busy,setBusy]=useState(false);
  const [speed,setSpeed]=useState<Sc03Speed>('balanced');
  const [elapsed,setElapsed]=useState<number|null>(null);
  useEffect(()=>setSpeed(getSc03Speed()),[]);
  const [status,setStatus]=useState('Printer on rakhein. Phone par iPrint disconnect karein.');
  async function test() {
    if(busy)return;
    setBusy(true);setElapsed(null);
    const started=performance.now();
    try {
      await printSc03Receipt(['BSP POS - TEST ONLY','Not a sale / Koi bill save nahi hua','SC03h connection test','Milk 0.5 x Rs.60 = Rs.30','Rice 1.25 x Rs.40 = Rs.50','TOTAL: Rs.80.00','Thank you!'],setStatus,{speed});
      setElapsed(Math.round((performance.now()-started)/1000));
    } catch(error) { setStatus(error instanceof Error?error.message:'Print failed'); }
    finally {setBusy(false);}
  }
  return <main className="auth-wrap"><section className="card auth-card narrow">
    <h1>SC03h printer test</h1>
    <p>Windows Edge/Chrome ya Android Chrome mein kholen. Printer chooser mein SC03h-C6DC select karein.</p>
    <p>Yeh sirf test receipt hai. Koi sale, stock change ya payment nahi hoga.</p>
    <label htmlFor="printer-test-speed">Print speed</label><select id="printer-test-speed" className="select" disabled={busy} value={speed} onChange={event=>{const value=event.target.value as Sc03Speed;setSpeed(value);setSc03Speed(value);}}><option value="balanced">Faster</option><option value="compatible">Compatible (slower)</option></select>
    <button type="button" className="btn btn-primary" disabled={busy} onClick={()=>void test()}>{busy?'Receipt bhej rahe hain…':'Connect & Test Print'}</button>
    <p role="status" aria-live="polite">{status}</p>
    {elapsed!==null&&<p>Connection + sending took {elapsed} seconds. Check the printed text is complete.</p>}
    <p>Bytes bhejne ka matlab paper print confirm hona nahi hai. Retry se pehle paper check karein.</p>
    <a href="/owner/billing">Billing kholen</a>
  </section></main>;
}
