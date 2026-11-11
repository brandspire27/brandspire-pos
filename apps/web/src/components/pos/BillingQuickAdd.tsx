'use client';
import { useRef, useState, type FormEvent } from 'react';
import { addCustomer, addProduct } from '@/lib/pos-api';
import PosAssist from './PosAssist';

export default function BillingQuickAdd({ onCustomer, onProduct, hindi, disabled }: {
  onCustomer: (value: {id:string;name:string;phone:string|null}) => void;
  onProduct: (value: {id:string;name:string;selling_price:number;stock:number;tax_rate:number;tax_inclusive:boolean;unit:string;sku:null;barcode:null}) => void;
  hindi: boolean; disabled: boolean;
}) {
  const [mode,setMode]=useState<'customer'|'product'|null>(null);
  const [busy,setBusy]=useState(false);
  const lock=useRef(false);
  const [error,setError]=useState('');
  const [name,setName]=useState('');
  const [price,setPrice]=useState('');
  function open(next:'customer'|'product') {setMode(mode===next?null:next);setName('');setPrice('');setError('');}
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
        const product={name:name.trim(),selling_price:Number(price),stock:Number(data.get('stock')),tax_rate:Number(data.get('tax')),tax_inclusive:data.get('inclusive')==='on',unit:String(data.get('unit')||'pcs'),sku:null,barcode:null};
        const result=await addProduct(product);
        onProduct({...product,id:result.data.id});
      }
      setMode(null);setName('');setPrice('');
    } catch(reason) {setError(reason instanceof Error?reason.message:'Could not save.');}
    finally {lock.current=false;setBusy(false);}
  }
  return <section className="card inline-form-panel">
    <div className="form-actions" style={{justifyContent:'flex-start',marginTop:0}}>
      <button type="button" className="btn" disabled={busy||disabled} aria-expanded={mode==='customer'} onClick={()=>open('customer')}>+ {hindi?'Naya customer':'New customer'}</button>
      <button type="button" className="btn" disabled={busy||disabled} aria-expanded={mode==='product'} onClick={()=>open('product')}>+ {hindi?'Naya product / Voice':'New product / Voice'}</button>
    </div>
    {mode && <>
      <h2>{mode==='customer'?(hindi?'Customer add karke select karo':'Add and select customer'):(hindi?'Product save karke bill mein daalo':'Save product and add to bill')}</h2>
      {mode==='product' && <PosAssist mode="product" confirmLabel="Save product & add to bill" onConfirm={async value=>{
        if(disabled)throw new Error('Wait for the current bill to finish.');
        if(value.selling_price==null || Number(value.stock??0)<1)throw new Error('Enter a price and opening stock of at least 1 to add this product to the bill.');
        const product={name:String(value.name),selling_price:Number(value.selling_price),stock:Number(value.stock),unit:String(value.unit??'pcs'),tax_rate:Number(value.tax_rate??0),tax_inclusive:Boolean(value.tax_inclusive),sku:null,barcode:null};
        const result=await addProduct(product);onProduct({...product,id:result.data.id});setMode(null);
      }} onDraft={value=>{setName(String(value.name??''));setPrice(value.selling_price==null?'':String(value.selling_price));}} />}
      <form onSubmit={save}><fieldset disabled={busy||disabled} style={{border:0,padding:0,margin:0}}><div className="grid-2">
        <div className="field"><label htmlFor="quick-name">{mode==='customer'?'Customer name':'Product name'} *</label><input id="quick-name" className="input" required maxLength={160} value={name} onChange={e=>setName(e.target.value)} /></div>
        {mode==='customer'?<>
          <div className="field"><label htmlFor="quick-phone">Mobile number</label><input id="quick-phone" name="phone" type="tel" autoComplete="tel" maxLength={30} className="input" /></div>
          <div className="field"><label htmlFor="quick-state">State (for GST)</label><input id="quick-state" name="state" maxLength={100} className="input" /></div>
        </>:<>
          <div className="field"><label htmlFor="quick-price">Selling price (₹) *</label><input id="quick-price" className="input" type="number" min="0" step="0.01" required value={price} onChange={e=>setPrice(e.target.value)} /></div>
          <div className="field"><label htmlFor="quick-stock">Opening stock *</label><input id="quick-stock" name="stock" className="input" type="number" min="1" step="0.001" defaultValue="1" required /></div>
          <div className="field"><label htmlFor="quick-unit">Unit</label><input id="quick-unit" name="unit" className="input" defaultValue="pcs" maxLength={30} required /></div>
          <div className="field"><label htmlFor="quick-tax">GST (%)</label><input id="quick-tax" name="tax" className="input" type="number" min="0" max="100" step="0.01" defaultValue="0" required /></div>
          <label className="checkbox-row"><input name="inclusive" type="checkbox" />Price includes GST</label>
        </>}
      </div>{error&&<p className="form-error" role="alert">{error}</p>}
      <div className="form-actions"><button type="button" className="btn" onClick={()=>setMode(null)}>Cancel</button><button type="submit" className="btn btn-primary">{busy?'Saving…':mode==='customer'?'Save & select customer':'Save & add to bill'}</button></div></fieldset></form>
    </>}
  </section>;
}
