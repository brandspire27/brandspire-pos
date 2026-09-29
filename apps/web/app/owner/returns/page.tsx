'use client';

import { FormEvent, useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import OwnerShell from '@/components/pos/OwnerShell';
import WorkspaceLoader from '@/components/pos/WorkspaceLoader';
import { formatDateTime, formatINR, getCurrentOrganization, type CurrentOrganization } from '@/lib/pos';
import { phase8Text } from '@/lib/phase8-i18n';
import { getSupabaseBrowserClient } from '@/lib/supabase';

type Invoice = { id:string; invoice_number:string; grand_total:number; credited_amount:number; created_at:string; customer_id:string|null; customers:{name:string}|null };
type Item = { id:string; product_name_snapshot:string; quantity:number; line_total:number; product_id:string|null };
type Returned = { invoice_item_id:string; quantity:number };
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
    const {data,error:invoiceError}=await getSupabaseBrowserClient().from('invoices').select('id,invoice_number,grand_total,credited_amount,created_at,customer_id,customers(name)').eq('organization_id',current.organizationId).eq('payment_status','PAID').eq('amount_due',0).not('status','in','(CANCELLED,REFUNDED)').order('created_at',{ascending:false}).limit(100);
    if(invoiceError)setError(invoiceError.message);else setInvoices((data??[]) as unknown as Invoice[]);
  },[]);

  useEffect(()=>{getCurrentOrganization().then(async current=>{
    if(!current)return router.replace('/auth/login');if(current.role!=='OWNER')return router.replace('/staff');setOrg(current);await loadInvoices(current);
  }).catch(err=>setError(err instanceof Error?err.message:'Could not load workspace.'));},[loadInvoices,router]);

  useEffect(()=>{if(!org||!selectedId){setItems([]);setReturned({});setQty({});return;}void (async()=>{
    setError('');setSuccess('');
    const supabase=getSupabaseBrowserClient();
    const [{data:itemData,error:itemError},{data:returnData,error:returnError}]=await Promise.all([
      supabase.from('invoice_items').select('id,product_name_snapshot,quantity,line_total,product_id').eq('organization_id',org.organizationId).eq('invoice_id',selectedId).order('created_at'),
      supabase.from('credit_note_items').select('invoice_item_id,quantity,credit_notes!inner(invoice_id,status)').eq('organization_id',org.organizationId).eq('credit_notes.invoice_id',selectedId).eq('credit_notes.status','ISSUED')
    ]);
    if(itemError)return setError(itemError.message);if(returnError)return setError(returnError.message);
    const map:Record<string,number>={};for(const row of (returnData??[]) as unknown as Returned[])map[row.invoice_item_id]=(map[row.invoice_item_id]??0)+Number(row.quantity||0);
    setReturned(map);setItems((itemData??[]) as Item[]);setQty({});
  })();},[org,selectedId]);

  const selected=useMemo(()=>invoices.find(i=>i.id===selectedId)??null,[invoices,selectedId]);
  const estimate=useMemo(()=>items.reduce((sum,item)=>{const q=Math.max(0,Number(qty[item.id]||0));return sum+(q>0?(Number(item.line_total)/Number(item.quantity))*q:0);},0),[items,qty]);
  const t=phase8Text(org?.preferredLanguage??'en');

  async function issue(event:FormEvent){event.preventDefault();if(!org||!selected)return;const chosen=items.map(item=>({invoice_item_id:item.id,quantity:Number(qty[item.id]||0)})).filter(x=>x.quantity>0);if(chosen.length===0)return setError(t.selectReturnItem);if(reason.trim().length<3)return setError(t.reasonHint);setSaving(true);setError('');setSuccess('');
    const {data,error:rpcError}=await getSupabaseBrowserClient().rpc('issue_invoice_credit_note',{p_organization_id:org.organizationId,p_invoice_id:selected.id,p_reason:reason.trim(),p_refund_method:method,p_items:chosen});
    setSaving(false);if(rpcError)return setError(rpcError.message);const result=Array.isArray(data)?data[0]:data;setSuccess(`${t.creditNoteIssued} ${result?.credit_note_number??''} · ${formatINR(result?.total_amount??estimate)}`);setSelectedId('');setItems([]);setQty({});setReason('');await loadInvoices(org);
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
