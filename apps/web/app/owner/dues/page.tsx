'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import OwnerShell from '@/components/pos/OwnerShell';
import WorkspaceLoader from '@/components/pos/WorkspaceLoader';
import { formatDateTime, formatINR, getCurrentOrganization, type CurrentOrganization } from '@/lib/pos';
import { localizedStatus, posText } from '@/lib/pos-i18n';
import { collectInvoicePayment, listInvoices } from '@/lib/pos-api';

type DueInvoice = {
  id: string;
  invoice_number: string;
  customer_id: string | null;
  grand_total: number;
  amount_paid: number;
  amount_due: number;
  payment_status: string;
  created_at: string;
  customers: { name: string; phone: string | null } | null;
};

type PaymentMethod = 'CASH' | 'UPI' | 'CARD' | 'OTHER';

export default function OwnerDuesPage(){
  const router=useRouter();
  const [org,setOrg]=useState<CurrentOrganization|null>(null);
  const [invoices,setInvoices]=useState<DueInvoice[]>([]);
  const [selectedId,setSelectedId]=useState('');
  const [amount,setAmount]=useState('');
  const [method,setMethod]=useState<PaymentMethod>('CASH');
  const [note,setNote]=useState('');
  const [loading,setLoading]=useState(true);
  const [saving,setSaving]=useState(false);
  const [error,setError]=useState('');
  const [success,setSuccess]=useState('');

  useEffect(()=>{getCurrentOrganization().then((current)=>{
    if(!current)return router.replace('/auth/login');
    if(current.role!=='OWNER')return router.replace('/staff');
    setOrg(current);
  }).catch((err)=>setError(err instanceof Error?err.message:'Could not load Owner workspace.'));},[router]);

  const loadDues=useCallback(async()=>{
    if(!org)return;
    setLoading(true);setError('');
    try {
      const result=await listInvoices({due:true,limit:100});
      setInvoices((result.data as unknown as Array<Record<string,unknown>>).map(row=>({...row,customers:row.customer_name?{name:String(row.customer_name),phone:row.customer_phone as string|null}:null})) as unknown as DueInvoice[]);
    } catch(reason) {
      setError(reason instanceof Error?reason.message:'Could not load outstanding invoices.');
    } finally {setLoading(false);}
  },[org]);

  useEffect(()=>{void loadDues();},[loadDues]);

  const selected=useMemo(()=>invoices.find((invoice)=>invoice.id===selectedId)??null,[invoices,selectedId]);
  const totalDue=useMemo(()=>invoices.reduce((sum,invoice)=>sum+Number(invoice.amount_due||0),0),[invoices]);
  const customerCount=useMemo(()=>new Set(invoices.filter((i)=>i.customer_id).map((i)=>i.customer_id)).size,[invoices]);
  const t=posText(org?.preferredLanguage??'en');

  function selectInvoice(invoice:DueInvoice){
    setSelectedId(invoice.id);setAmount(Number(invoice.amount_due).toFixed(2));setMethod('CASH');setNote('');setError('');setSuccess('');
  }

  async function collectPayment(event:React.FormEvent){
    event.preventDefault();
    if(!org||!selected)return;
    const numericAmount=Number(amount);
    if(!Number.isFinite(numericAmount)||numericAmount<=0){setError(t.enterValidPayment);return;}
    if(numericAmount>Number(selected.amount_due)){const msg=org.preferredLanguage==='hi'?`भुगतान ${formatINR(selected.amount_due)} से अधिक नहीं हो सकता।`:org.preferredLanguage==='hinglish'?`Payment ${formatINR(selected.amount_due)} se zyada nahi ho sakta.`:`Payment cannot exceed ${formatINR(selected.amount_due)}.`;setError(msg);return;}
    setSaving(true);setError('');setSuccess('');
    try {
      const response=await collectInvoicePayment(selected.id,{amount:numericAmount,method,note:note.trim()||undefined});
      const result=response.data as {amountDue:number};
      setSuccess(result.amountDue>0?`${t.paymentRecorded} ${formatINR(result.amountDue)} ${t.stillDue}`:`${t.paymentRecorded} ${t.invoiceFullyPaid}`);
      setSelectedId('');setAmount('');setNote('');await loadDues();
    } catch(reason) {
      setError(reason instanceof Error?reason.message:'Could not record payment.');
    } finally {setSaving(false);}
  }

  if(!org)return <WorkspaceLoader />;

  return <OwnerShell businessName={org.organizationName} language={org.preferredLanguage}>
    <div className="content-head pos-page-head"><div><span className="page-kicker">{t.duesKicker}</span><h1>{t.duesTitle}</h1><p>{t.duesSub}</p></div></div>
    {error&&<div className="form-error">{error}</div>}
    {success&&<div className="form-success">{success}</div>}

    <div className="report-stat-grid dues-stats">
      <article className="card report-stat"><span>{t.totalOutstanding}</span><strong>{formatINR(totalDue)}</strong><small>{t.acrossOpenInvoices}</small></article>
      <article className="card report-stat"><span>{t.openBills}</span><strong>{invoices.length}</strong><small>{t.invoicesPending}</small></article>
      <article className="card report-stat"><span>{t.customers}</span><strong>{customerCount}</strong><small>{t.customersWithDues}</small></article>
      <article className="card report-stat"><span>{t.collection}</span><strong>{t.ownerOnly}</strong><small>{t.protectedByDatabase}</small></article>
    </div>

    <div className="dues-grid">
      <section className="card dues-list-card">
        <div className="section-head"><div><span className="page-kicker">{t.openDues}</span><h2>{t.pendingInvoices}</h2></div><button className="btn" onClick={()=>void loadDues()} disabled={loading}>{loading?t.refreshing:t.refresh}</button></div>
        {loading?<div className="empty-state">{t.loadingOutstanding}</div>:invoices.length===0?<div className="empty-state"><strong>{t.nothingDue}</strong><span>{t.allPaid}</span></div>:<div className="dues-list">{invoices.map((invoice)=><button key={invoice.id} className={`due-row ${selectedId===invoice.id?'active':''}`} onClick={()=>selectInvoice(invoice)}><span><strong>{invoice.customers?.name||t.walkInCustomer}</strong><small>{invoice.invoice_number} · {formatDateTime(invoice.created_at)}</small></span><span className="due-row-money"><strong>{formatINR(invoice.amount_due)}</strong><small>{localizedStatus(org.preferredLanguage,invoice.payment_status)}</small></span></button>)}</div>}
      </section>

      <aside className="card collect-payment-card">
        <span className="page-kicker">{t.receivePayment}</span>
        <h2>{selected?t.recordPayment:t.selectInvoice}</h2>
        {!selected?<div className="empty-state compact">{t.choosePendingInvoice}</div>:<form onSubmit={collectPayment} className="payment-form">
          <div className="selected-due"><span>{selected.customers?.name||t.walkInCustomer}</span><strong>{selected.invoice_number}</strong><small>{t.dueNow} · {formatINR(selected.amount_due)}</small></div>
          <label>{t.amount}<input inputMode="decimal" value={amount} onChange={(e)=>setAmount(e.target.value)} placeholder="0.00" required /></label>
          <label>{t.paymentMethod}<select value={method} onChange={(e)=>setMethod(e.target.value as PaymentMethod)}><option value="CASH">Cash</option><option value="UPI">UPI</option><option value="CARD">Card</option><option value="OTHER">Other</option></select></label>
          <label>{t.note} <span className="muted">({t.optional})</span><textarea value={note} onChange={(e)=>setNote(e.target.value)} placeholder={t.notePlaceholder} rows={3}/></label>
          <button className="btn btn-primary" disabled={saving}>{saving?t.recording:t.recordPayment}</button>
          <button type="button" className="btn" onClick={()=>router.push(`/owner/invoice?id=${selected.id}`)}>{t.openInvoice}</button>
        </form>}
      </aside>
    </div>
  </OwnerShell>;
}
