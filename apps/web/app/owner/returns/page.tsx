'use client';

import { FormEvent, useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import OwnerShell from '@/components/pos/OwnerShell';
import WorkspaceLoader from '@/components/pos/WorkspaceLoader';
import { formatDateTime, formatINR, getCurrentOrganization, type CurrentOrganization } from '@/lib/pos';
import { phase8Text } from '@/lib/phase8-i18n';
import { issueCreditNote, listReturnInvoices, listReturnItems } from '@/lib/pos-api';

type Invoice = { id:string; invoice_number:string; grand_total:number; credited_amount:number; created_at:string; customer_id:string|null; customers:{name:string}|null };
type Item = { id:string; product_name_snapshot:string; quantity:number; line_total:number; product_id:string|null };
type RefundMethod='CASH'|'UPI'|'CARD'|'OTHER';

export default function ReturnsPage(){
  const router=useRouter();
  const [org,setOrg]=useState<CurrentOrganization|null>(null);
  const [invoices,setInvoices]=useState<Invoice[]>([]);
  const [selectedId,setSelectedId]=useState('');
  const [items,setItems]=useState<Item[]>([]);
  const [returned,setReturned]=useState<Record<string,number>>({});
  const [qty,setQty]=useState<Record<string,string>>({});
  const [method,setMethod]=useState<RefundMethod>('CASH');
  const [reason,setReason]=useState('');
  const [saving,setSaving]=useState(false);
  const [error,setError]=useState('');
  const [success,setSuccess]=useState('');

  const loadInvoices=useCallback(async(current:CurrentOrganization)=>{
    void current;
    try { const {data}=await listReturnInvoices();setInvoices((data as unknown as Array<Record<string,unknown>>).map(row=>({...row,customers:row.customer_name?{name:String(row.customer_name)}:null})) as unknown as Invoice[]); }
    catch(reason){setError(reason instanceof Error?reason.message:'Could not load invoices.');}
  },[]);

  useEffect(()=>{getCurrentOrganization().then(async current=>{
    if(!current)return router.replace('/auth/login');if(current.role!=='OWNER')return router.replace('/staff');setOrg(current);await loadInvoices(current);
  }).catch(err=>setError(err instanceof Error?err.message:'Could not load workspace.'));},[loadInvoices,router]);

  useEffect(()=>{if(!org||!selectedId){setItems([]);setReturned({});setQty({});return;}void (async()=>{
    setError('');setSuccess('');
    try {
      const {data}=await listReturnItems(selectedId);
      const rows=data as unknown as Array<Item&{returned_quantity:number}>;
      const map:Record<string,number>={};for(const row of rows)map[row.id]=Number(row.returned_quantity||0);
      setReturned(map);setItems(rows);setQty({});
    } catch(reason) {setError(reason instanceof Error?reason.message:'Could not load returnable items.');}
  })();},[org,selectedId]);

  const selected=useMemo(()=>invoices.find(i=>i.id===selectedId)??null,[invoices,selectedId]);
  const estimate=useMemo(()=>items.reduce((sum,item)=>{const q=Math.max(0,Number(qty[item.id]||0));return sum+(q>0?(Number(item.line_total)/Number(item.quantity))*q:0);},0),[items,qty]);
  const t=phase8Text(org?.preferredLanguage??'en');

  async function issue(event:FormEvent){event.preventDefault();if(!org||!selected)return;const chosen=items.map(item=>({invoice_item_id:item.id,quantity:Number(qty[item.id]||0)})).filter(x=>x.quantity>0);if(chosen.length===0)return setError(t.selectReturnItem);if(reason.trim().length<3)return setError(t.reasonHint);  setSaving(true);setError('');setSuccess('');
    try {
      const {data:result}=await issueCreditNote(selected.id,{reason:reason.trim(),refundMethod:method,items:chosen});
      setSuccess(`${t.creditNoteIssued} ${result.credit_note_number} · ${formatINR(result.total_amount)}`);setSelectedId('');setItems([]);setQty({});setReason('');await loadInvoices(org);
    } catch(reason){setError(reason instanceof Error?reason.message:'Could not issue credit note.');}
    finally{setSaving(false);}
  }

  if(!org)return <WorkspaceLoader/>;
  return <OwnerShell businessName={org.organizationName} language={org.preferredLanguage}>
    <div className="content-head pos-page-head"><div><span className="page-kicker">{t.returnsKicker}</span><h1>{t.returnsTitle}</h1><p>{t.returnsSub}</p></div></div>
    {error&&<div className="form-error">{error}</div>}{success&&<div className="form-success">{success}</div>}
    <div className="returns-layout">
      <section className="card returns-invoice-list"><div className="section-head"><div><span className="page-kicker">{t.selectPaidInvoice}</span><h2>{t.chooseInvoice}</h2></div></div>
        {invoices.length===0?<div className="empty-state">{t.noEligibleInvoices}</div>:<div className="dues-list">{invoices.map(invoice=><button key={invoice.id} className={`due-row ${selectedId===invoice.id?'active':''}`} onClick={()=>setSelectedId(invoice.id)}><span><strong>{invoice.customers?.name??t.walkIn}</strong><small>{invoice.invoice_number} · {formatDateTime(invoice.created_at)}</small></span><span className="due-row-money"><strong>{formatINR(invoice.grand_total)}</strong><small>{Number(invoice.credited_amount)>0?`${formatINR(invoice.credited_amount)} ${t.credited}`:t.paid}</small></span></button>)}</div>}
      </section>
      <aside className="card return-builder"><span className="page-kicker">{t.returnItems}</span><h2>{selected?.invoice_number??t.selectPaidInvoice}</h2>{!selected?<div className="empty-state compact">{t.chooseInvoice}</div>:<form onSubmit={issue} className="payment-form">
        <div className="return-item-list">{items.map(item=>{const already=Number(returned[item.id]??0);const remaining=Math.max(0,Number(item.quantity)-already);return <div className="return-item" key={item.id}><div><strong>{item.product_name_snapshot}</strong><small>{t.originalQty}: {item.quantity} · {t.alreadyReturned}: {already} · {t.remainingReturnable}: {remaining}</small></div><input inputMode="decimal" min="0" max={remaining} step="0.001" value={qty[item.id]??''} onChange={e=>setQty({...qty,[item.id]:e.target.value})} placeholder={t.returnQty} disabled={remaining<=0}/></div>})}</div>
        <div className="refund-estimate"><span>{t.refundEstimate}</span><strong>{formatINR(estimate)}</strong></div>
        <label>{t.refundMethod}<select value={method} onChange={e=>setMethod(e.target.value as RefundMethod)}><option value="CASH">Cash</option><option value="UPI">UPI</option><option value="CARD">Card</option><option value="OTHER">Other</option></select></label>
        <label>{t.reason}<textarea rows={3} value={reason} onChange={e=>setReason(e.target.value)} placeholder={t.reasonHint}/></label>
        <div className="return-safety"><strong>{t.ownerOnly}</strong><span>{t.auditSafe}</span></div>
        <button className="btn btn-primary" disabled={saving||estimate<=0}>{saving?t.issuing:t.issueCreditNote}</button>
      </form>}</aside>
    </div>
  </OwnerShell>;
}
