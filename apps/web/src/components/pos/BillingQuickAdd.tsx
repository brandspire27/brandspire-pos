'use client';
import { useEffect, useRef, useState, type FormEvent } from 'react';
import { addCustomer, addProduct } from '@/lib/pos-api';
import PosAssist from './PosAssist';
import { uiText, usePosLanguage } from '@/lib/pos-language';

export default function BillingQuickAdd({ onCustomer, onProduct, hindi, disabled, barcodeDraft, onBatchSaved }: {
  onCustomer: (value: {id:string;name:string;phone:string|null}) => void;
  onProduct: (value: {id:string;name:string;selling_price:number;stock:number;tax_rate:number;tax_inclusive:boolean;unit:string;sku:string|null;barcode:string|null}) => void;
  hindi: boolean; disabled: boolean; barcodeDraft?: {barcode:string;name:string;nonce:number}; onBatchSaved?:()=>void|Promise<void>;
}) {
  const language=usePosLanguage();
  const tr=(en:string,hi:string,hinglish:string)=>uiText(language,en,hi,hinglish);
  const [mode,setMode]=useState<'customer'|'product'|null>(null);
  const [busy,setBusy]=useState(false);
  const lock=useRef(false);
  const [error,setError]=useState('');
  const [name,setName]=useState('');
  const [price,setPrice]=useState('');
  const [barcode,setBarcode]=useState('');
  useEffect(()=>{if(barcodeDraft){setMode('product');setBarcode(barcodeDraft.barcode);setName(barcodeDraft.name);setPrice('');setError('');document.getElementById('quick-product-panel')?.scrollIntoView({behavior:'smooth',block:'center'});}},[barcodeDraft]);
  function open(next:'customer'|'product') {setMode(mode===next?null:next);setName('');setPrice('');setBarcode('');setError('');}
  async function save(event:FormEvent<HTMLFormElement>) {
    event.preventDefault(); if(lock.current||disabled)return;
    const data=new FormData(event.currentTarget);
    lock.current=true;setBusy(true);setError('');
    try {
      if(mode==='customer') {
        const phone=String(data.get('phone')||'').trim();
        const result=await addCustomer({name:name.trim(),phone:phone||null,state:String(data.get('state')||'').trim()||null});
        onCustomer({id:result.data.id,name:name.trim(),phone:phone||null});
      } else {
        const product={name:name.trim(),selling_price:Number(price),stock:Number(data.get('stock')),tax_rate:Number(data.get('tax')),tax_inclusive:data.get('inclusive')==='on',unit:String(data.get('unit')||'pcs'),sku:String(data.get('sku')||'').trim()||null,barcode:barcode.trim()||null};
        const result=await addProduct(product);
        onProduct({...product,id:result.data.id});
      }
      setMode(null);setName('');setPrice('');
    } catch(reason) {setError(reason instanceof Error?reason.message:tr('Could not save.','सेव नहीं हो सका।','Save nahi ho saka.'));}
    finally {lock.current=false;setBusy(false);}
  }
  return <section id="quick-product-panel" className="card inline-form-panel">
    <div className="form-actions" style={{justifyContent:'flex-start',marginTop:0}}>
      <button type="button" className="btn" disabled={busy||disabled} aria-expanded={mode==='product'} onClick={()=>open('product')}>+ {tr('New product / Voice','नया सामान / बोलकर जोड़ें','Naya product / bolkar jodein')}</button>
    </div>
    {mode && <>
      <h2>{mode==='customer'?(tr('Add and select customer','ग्राहक जोड़ें और चुनें','Customer jodein aur chunein')):(tr('Save product and add to bill','सामान सेव करके बिल में जोड़ें','Product save karke bill mein jodein'))}</h2>
      {mode==='product' && <PosAssist mode="product" onBatchSaved={onBatchSaved} confirmLabel={tr('Save product & add to bill','सामान सेव करके बिल में जोड़ें','Product save karke bill mein jodein')} onConfirm={async value=>{
        if(disabled)throw new Error(tr('Wait for the current bill to finish.','मौजूदा बिल पूरा होने तक रुकें।','Abhi ka bill poora hone tak rukein.'));
        if(value.selling_price==null || Number(value.stock??0)<1)throw new Error(tr('Enter a price and opening stock of at least 1 to add this product to the bill.','सामान को बिल में जोड़ने के लिए कीमत और कम से कम 1 शुरुआती स्टॉक लिखें।','Product bill mein jodne ke liye price aur kam se kam 1 opening stock likhein.'));
        const product={name:String(value.name),selling_price:Number(value.selling_price),stock:Number(value.stock),unit:String(value.unit??'pcs'),tax_rate:Number(value.tax_rate??0),tax_inclusive:Boolean(value.tax_inclusive),sku:value.sku?String(value.sku):null,barcode:value.barcode?String(value.barcode):barcode||null};
        const result=await addProduct(product);onProduct({...product,id:result.data.id});setMode(null);
      }} onDraft={value=>{setName(String(value.name??''));setPrice(value.selling_price==null?'':String(value.selling_price));if(value.barcode)setBarcode(String(value.barcode));}} />}
      <form onSubmit={save}><fieldset disabled={busy||disabled} style={{border:0,padding:0,margin:0}}><div className="grid-2">
        <div className="field"><label htmlFor="quick-name">{mode==='customer'?tr('Customer name','ग्राहक का नाम','Customer ka naam'):tr('Product name','सामान का नाम','Product ka naam')} *</label><input id="quick-name" className="input" required maxLength={160} value={name} onChange={e=>setName(e.target.value)} /></div>
        {mode==='customer'?<>
          <div className="field"><label htmlFor="quick-phone">{tr('Mobile number','मोबाइल नंबर','Mobile number')}</label><input id="quick-phone" name="phone" type="tel" autoComplete="tel" maxLength={30} className="input" /></div>
          <div className="field"><label htmlFor="quick-state">{tr('State (for GST)','राज्य (GST के लिए)','State (GST ke liye)')}</label><input id="quick-state" name="state" maxLength={100} className="input" /></div>
        </>:<>
          <div className="field"><label htmlFor="quick-barcode">{tr('Barcode','बारकोड','Barcode')}</label><input id="quick-barcode" className="input" maxLength={100} value={barcode} onChange={e=>setBarcode(e.target.value)} /></div>
          <div className="field"><label htmlFor="quick-sku">{tr('SKU (shop code)','SKU (दुकान का कोड)','SKU (dukaan ka code)')}</label><input id="quick-sku" name="sku" className="input" maxLength={100} /></div>
          <div className="field"><label htmlFor="quick-price">{tr('Selling price (₹)','बेचने की कीमत (₹)','Bechne ki price (₹)')} *</label><input id="quick-price" className="input" type="number" min="0" step="0.01" required value={price} onChange={e=>setPrice(e.target.value)} /></div>
          <div className="field"><label htmlFor="quick-stock">{tr('Opening stock','शुरुआती स्टॉक','Shuruaati stock')} *</label><input id="quick-stock" name="stock" className="input" type="number" min="1" step="0.001" defaultValue="1" required /></div>
          <div className="field"><label htmlFor="quick-unit">{tr('Unit','इकाई','Unit')}</label><input id="quick-unit" name="unit" className="input" defaultValue="pcs" maxLength={30} required /></div>
          <div className="field"><label htmlFor="quick-tax">{tr('GST (%)','GST (%)','GST (%)')}</label><input id="quick-tax" name="tax" className="input" type="number" min="0" max="100" step="0.01" defaultValue="0" required /></div>
          <label className="checkbox-row"><input name="inclusive" type="checkbox" />{tr('Price includes GST','कीमत में GST शामिल है','Price mein GST shamil hai')}</label>
        </>}
      </div>{error&&<p className="form-error" role="alert">{error}</p>}
      <div className="form-actions"><button type="button" className="btn" onClick={()=>setMode(null)}>{tr('Cancel','रद्द करें','Radd karein')}</button><button type="submit" className="btn btn-primary">{busy?tr('Saving…','सेव हो रहा है…','Save ho raha hai…'):mode==='customer'?tr('Save & select customer','ग्राहक सेव करें और चुनें','Customer save karein aur chunein'):tr('Save & add to bill','सेव करके बिल में जोड़ें','Save karke bill mein jodein')}</button></div></fieldset></form>
    </>}
  </section>;
}
