'use client';

import { FormEvent, useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import OwnerShell from '@/components/pos/OwnerShell';
import WorkspaceLoader from '@/components/pos/WorkspaceLoader';
import { formatINR, getCurrentOrganization, type CurrentOrganization } from '@/lib/pos';
import { posText } from '@/lib/pos-i18n';
import { getSupabaseBrowserClient } from '@/lib/supabase';

type Product={id:string;name:string;sku:string|null;barcode:string|null;unit:string;hsn_sac:string|null;purchase_price:number;selling_price:number;tax_rate:number;tax_inclusive:boolean;stock:number;low_stock_threshold:number;created_at:string};
const emptyForm={name:'',sku:'',barcode:'',unit:'pcs',hsnSac:'',purchasePrice:'',sellingPrice:'',taxRate:'18',taxInclusive:false,stock:'0',lowStockThreshold:'5'};

export default function ProductsPage(){
  const router=useRouter();const [org,setOrg]=useState<CurrentOrganization|null>(null);const [products,setProducts]=useState<Product[]>([]);const [form,setForm]=useState(emptyForm);const [query,setQuery]=useState('');const [showForm,setShowForm]=useState(false);const [saving,setSaving]=useState(false);const [error,setError]=useState('');
  const loadProducts=useCallback(async(organizationId:string)=>{const{data,error:loadError}=await getSupabaseBrowserClient().from('products').select('id,name,sku,barcode,unit,hsn_sac,purchase_price,selling_price,tax_rate,tax_inclusive,stock,low_stock_threshold,created_at').eq('organization_id',organizationId).is('deleted_at',null).order('created_at',{ascending:false}).limit(300);if(loadError)throw loadError;setProducts((data??[]) as Product[]);},[]);
  useEffect(()=>{getCurrentOrganization().then(async current=>{if(!current)return router.replace('/auth/login');if(current.role!=='OWNER')return router.replace('/staff');setOrg(current);try{await loadProducts(current.organizationId);}catch(err){setError(err instanceof Error?err.message:'Could not load products.');}});},[loadProducts,router]);
  const filtered=useMemo(()=>{const text=query.toLowerCase().trim();if(!text)return products;return products.filter(p=>[p.name,p.sku,p.barcode,p.hsn_sac].some(v=>String(v??'').toLowerCase().includes(text)));},[products,query]);
  const t=posText(org?.preferredLanguage??'en');
  async function addProduct(event:FormEvent){event.preventDefault();if(!org||!form.name.trim()||!form.sellingPrice)return;setSaving(true);setError('');const{error:insertError}=await getSupabaseBrowserClient().from('products').insert({organization_id:org.organizationId,name:form.name.trim(),sku:form.sku.trim()||null,barcode:form.barcode.trim()||null,unit:form.unit.trim()||'pcs',hsn_sac:form.hsnSac.trim()||null,purchase_price:Number(form.purchasePrice||0),selling_price:Number(form.sellingPrice),tax_rate:Number(form.taxRate||0),tax_inclusive:form.taxInclusive,stock:Number(form.stock||0),low_stock_threshold:Number(form.lowStockThreshold||0)});setSaving(false);if(insertError)return setError(insertError.message);setForm(emptyForm);setShowForm(false);await loadProducts(org.organizationId);}
  async function removeProduct(product:Product){if(!org||!window.confirm(`${t.removeProductConfirm}\n${product.name}`))return;const{error:updateError}=await getSupabaseBrowserClient().from('products').update({deleted_at:new Date().toISOString(),active:false}).eq('id',product.id).eq('organization_id',org.organizationId);if(updateError)return setError(updateError.message);await loadProducts(org.organizationId);}
  if(!org)return <WorkspaceLoader/>;
  return <OwnerShell businessName={org.organizationName} language={org.preferredLanguage}>
    <div className="content-head pos-page-head"><div><span className="page-kicker">{t.productsKicker}</span><h1>{t.productsTitle}</h1><p>{t.productsSub}</p></div><button className="btn btn-primary" onClick={()=>setShowForm(v=>!v)}>{showForm?t.close:`+ ${t.addProduct}`}</button></div>{error&&<div className="form-error">{error}</div>}
    {showForm&&<form className="card inline-form-panel" onSubmit={addProduct}><div className="form-panel-head"><div><h2>{t.newProduct}</h2><p>{t.newProductSub}</p></div></div><div className="grid-2">
      <div className="field"><label>{t.productName} *</label><input className="input" required value={form.name} onChange={e=>setForm({...form,name:e.target.value})}/></div>
      <div className="field"><label>{t.sellingPrice} *</label><input className="input" type="number" min="0" step="0.01" required value={form.sellingPrice} onChange={e=>setForm({...form,sellingPrice:e.target.value})}/></div>
      <div className="field"><label>{t.sku}</label><input className="input" value={form.sku} onChange={e=>setForm({...form,sku:e.target.value})}/></div>
      <div className="field"><label>{t.barcode}</label><input className="input" value={form.barcode} onChange={e=>setForm({...form,barcode:e.target.value})}/></div>
      <div className="field"><label>{t.purchasePrice}</label><input className="input" type="number" min="0" step="0.01" value={form.purchasePrice} onChange={e=>setForm({...form,purchasePrice:e.target.value})}/></div>
      <div className="field"><label>{t.openingStock}</label><input className="input" type="number" min="0" step="0.001" value={form.stock} onChange={e=>setForm({...form,stock:e.target.value})}/></div>
      <div className="field"><label>{t.gstRate}</label><select className="select" value={form.taxRate} onChange={e=>setForm({...form,taxRate:e.target.value})}><option value="0">0%</option><option value="5">5%</option><option value="12">12%</option><option value="18">18%</option><option value="28">28%</option></select></div>
      <div className="field"><label>{t.hsnSac}</label><input className="input" value={form.hsnSac} onChange={e=>setForm({...form,hsnSac:e.target.value})}/></div>
      <div className="field"><label>{t.unit}</label><input className="input" value={form.unit} onChange={e=>setForm({...form,unit:e.target.value})}/></div>
      <div className="field"><label>{t.lowStockAlert}</label><input className="input" type="number" min="0" step="0.001" value={form.lowStockThreshold} onChange={e=>setForm({...form,lowStockThreshold:e.target.value})}/></div>
      <label className="checkbox-row field full"><input type="checkbox" checked={form.taxInclusive} onChange={e=>setForm({...form,taxInclusive:e.target.checked})}/><span>{t.priceIncludesGst}</span></label>
    </div><div className="form-actions"><button className="btn" type="button" onClick={()=>setShowForm(false)}>{t.cancel}</button><button className="btn btn-primary" disabled={saving}>{saving?t.saving:t.saveProduct}</button></div></form>}
    <section className="card pos-panel"><div className="list-toolbar"><input className="input search-input" placeholder={t.searchProduct} value={query} onChange={e=>setQuery(e.target.value)}/><span>{filtered.length} {t.products.toLowerCase()}</span></div><div className="data-table-wrap"><table className="data-table"><thead><tr><th>{t.product}</th><th>{t.price}</th><th>{t.gst}</th><th>{t.stock}</th><th></th></tr></thead><tbody>{filtered.length===0?<tr><td colSpan={5}><div className="empty-state">{t.noProducts}</div></td></tr>:filtered.map(product=>{const low=Number(product.stock)<=Number(product.low_stock_threshold);return <tr key={product.id}><td><strong>{product.name}</strong><small>{product.sku||product.barcode||product.hsn_sac||t.noSku}</small></td><td><strong>{formatINR(product.selling_price)}</strong><small>{product.tax_inclusive?t.gstIncluded:t.gstExtra}</small></td><td>{Number(product.tax_rate)}%</td><td><strong className={low?'stock-low':''}>{Number(product.stock)} {product.unit}</strong><small>{low?t.lowStock:t.inStock}</small></td><td className="table-action"><button className="text-danger" onClick={()=>removeProduct(product)}>{t.remove}</button></td></tr>;})}</tbody></table></div></section>
  </OwnerShell>;
}
