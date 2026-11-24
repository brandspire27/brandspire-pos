'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { printSc03Receipt, consumeSc03Print, getSc03Speed, setSc03Speed, type Sc03Speed } from '@/lib/sc03-printer';
import { useRouter } from 'next/navigation';
import OwnerShell from '@/components/pos/OwnerShell';
import StaffShell from '@/components/pos/StaffShell';
import WorkspaceLoader from '@/components/pos/WorkspaceLoader';
import { formatDateTime, formatINR, getCurrentOrganization, type CurrentOrganization } from '@/lib/pos';
import { downloadA4InvoicePdf, shareA4InvoicePdf } from '@/lib/invoice-pdf';
import { localizedStatus, posText, type PosLanguage } from '@/lib/pos-i18n';
import { uiText } from '@/lib/pos-language';
import { cancelInvoice as cancelInvoiceRequest, getInvoiceDetail } from '@/lib/pos-api';

type PrintFormat = 'THERMAL_58MM' | 'THERMAL_80MM' | 'A4';
type Customer = { name:string; phone:string|null; email:string|null; address:string|null; state:string|null; gstin:string|null } | null;
type Invoice = {
  id:string; invoice_number:string; status:string; payment_status:string; payment_method:string|null;
  subtotal:number; discount_amount:number; taxable_amount:number; cgst:number; sgst:number; igst:number;
  grand_total:number; amount_paid:number; amount_due:number; created_at:string;
  cancellation_reason:string|null; cancelled_at:string|null; customers:Customer;
};
type Item = { id:string; product_name_snapshot:string; hsn_sac_snapshot:string|null; unit_snapshot:string; quantity:number; unit_price:number; tax_rate:number; taxable_amount:number; cgst:number; sgst:number; igst:number; line_total:number };
type Payment = { payment_kind?:'COLLECTION'|'REFUND'; id:string; amount:number; method:string; status:string; note:string|null; created_at:string };
type Business = { name:string; phone:string|null; email:string|null; address:string|null; state:string|null; gstin:string|null };
type PrintSettings = { receiptHeader:string; receiptFooter:string; invoiceFooter:string; showGstin:boolean };
type Props = { invoiceId:string; portal:'owner'|'staff' };

function miniReceiptLines(invoice:Invoice,items:Item[],business:Business,language:PosLanguage): string[] {
  const money=(n:number)=>'Rs.'+Number(n).toFixed(2);
  const t=posText(language);
  return [business.name,invoice.invoice_number,formatDateTime(invoice.created_at),
    ...(invoice.status==='CANCELLED'?[localizedStatus(language,'CANCELLED')]:[]),
    invoice.customers?.name||t.walkInCustomer,
    ...(invoice.customers?.phone?[invoice.customers.phone]:[]),
    '--------------------------',
    ...items.flatMap(item=>[item.product_name_snapshot,`${Number(item.quantity)} x ${money(item.unit_price)} = ${money(item.line_total)}`]),
    '--------------------------',
    t.discount+': '+money(invoice.discount_amount),
    'GST: '+money(Number(invoice.cgst)+Number(invoice.sgst)+Number(invoice.igst)),
    t.total+': '+money(invoice.grand_total),
    t.paid+': '+money(invoice.amount_paid),t.due+': '+money(invoice.amount_due),
    t.status+': '+localizedStatus(language,invoice.payment_status),uiText(language,'Thank you!','धन्यवाद!','Dhanyavaad!')];
}


export default function InvoiceDetailView({ invoiceId, portal }:Props){
  const router=useRouter();
  const [org,setOrg]=useState<CurrentOrganization|null>(null);
  const [invoice,setInvoice]=useState<Invoice|null>(null);
  const [items,setItems]=useState<Item[]>([]);
  const [payments,setPayments]=useState<Payment[]>([]);
  const [business,setBusiness]=useState<Business|null>(null);
  const [format,setFormat]=useState<PrintFormat>('THERMAL_58MM');
  const [printSettings,setPrintSettings]=useState<PrintSettings>({receiptHeader:'',receiptFooter:'Thank you for your business',invoiceFooter:'Thank you for your business',showGstin:true});
  const [loading,setLoading]=useState(true);
  const [error,setError]=useState('');
  const [shareStatus,setShareStatus]=useState('');
  const [miniPrinting,setMiniPrinting]=useState(false);
  const [miniStatus,setMiniStatus]=useState('');
  const [miniSpeed,setMiniSpeed]=useState<Sc03Speed>('balanced');
  useEffect(()=>setMiniSpeed(getSc03Speed()),[]);
  const [cancelMode,setCancelMode]=useState(false);
  const [cancelReason,setCancelReason]=useState('');
  const [cancelling,setCancelling]=useState(false);
  const autoPrintTriggered=useRef('');
  const u=(en:string,hi:string,hinglish:string)=>uiText(org?.preferredLanguage??'en',en,hi,hinglish);
  function showPrinterProgress(message:string) {
    const percent=message.match(/^Sending receipt… (\d+)%$/)?.[1];
    if(percent){setMiniStatus(u(`Sending receipt… ${percent}%`,`रसीद भेज रहे हैं… ${percent}%`,`Receipt bhej rahe hain… ${percent}%`));return;}
    const printer=message.match(/^Connecting to (.+)…$/)?.[1];
    if(printer){setMiniStatus(u(`Connecting to ${printer}…`,`${printer} से जोड़ रहे हैं…`,`${printer} se connect ho raha hai…`));return;}
    setMiniStatus(message==='Receipt sent. Check the paper before choosing to print again.'?u('Receipt sent. Check the paper before printing again.','रसीद भेज दी गई। दोबारा प्रिंट से पहले कागज़ जाँचें।','Receipt bhej di. Dobara print se pehle paper check karo.'):message);
  }

  const load=useCallback(async()=>{
    setLoading(true);setError('');
    try{
      const current=await getCurrentOrganization();
      if(!current){router.replace('/auth/login');return;}
      const expected=portal==='owner'?'OWNER':'STAFF';
      if(current.role!==expected){router.replace(current.role==='OWNER'?`/owner/invoice?id=${invoiceId}`:`/staff/invoice?id=${invoiceId}`);return;}
      setOrg(current);
      const response=await getInvoiceDetail(invoiceId);
      const {invoice:row,items:invoiceItems,payments:invoicePayments,organization:businessRow,settings:settingsRow}=response.data;
      const customer={name:row.customer_name as string|null,phone:row.customer_phone as string|null,email:row.customer_email as string|null,address:row.customer_address as string|null,state:row.customer_state as string|null,gstin:row.customer_gstin as string|null};
      setInvoice({...row,customers:row.customer_id?customer:null} as unknown as Invoice);
      setItems(invoiceItems as unknown as Item[]);
      setPayments(invoicePayments as unknown as Payment[]);
      setBusiness(businessRow as unknown as Business);
      const preferred=settingsRow.default_print_format as PrintFormat|undefined;
      if(preferred)setFormat(preferred);
      setPrintSettings({
        receiptHeader:String(settingsRow.receipt_header??''),
        receiptFooter:String(settingsRow.receipt_footer??'Thank you for your business'),
        invoiceFooter:String(settingsRow.invoice_footer??'Thank you for your business'),
        showGstin:Number(settingsRow.show_gstin_on_receipt??1)===1
      });
    }catch(err){setError(err instanceof Error?err.message:'Could not load invoice.');}
    finally{setLoading(false);}
  },[invoiceId,portal,router]);

  useEffect(()=>{void load();},[load]);

  useEffect(()=>{
    if(loading||!invoice||!business||autoPrintTriggered.current===invoice.id)return;
    const params=new URLSearchParams(window.location.search);
    const mode=params.get('autoprint');
    if(mode!=='1'&&mode!=='sc03')return;
    // Schedule so Strict Mode's rehearsal cleanup does not consume the real print.
    const timer=window.setTimeout(()=>{
      if(autoPrintTriggered.current===invoice.id)return;
      autoPrintTriggered.current=invoice.id;
      const url=new URL(window.location.href);
      url.searchParams.delete('autoprint');url.searchParams.delete('print_token');
      window.history.replaceState(window.history.state,'',url.toString());
      if(mode==='1'){window.print();return;}
      try {
        if(!consumeSc03Print(invoice.id,params.get('print_token')??'')) {
          setMiniStatus(u('Bill saved. Automatic print was already used or expired. Check the paper before printing again.','बिल सेव है। अपने आप प्रिंट पहले हो चुका है या उसकी अवधि खत्म है। दोबारा प्रिंट से पहले कागज़ जाँचें।','Bill save hai. Automatic print pehle ho chuka ya expire hua. Dobara print se pehle paper check karo.'));return;
        }
      } catch {
        setMiniStatus(u('Bill saved. Automatic print could not be tracked safely. Use the Bluetooth button to print once.','बिल सेव है। अपने आप प्रिंट की स्थिति नहीं मिली। एक बार प्रिंट के लिए Bluetooth बटन दबाएँ।','Bill save hai. Automatic print ka status nahi mila. Ek baar print ke liye Bluetooth button dabao.'));return;
      }
      setMiniPrinting(true);setMiniStatus(u('Sending saved bill to SC03…','सेव बिल SC03 को भेज रहे हैं…','Saved bill SC03 ko bhej rahe hain…'));
      void printSc03Receipt(miniReceiptLines(invoice,items,business,org?.preferredLanguage??'en'),showPrinterProgress,{requireConnected:true})
        .catch(reason=>setMiniStatus(reason instanceof Error?reason.message:u('Print failed. The bill remains saved.','प्रिंट नहीं हुआ। बिल सेव है।','Print fail hua. Bill save hai.')))
        .finally(()=>setMiniPrinting(false));
    },100);
    return ()=>window.clearTimeout(timer);
  },[loading,invoice,items,business]);

  if(loading||(!org&&!error))return <WorkspaceLoader/>;
  if(error||!org||!invoice||!business)return <main className="auth-wrap"><div className="card auth-card narrow"><div className="form-error" role="alert">{error||u('Invoice not found.','बिल नहीं मिला।','Bill nahi mila.')}</div><button className="btn" onClick={()=>void load()}>{u('Try again','दोबारा कोशिश करें','Dobara try karo')}</button></div></main>;

  const safeInvoice = invoice!;
  const safeBusiness = business!;
  const Shell=portal==='owner'?OwnerShell:StaffShell;
  const t=posText(org.preferredLanguage);
  const customer=safeInvoice.customers;
  const pageSize=format==='A4'?'A4':format==='THERMAL_80MM'?'80mm auto':'58mm auto';
  const margin=format==='A4'?'12mm':'3mm';
  const receiptClass=format==='A4'?'receipt-a4':format==='THERMAL_80MM'?'receipt-80':'receipt-58';
  const printLabel=format==='A4'?t.a4Invoice:format==='THERMAL_80MM'?t.thermalReceipt80:t.thermalReceipt58;
  const pdfInput={invoice:safeInvoice,items,business:safeBusiness,customer,footer:printSettings.invoiceFooter||printSettings.receiptFooter};
  const canCancel=portal==='owner'&&safeInvoice.status!=='CANCELLED'&&safeInvoice.status!=='REFUNDED'&&Number(safeInvoice.amount_paid)===0;

  async function sharePdf(){
    setShareStatus('');
    try{
      const shared=await shareA4InvoicePdf(pdfInput);
      if(!shared){downloadA4InvoicePdf(pdfInput);setShareStatus(u('PDF downloaded because this browser does not support file sharing.','इस ब्राउज़र में फ़ाइल शेयर नहीं होती, इसलिए PDF डाउनलोड की गई।','Is browser mein file sharing nahi hai, isliye PDF download hui.'));}
    }catch(err){
      if(err instanceof DOMException&&err.name==='AbortError')return;
      setShareStatus(err instanceof Error?err.message:u('Could not share PDF.','PDF शेयर नहीं हो सकी।','PDF share nahi ho saki.'));
    }
  }

  function shareWhatsApp(){
    const name=customer?.name||'Customer';
    const text=`Hello ${name}, your invoice ${safeInvoice.invoice_number} from ${safeBusiness.name} is ${formatINR(safeInvoice.grand_total)}.${Number(safeInvoice.amount_due)>0?` Amount due: ${formatINR(safeInvoice.amount_due)}.`:''} Thank you.`;
    window.open(`https://wa.me/?text=${encodeURIComponent(text)}`,'_blank','noopener,noreferrer');
  }

  async function printMini() {
    if (miniPrinting) return;
    setMiniPrinting(true); setError('');
    try {
      await printSc03Receipt(miniReceiptLines(safeInvoice,items,safeBusiness,org?.preferredLanguage??'en'),showPrinterProgress,{speed:miniSpeed});
    } catch (error) {setMiniStatus(error instanceof Error ? error.message : u('Print failed. Your saved invoice is unchanged.','प्रिंट नहीं हुआ। आपका सेव बिल सुरक्षित है।','Print fail hua. Saved bill safe hai.'));}
    finally {setMiniPrinting(false);}
  }

  async function cancelInvoice(){
    if(!canCancel||cancelReason.trim().length<3)return;
    setCancelling(true);setError('');
    try {
      await cancelInvoiceRequest(invoiceId,cancelReason.trim());
      setCancelMode(false);setCancelReason('');
      await load();
    } catch(reason) {
      setError(reason instanceof Error?reason.message:u('Could not cancel invoice.','बिल रद्द नहीं हो सका।','Bill cancel nahi ho saka.'));
    } finally {
      setCancelling(false);
    }
  }

  return <>
    <div className="screen-only">
      <Shell businessName={org.organizationName} language={org.preferredLanguage}>
        <div className="content-head pos-page-head">
          <div><span className="page-kicker">{t.invoiceKicker}</span><h1>{safeInvoice.invoice_number}</h1><p>{formatDateTime(safeInvoice.created_at)} · {customer?.name||t.walkInCustomer}</p></div>
          <div className="invoice-top-actions">
            <button className="btn" onClick={()=>router.back()}>← {t.back}</button>
            <button className="btn" onClick={()=>downloadA4InvoicePdf(pdfInput)}>{t.downloadPdf}</button>
            <button className="btn" onClick={sharePdf}>{t.sharePdf}</button>
            <button className="btn whatsapp-button" onClick={shareWhatsApp}>WhatsApp</button>
          {portal==='owner'&&Number(safeInvoice.amount_due)>0&&safeInvoice.status!=='CANCELLED'&&<button className="btn" onClick={()=>router.push('/owner/dues')}>{t.collectPayment}</button>}
          </div>
        </div>
        {shareStatus&&<div className="form-success" role="status">{shareStatus}</div>}
        {error&&<div className="form-error" role="alert">{error}</div>}
        {safeInvoice.status==='CANCELLED'&&<div className="invoice-cancelled-banner"><strong>{t.cancelledInvoice}</strong><span>{safeInvoice.cancellation_reason||t.noReasonRecorded}{safeInvoice.cancelled_at?` · ${formatDateTime(safeInvoice.cancelled_at)}`:''}</span></div>}

        <div className="invoice-detail-grid">
          <section className="card invoice-detail-card">
            <div className="invoice-detail-head">
            <div><span className={`mini-status mini-${safeInvoice.payment_status.toLowerCase()}`}>{localizedStatus(org.preferredLanguage,safeInvoice.payment_status)}</span><h2>{safeInvoice.invoice_number}</h2><span className="muted">{safeInvoice.payment_method||t.noPaymentMethod}</span></div>
            <div className="invoice-detail-meta"><div>{t.created}</div><strong>{formatDateTime(safeInvoice.created_at)}</strong><div style={{marginTop:7}}>{t.status} · {localizedStatus(org.preferredLanguage,safeInvoice.status)}</div></div>
            </div>
            <div className="invoice-party-grid">
            <div className="invoice-party"><small>{t.from}</small><h3>{safeBusiness.name}</h3><p>{safeBusiness.address||t.businessAddressMissing}</p><p>{safeBusiness.phone||safeBusiness.email||''}</p><p>{safeBusiness.gstin?`GSTIN · ${safeBusiness.gstin}`:''}</p></div>
              <div className="invoice-party"><small>{t.billTo}</small><h3>{customer?.name||t.walkInCustomer}</h3><p>{customer?.address||customer?.state||t.noAddressShort}</p><p>{customer?.phone||customer?.email||''}</p><p>{customer?.gstin?`GSTIN · ${customer.gstin}`:''}</p></div>
            </div>
            <div className="data-table-wrap invoice-items-wrap"><table className="data-table"><thead><tr><th>{t.product}</th><th>{t.qty}</th><th>{t.rate}</th><th>GST</th><th>{t.total}</th></tr></thead><tbody>{items.map(item=><tr key={item.id}><td><strong>{item.product_name_snapshot}</strong><small>{item.hsn_sac_snapshot?`HSN/SAC ${item.hsn_sac_snapshot}`:''}</small></td><td>{Number(item.quantity)} {item.unit_snapshot}</td><td>{formatINR(item.unit_price)}</td><td>{Number(item.tax_rate)}%</td><td><strong>{formatINR(item.line_total)}</strong></td></tr>)}</tbody></table></div>
          <div className="invoice-totals-box"><div><span>{t.subtotal}</span><strong>{formatINR(safeInvoice.subtotal)}</strong></div>{Number(safeInvoice.discount_amount)>0&&<div><span>{t.discount}</span><strong>- {formatINR(safeInvoice.discount_amount)}</strong></div>}<div><span>{t.taxable}</span><strong>{formatINR(safeInvoice.taxable_amount)}</strong></div>{Number(safeInvoice.cgst)>0&&<div><span>CGST</span><strong>{formatINR(safeInvoice.cgst)}</strong></div>}{Number(safeInvoice.sgst)>0&&<div><span>SGST</span><strong>{formatINR(safeInvoice.sgst)}</strong></div>}{Number(safeInvoice.igst)>0&&<div><span>IGST</span><strong>{formatINR(safeInvoice.igst)}</strong></div>}<div className="invoice-grand"><span>{t.grandTotal}</span><strong>{formatINR(safeInvoice.grand_total)}</strong></div><div><span>{t.paid}</span><strong>{formatINR(safeInvoice.amount_paid)}</strong></div><div><span>{t.due}</span><strong>{formatINR(safeInvoice.amount_due)}</strong></div></div>

            <div className="payment-history-section">
              <div className="section-head"><div><span className="page-kicker">{t.paymentHistory}</span><h3>{t.moneyReceivedHistory}</h3></div></div>
              {payments.length===0?<div className="empty-state compact">{t.noPaymentRecorded}</div>:<div className="payment-history-list">{payments.map(payment=><div key={payment.id}><span><strong>{payment.method}</strong><small>{formatDateTime(payment.created_at)}{payment.note?` · ${payment.note}`:''}</small></span><strong>{payment.payment_kind==='REFUND'?u('Refund · ','रिफंड · ','Refund · '):''}{formatINR(payment.payment_kind==='REFUND'?-Number(payment.amount):payment.amount)}</strong></div>)}</div>}
            </div>

          {portal==='owner'&&safeInvoice.status!=='CANCELLED'&&safeInvoice.status!=='REFUNDED'&&<div className="invoice-danger-zone">
              <div><span className="page-kicker">{t.ownerControl}</span><h3>{t.cancelInvoiceTitle}</h3><p>{canCancel?t.cancelSafeCopy:t.cancelPaidCopy}</p></div>
              {canCancel&&!cancelMode&&<button className="btn btn-danger-outline" onClick={()=>setCancelMode(true)}>{t.cancelInvoice}</button>}
              {canCancel&&cancelMode&&<div className="cancel-form"><textarea aria-label={t.cancelReasonPlaceholder} value={cancelReason} onChange={(e)=>setCancelReason(e.target.value)} rows={3} placeholder={t.cancelReasonPlaceholder}/><div><button className="btn" onClick={()=>{setCancelMode(false);setCancelReason('');}}>{t.keepInvoice}</button><button className="btn btn-danger" onClick={cancelInvoice} disabled={cancelling||cancelReason.trim().length<3}>{cancelling?t.cancelling:t.confirmCancellation}</button></div></div>}
            </div>}
          </section>

          <aside className="card print-panel no-print">
            <span className="page-kicker">{t.printFormat}</span><h3>{t.printTitle}</h3><p>{u('Choose a paper size for system printing, or use the SC03 Bluetooth button below for your mini printer.','सिस्टम प्रिंट के लिए कागज़ का आकार चुनें। मिनी प्रिंटर के लिए नीचे SC03 Bluetooth बटन दबाएँ।','System print ke liye paper size chuno. Mini printer ke liye neeche SC03 Bluetooth button dabao.')}</p>
            <div className="print-format-list"><button className={`print-format-button ${format==='THERMAL_58MM'?'active':''}`} onClick={()=>setFormat('THERMAL_58MM')}><strong>{t.thermal2}</strong><small>{t.thermalReceipt58}</small></button><button className={`print-format-button ${format==='THERMAL_80MM'?'active':''}`} onClick={()=>setFormat('THERMAL_80MM')}><strong>{t.thermal3}</strong><small>{t.thermalReceipt80}</small></button><button className={`print-format-button ${format==='A4'?'active':''}`} onClick={()=>setFormat('A4')}><strong>{t.a4Invoice}</strong><small>{t.fullPageGstInvoice}</small></button></div>
            <button className="btn btn-primary print-now" onClick={()=>window.print()}>{t.print} {printLabel}</button>
            <label htmlFor="sc03-speed">{u("SC03 print speed","SC03 प्रिंट की गति","SC03 print speed")}</label>
            <select id="sc03-speed" className="select" value={miniSpeed} disabled={miniPrinting} onChange={event=>{
              const speed=event.target.value as Sc03Speed;setMiniSpeed(speed);setSc03Speed(speed);
            }}><option value="balanced">{u("Faster","तेज़","Tez")}</option><option value="compatible">{u("Compatible (slower)","अनुकूल (धीमा)","Compatible (dheere)")}</option></select>
            <p className="muted">{u("If lines are missing, select Compatible and check the paper before reprinting.","लाइनें छूट रही हों तो अनुकूल मोड चुनें और दोबारा प्रिंट से पहले कागज़ जाँचें।","Lines missing hon to Compatible chuno aur dobara print se pehle paper check karo.")}</p>
            <button className="btn print-now" onClick={printMini} disabled={miniPrinting}>{miniPrinting?u('Printing…','प्रिंट हो रहा है…','Print ho raha hai…'):u('SC03 Mini Printer · Bluetooth','SC03 मिनी प्रिंटर · Bluetooth','SC03 Mini Printer · Bluetooth')}</button>
            {miniStatus&&<p role="status">{miniStatus}</p>}
            <div className="sharing-note"><strong>{t.pdfSharing}</strong><span>{t.shareNote}</span></div>
          </aside>
        </div>
      </Shell>
    </div>

    <div className="print-only-shell">
      <style media="print">{`@page { size: ${pageSize}; margin: ${margin}; }`}</style>
      <div className={`print-document receipt ${receiptClass}`}>
        <div className="receipt-brand"><div>{printSettings.receiptHeader&&<p><strong>{printSettings.receiptHeader}</strong></p>}<h1>{safeBusiness.name}</h1><p>{safeBusiness.address||''}</p><p>{safeBusiness.phone||''}{safeBusiness.email?` · ${safeBusiness.email}`:''}</p><p>{printSettings.showGstin&&safeBusiness.gstin?`GSTIN: ${safeBusiness.gstin}`:''}</p></div>{format==='A4'&&<div className="a4-title"><strong>{u("TAX INVOICE","टैक्स बिल","TAX INVOICE")}</strong><p>{safeInvoice.invoice_number}</p></div>}</div>
        <div className="receipt-rule"/>
        <div className="receipt-meta"><div><span>{t.invoiceKicker}</span><strong>{safeInvoice.invoice_number}</strong></div><div><span>{t.date}</span><strong>{formatDateTime(safeInvoice.created_at)}</strong></div><div><span>{t.customer}</span><strong>{customer?.name||t.walkInCustomer}</strong></div>{customer?.gstin&&<div><span>GSTIN</span><strong>{customer.gstin}</strong></div>}<div><span>{t.payment}</span><strong>{safeInvoice.payment_method||'—'} · {safeInvoice.payment_status}</strong></div>{safeInvoice.status==='CANCELLED'&&<div><span>{t.status}</span><strong>{localizedStatus(org.preferredLanguage,'CANCELLED')}</strong></div>}</div>
        <div className="receipt-rule"/>
        <table className="receipt-table"><thead><tr><th>{t.product}</th><th>{t.qty}</th><th>{t.rate}</th><th>{t.amount}</th></tr></thead><tbody>{items.map(item=><tr key={item.id}><td>{item.product_name_snapshot}{item.hsn_sac_snapshot?<><br/><small>HSN {item.hsn_sac_snapshot} · GST {Number(item.tax_rate)}%</small></>:null}</td><td>{Number(item.quantity)}</td><td>{Number(item.unit_price).toFixed(2)}</td><td>{Number(item.line_total).toFixed(2)}</td></tr>)}</tbody></table>
        <div className="receipt-summary"><div><span>{t.taxable}</span><span>₹{Number(safeInvoice.taxable_amount).toFixed(2)}</span></div>{Number(safeInvoice.discount_amount)>0&&<div><span>{t.discount}</span><span>-₹{Number(safeInvoice.discount_amount).toFixed(2)}</span></div>}{Number(safeInvoice.cgst)>0&&<div><span>CGST</span><span>₹{Number(safeInvoice.cgst).toFixed(2)}</span></div>}{Number(safeInvoice.sgst)>0&&<div><span>SGST</span><span>₹{Number(safeInvoice.sgst).toFixed(2)}</span></div>}{Number(safeInvoice.igst)>0&&<div><span>IGST</span><span>₹{Number(safeInvoice.igst).toFixed(2)}</span></div>}<div className="total"><span>{t.total}</span><span>₹{Number(safeInvoice.grand_total).toFixed(2)}</span></div><div><span>{t.paid}</span><span>₹{Number(safeInvoice.amount_paid).toFixed(2)}</span></div>{Number(safeInvoice.amount_due)>0&&<div><span>{t.due}</span><span>₹{Number(safeInvoice.amount_due).toFixed(2)}</span></div>}</div>
        <div className="receipt-footer"><div className="receipt-rule"/><strong>{safeInvoice.status==='CANCELLED'?u('CANCELLED — NOT VALID FOR SALE','रद्द — बिक्री के लिए मान्य नहीं','CANCELLED — sale ke liye valid nahi'):printSettings.receiptFooter||u('Thank you for your business','खरीदारी के लिए धन्यवाद','Kharidari ke liye dhanyavaad')}</strong><p>{u("Generated with Brandspire POS","Brandspire POS से बनाया गया","Brandspire POS se banaya gaya")}</p></div>
      </div>
    </div>
  </>;
}
