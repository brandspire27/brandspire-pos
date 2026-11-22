'use client';

import { FormEvent, useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import OwnerShell from '@/components/pos/OwnerShell';
import WorkspaceLoader from '@/components/pos/WorkspaceLoader';
import PosAssist from '@/components/pos/PosAssist';
import CameraBarcodeScanner from '@/components/pos/CameraBarcodeScanner';
import { lookupBarcodeName } from '@/lib/barcode-lookup';
import { formatINR, getCurrentOrganization, type CurrentOrganization } from '@/lib/pos';
import { posText } from '@/lib/pos-i18n';
import { addProduct as createProduct, listProducts, removeProduct as deleteProduct } from '@/lib/pos-api';

type Product={id:string;name:string;sku:string|null;barcode:string|null;unit:string;hsn_sac:string|null;purchase_price:number;selling_price:number;tax_rate:number;tax_inclusive:boolean;stock:number;low_stock_threshold:number;created_at:string};
const emptyForm={name:'',sku:'',barcode:'',unit:'pcs',hsnSac:'',purchasePrice:'',sellingPrice:'',taxRate:'18',taxInclusive:false,stock:'0',lowStockThreshold:'5'};

export default function ProductsPage(){
  const router=useRouter();const [org,setOrg]=useState<CurrentOrganization|null>(null);const [products,setProducts]=useState<Product[]>([]);const [form,setForm]=useState(emptyForm);const [query,setQuery]=useState('');const [showForm,setShowForm]=useState(false);const [saving,setSaving]=useState(false);const [error,setError]=useState('');
  const loadProducts=useCallback(async(organizationId:string)=>{void organizationId;const response=await listProducts('',false,300);setProducts(response.data as unknown as Product[]);},[]);
  useEffect(()=>{getCurrentOrganization().then(async current=>{if(!current)return router.replace('/auth/login');if(current.role!=='OWNER')return router.replace('/staff');setOrg(current);try{await loadProducts(current.organizationId);}catch(err){setError(err instanceof Error?err.message:'Could not load products.');}});},[loadProducts,router]);
  const filtered=useMemo(()=>{const text=query.toLowerCase().trim();if(!text)return products;return products.filter(p=>[p.name,p.sku,p.barcode,p.hsn_sac].some(v=>String(v??'').toLowerCase().includes(text)));},[products,query]);
  const t=posText(org?.preferredLanguage??'en');
  const hindi=org?.preferredLanguage==='hi';
  const [barcodeNotice,setBarcodeNotice]=useState<{text:string;url?:string}>({text:''});
  async function scanProduct(code:string,preserveDraft=false){
    setError('');setBarcodeNotice({text:hindi?'Product dhoondh rahe hain…':'Looking up product…'});
    let catalog=products;
    if(navigator.onLine){try{const response=await listProducts(code,false,500);catalog=response.data as unknown as Product[];}catch{setBarcodeNotice({text:''});throw new Error(hindi?'Catalog check nahi ho saka. Connection check karke phir scan karein.':'Could not check your catalog. Check your connection and scan again.');}}
    const existing=catalog.filter(product=>product.barcode===code||product.sku?.toLowerCase()===code.toLowerCase());
    if(existing.length){setProducts(current=>[...current,...existing.filter(p=>!current.some(known=>known.id===p.id))]);setQuery(code);setShowForm(false);setBarcodeNotice({text:hindi?'Yeh product pehle se catalog mein hai.':'This product is already in your catalog.'});return;}
    setQuery('');setShowForm(true);setForm(current=>({...preserveDraft?current:emptyForm,barcode:code}));
    const suggestion=await lookupBarcodeName(code);
    setForm(current=>current.barcode===code?{...current,name:current.name.trim()?current.name:suggestion?.name??''}:current);
    setBarcodeNotice(suggestion?{text:hindi?`${suggestion.source} se naam mila. Naam check karke apni price, GST aur stock bharein.`:`Name suggested by ${suggestion.source}. Review it and enter your price, GST and stock.`,url:suggestion.sourceUrl}:{text:hindi?'Online naam nahi mila. Barcode bhar diya hai; naam aur price likhein.':'No online name found. Barcode is filled; enter the product name and price.'});
  }
  async function addProduct(event:FormEvent){event.preventDefault();if(!org||!form.name.trim()||!form.sellingPrice)return;setSaving(true);setError('');try{await createProduct({name:form.name.trim(),sku:form.sku.trim()||null,barcode:form.barcode.trim()||null,unit:form.unit.trim()||'pcs',hsn_sac:form.hsnSac.trim()||null,purchase_price:Number(form.purchasePrice||0),selling_price:Number(form.sellingPrice),tax_rate:Number(form.taxRate||0),tax_inclusive:form.taxInclusive,stock:Number(form.stock||0),low_stock_threshold:Number(form.lowStockThreshold||0)});setForm(emptyForm);setShowForm(false);await loadProducts(org.organizationId);}catch(reason){setError(reason instanceof Error?reason.message:'Could not save product.');}finally{setSaving(false);}}
  async function removeProduct(product:Product){if(!org||!window.confirm(`${t.removeProductConfirm}\n${product.name}`))return;try{await deleteProduct(product.id);await loadProducts(org.organizationId);}catch(reason){setError(reason instanceof Error?reason.message:'Could not remove product.');}}
  if(!org)return <WorkspaceLoader/>;
  return <OwnerShell businessName={org.organizationName} language={org.preferredLanguage}>
    <PosAssist mode="product" onBatchSaved={()=>loadProducts(org.organizationId)} onConfirm={async draft=>{
      if(draft.selling_price==null)throw new Error('Enter a price first.');
      await createProduct({name:draft.name,selling_price:draft.selling_price,stock:draft.stock??0,unit:draft.unit??'pcs',tax_rate:draft.tax_rate??0,tax_inclusive:draft.tax_inclusive??false});
      try{await loadProducts(org.organizationId);}catch{setError('Product saved. Refresh to reload the catalog.');}
    }} onDraft={draft=>{setForm({...emptyForm,name:String(draft.name??''),sellingPrice:draft.selling_price==null?'':String(draft.selling_price),stock:String(draft.stock??0),unit:String(draft.unit??'pcs'),taxRate:String(draft.tax_rate??0),taxInclusive:Boolean(draft.tax_inclusive)});setShowForm(true);}}/>
    <div className="content-head pos-page-head"><div><span className="page-kicker">{t.productsKicker}</span><h1>{t.productsTitle}</h1><p>{t.productsSub}</p></div><button className="btn btn-primary" onClick={()=>setShowForm(v=>!v)}>{showForm?t.close:`+ ${t.addProduct}`}</button></div>{error&&<div className="form-error">{error}</div>}
    {barcodeNotice.text&&<p role="status">{barcodeNotice.text} {barcodeNotice.url&&<a href={barcodeNotice.url} target="_blank" rel="noopener noreferrer">{hindi?'Product dekhein':'View source'}</a>}</p>}
    {showForm&&<form className="card inline-form-panel" onSubmit={addProduct}><div className="form-panel-head"><div><h2>{t.newProduct}</h2><p>{t.newProductSub}</p></div></div><div className="grid-2">
      <div className="field"><label>{t.productName} *</label><input className="input" required value={form.name} onChange={e=>setForm({...form,name:e.target.value})}/></div>
      <div className="field"><label>{t.sellingPrice} *</label><input className="input" type="number" min="0" step="0.01" required value={form.sellingPrice} onChange={e=>setForm({...form,sellingPrice:e.target.value})}/></div>
      <div className="field"><label>{t.sku}</label><input className="input" value={form.sku} onChange={e=>setForm({...form,sku:e.target.value})}/></div>
      <div className="field"><label>{t.barcode}</label><input className="input" value={form.barcode} onChange={e=>setForm({...form,barcode:e.target.value})}/><CameraBarcodeScanner hindi={hindi} disabled={saving} onScan={code=>scanProduct(code,true)}/></div>
      <div className="field"><label>{t.purchasePrice}</label><input className="input" type="number" min="0" step="0.01" value={form.purchasePrice} onChange={e=>setForm({...form,purchasePrice:e.target.value})}/></div>
      <div className="field"><label>{t.openingStock}</label><input className="input" type="number" min="0" step="0.001" value={form.stock} onChange={e=>setForm({...form,stock:e.target.value})}/></div>
      <div className="field"><label>{t.gstRate}</label><select className="select" value={form.taxRate} onChange={e=>setForm({...form,taxRate:e.target.value})}><option value="0">0%</option><option value="5">5%</option><option value="12">12%</option><option value="18">18%</option><option value="28">28%</option></select></div>
      <div className="field"><label>{t.hsnSac}</label><input className="input" value={form.hsnSac} onChange={e=>setForm({...form,hsnSac:e.target.value})}/></div>
      <div className="field"><label>{t.unit}</label><input className="input" value={form.unit} onChange={e=>setForm({...form,unit:e.target.value})}/></div>
      <div className="field"><label>{t.lowStockAlert}</label><input className="input" type="number" min="0" step="0.001" value={form.lowStockThreshold} onChange={e=>setForm({...form,lowStockThreshold:e.target.value})}/></div>
      <label className="checkbox-row field full"><input type="checkbox" checked={form.taxInclusive} onChange={e=>setForm({...form,taxInclusive:e.target.checked})}/><span>{t.priceIncludesGst}</span></label>
    </div><div className="form-actions"><button className="btn" type="button" onClick={()=>setShowForm(false)}>{t.cancel}</button><button className="btn btn-primary" disabled={saving}>{saving?t.saving:t.saveProduct}</button></div></form>}
    <section className="card pos-panel"><div className="list-toolbar"><CameraBarcodeScanner hindi={hindi} onScan={code=>scanProduct(code)}/><input className="input search-input" placeholder={t.searchProduct} value={query} onChange={e=>setQuery(e.target.value)}/><span>{filtered.length} {t.products.toLowerCase()}</span></div><div className="data-table-wrap"><table className="data-table"><thead><tr><th>{t.product}</th><th>{t.price}</th><th>{t.gst}</th><th>{t.stock}</th><th></th></tr></thead><tbody>{filtered.length===0?<tr><td colSpan={5}><div className="empty-state">{t.noProducts}</div></td></tr>:filtered.map(product=>{const low=Number(product.stock)<=Number(product.low_stock_threshold);return <tr key={product.id}><td><strong>{product.name}</strong><small>{product.sku||product.barcode||product.hsn_sac||t.noSku}</small></td><td><strong>{formatINR(product.selling_price)}</strong><small>{product.tax_inclusive?t.gstIncluded:t.gstExtra}</small></td><td>{Number(product.tax_rate)}%</td><td><strong className={low?'stock-low':''}>{Number(product.stock)} {product.unit}</strong><small>{low?t.lowStock:t.inStock}</small></td><td className="table-action"><button className="text-danger" onClick={()=>removeProduct(product)}>{t.remove}</button></td></tr>;})}</tbody></table></div></section>
  </OwnerShell>;
}
