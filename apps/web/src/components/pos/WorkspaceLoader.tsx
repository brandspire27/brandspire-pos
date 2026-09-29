'use client';

import { useEffect, useState } from 'react';
import { getCachedOrganization } from '@/lib/pos';
import { posText, type PosLanguage } from '@/lib/pos-i18n';

type Props = { language?: PosLanguage; compact?: boolean };

export default function WorkspaceLoader({ language, compact = false }: Props) {
  const [mounted,setMounted]=useState(false);
  const [cachedLanguage,setCachedLanguage]=useState<PosLanguage>('en');
  const [step,setStep]=useState(0);

  useEffect(()=>{
    setMounted(true);
    const cached=getCachedOrganization()?.preferredLanguage;
    if(cached==='en'||cached==='hi'||cached==='hinglish')setCachedLanguage(cached);
  },[]);

  const activeLanguage:PosLanguage = language ?? (mounted ? cachedLanguage : 'en');
  const t=posText(activeLanguage);
  const steps=[t.checkingAccount,t.loadingBusiness,t.syncingSettings,t.almostReady];

  useEffect(()=>{
    const timer=window.setInterval(()=>setStep(current=>Math.min(current+1,steps.length-1)),450);
    return()=>window.clearInterval(timer);
  },[steps.length]);

  return <main className={`workspace-loader ${compact?'workspace-loader-compact':''}`} aria-live="polite" aria-busy="true">
    <div className="workspace-loader-card">
      <div className="loader-brand-row"><span className="loader-brand-mark">BP</span><div><strong>Brandspire POS</strong><small>{t.preparingWorkspace}</small></div></div>
      <div className="loader-progress"><span style={{width:`${25+step*25}%`}}/></div>
      <div className="loader-status"><span className="loader-dot"/>{steps[step]}</div>
    </div>
  </main>;
}
