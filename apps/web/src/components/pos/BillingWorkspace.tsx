'use client';

import { useEffect, useMemo, useState, type KeyboardEvent } from 'react';
import { useRouter } from 'next/navigation';
import OwnerShell from '@/components/pos/OwnerShell';
import StaffShell from '@/components/pos/StaffShell';
import WorkspaceLoader from '@/components/pos/WorkspaceLoader';
import { formatINR, getCurrentOrganization, isSubscriptionUsable, type CurrentOrganization } from '@/lib/pos';
import { getSupabaseBrowserClient } from '@/lib/supabase';
import { posText } from '@/lib/pos-i18n';

type Product={id:string;name:string;sku:string|null;barcode:string|null;selling_price:number;tax_rate:number;tax_inclusive:boolean;stock:number;unit:string};
type Customer={id:string;name:string;phone:string|null};
type CartItem=Product&{quantity:number};
type Props={portal:'owner'|'staff'};
type BillingPolicy={allowStaffDiscount:boolean;staffDiscountLimit:number;defaultPayment:string};

const PRODUCT_COLUMNS='id,name,sku,barcode,selling_price,tax_rate,tax_inclusive,stock,unit';

function mergeProducts(...lists:Product[][]){
  const byId=new Map<string,Product>();
  for(const list of lists)for(const product of list)byId.set(product.id,product);
  return [...byId.values()];
}

export default function BillingWorkspace({portal}:Props){
  const router=useRouter();
  const[org,setOrg]=useState<CurrentOrganization|null>(null);
  const[products,setProducts]=useState<Product[]>([]);
  const[remoteProducts,setRemoteProducts]=useState<Product[]>([]);
  const[customers,setCustomers]=useState<Customer[]>([]);
  const[cart,setCart]=useState<CartItem[]>([]);
  const[query,setQuery]=useState('');
  const[customerId,setCustomerId]=useState('');
  const[discountType,setDiscountType]=useState<'PERCENT'|'FLAT'>('PERCENT');
  const[discountValue,setDiscountValue]=useState('0');
  const[paymentMethod,setPaymentMethod]=useState('CASH');
  const[amountPaid,setAmountPaid]=useState('');
  const[policy,setPolicy]=useState<BillingPolicy>({allowStaffDiscount:false,staffDiscountLimit:0,defaultPayment:'CASH'});
  const[creating,setCreating]=useState(false);
  const[catalogBusy,setCatalogBusy]=useState(false);
  const[error,setError]=useState('');
  const[success,setSuccess]=useState<{id:string;invoiceNumber:string;total:number}|null>(null);

  useEffect(()=>{
    async function load(){
      const current=await getCurrentOrganization();
      if(!current)return router.replace('/auth/login');
      const expected=portal==='owner'?'OWNER':'STAFF';
      if(current.role!==expected)return router.replace(current.role==='OWNER'?'/owner/billing':'/staff/billing');
      if(!isSubscriptionUsable(current.subscriptionStatus,current.endsAt))return router.replace(current.role==='OWNER'?'/owner':'/staff');
      setOrg(current);
      const supabase=getSupabaseBrowserClient();
      const[productResult,customerResult,settingsResult]=await Promise.all([
        supabase.from('products').select(PRODUCT_COLUMNS).eq('organization_id',current.organizationId).eq('active',true).is('deleted_at',null).order('name').limit(250),
        supabase.from('customers').select('id,name,phone').eq('organization_id',current.organizationId).eq('active',true).is('deleted_at',null).order('name').limit(400),
        supabase.from('organization_settings').select('allow_staff_discount,staff_discount_limit,default_payment_method').eq('organization_id',current.organizationId).single()
      ]);
      if(productResult.error)setError('Could not load the product catalog. Please retry.');
      if(customerResult.error)setError('Could not load customers. Please retry.');
      setProducts((productResult.data??[]) as Product[]);
      setCustomers((customerResult.data??[]) as Customer[]);
      if(settingsResult.data){
        const next={allowStaffDiscount:Boolean(settingsResult.data.allow_staff_discount),staffDiscountLimit:Number(settingsResult.data.staff_discount_limit??0),defaultPayment:String(settingsResult.data.default_payment_method??'CASH')};
        setPolicy(next);setPaymentMethod(next.defaultPayment);
      }
    }
    load();
  },[portal,router]);

  // Keep initial render light, but search the full tenant catalog when local results are not enough.
  useEffect(()=>{
    const text=query.trim();
    if(!org||text.length<2){setRemoteProducts([]);setCatalogBusy(false);return;}
    let active=true;
    const timer=window.setTimeout(async()=>{
      setCatalogBusy(true);
      const supabase=getSupabaseBrowserClient();
      const [nameResult,barcodeResult,skuResult]=await Promise.all([
        supabase.from('products').select(PRODUCT_COLUMNS).eq('organization_id',org.organizationId).eq('active',true).is('deleted_at',null).ilike('name',`%${text}%`).order('name').limit(30),
        supabase.from('products').select(PRODUCT_COLUMNS).eq('organization_id',org.organizationId).eq('active',true).is('deleted_at',null).eq('barcode',text).limit(3),
        supabase.from('products').select(PRODUCT_COLUMNS).eq('organization_id',org.organizationId).eq('active',true).is('deleted_at',null).eq('sku',text).limit(3)
      ]);
      if(!active)return;
      const data=mergeProducts((nameResult.data??[]) as Product[],(barcodeResult.data??[]) as Product[],(skuResult.data??[]) as Product[]);
      setRemoteProducts(data);
      setCatalogBusy(false);
    },240);
    return()=>{active=false;window.clearTimeout(timer);};
  },[query,org]);

  const filteredProducts=useMemo(()=>{
    const text=query.trim().toLowerCase();
    if(!text)return products.slice(0,30);
    const local=products.filter(p=>[p.name,p.sku,p.barcode].some(v=>String(v??'').toLowerCase().includes(text)));
    return mergeProducts(local,remoteProducts).slice(0,50);
  },[products,remoteProducts,query]);

  const effectiveDiscount=portal==='staff'?(policy.allowStaffDiscount?Math.min(Number(discountValue||0),policy.staffDiscountLimit):0):Number(discountValue||0);
  const effectiveType=portal==='staff'?'PERCENT':discountType;
  const estimated=useMemo(()=>{
    let base=0,tax=0;
    for(const item of cart){
      const gross=Number(item.selling_price)*item.quantity;const rate=Number(item.tax_rate)/100;
      if(item.tax_inclusive&&rate>0){const taxable=gross/(1+rate);base+=taxable;tax+=gross-taxable;}else{base+=gross;tax+=gross*rate;}
    }
    const rawDiscount=effectiveType==='PERCENT'?base*Math.min(Math.max(effectiveDiscount,0),100)/100:Math.min(Math.max(effectiveDiscount,0),base);
    const ratio=base>0?(base-rawDiscount)/base:1;
    return{base,discount:rawDiscount,tax:tax*ratio,total:(base-rawDiscount)+tax*ratio};
  },[cart,effectiveDiscount,effectiveType]);

  function addProduct(product:Product){
    setSuccess(null);
    setCart(current=>{
      const existing=current.find(item=>item.id===product.id);
      if(existing)return current.map(item=>item.id===product.id?{...item,quantity:Math.min(item.quantity+1,Number(product.stock))}:item);
      if(Number(product.stock)<=0)return current;
      return[...current,{...product,quantity:1}];
    });
    setQuery('');setRemoteProducts([]);
  }

  function setQuantity(productId:string,quantity:number){
    setCart(current=>current.map(item=>item.id===productId?{...item,quantity:Math.max(1,Math.min(quantity,Number(item.stock)))}:item));
  }

  async function handleSearchKeyDown(event:KeyboardEvent<HTMLInputElement>){
    if(event.key!=='Enter')return;
    event.preventDefault();
    const raw=query.trim();
    if(!raw)return;
    const lowered=raw.toLowerCase();
    const exact=mergeProducts(products,remoteProducts).find(p=>String(p.barcode??'').toLowerCase()===lowered||String(p.sku??'').toLowerCase()===lowered);
    if(exact){addProduct(exact);return;}
    if(filteredProducts.length===1){addProduct(filteredProducts[0]);return;}
    if(!org)return;
    setCatalogBusy(true);
    const supabase=getSupabaseBrowserClient();
    const[barcodeResult,skuResult]=await Promise.all([
      supabase.from('products').select(PRODUCT_COLUMNS).eq('organization_id',org.organizationId).eq('active',true).is('deleted_at',null).eq('barcode',raw).limit(1),
      supabase.from('products').select(PRODUCT_COLUMNS).eq('organization_id',org.organizationId).eq('active',true).is('deleted_at',null).eq('sku',raw).limit(1)
    ]);
    setCatalogBusy(false);
    const found=((barcodeResult.data?.[0]??skuResult.data?.[0]) as Product|undefined);
    if(found){setProducts(current=>mergeProducts(current,[found]));addProduct(found);}
  }

  async function createBill(){
    if(!org||cart.length===0)return;
    setCreating(true);setError('');setSuccess(null);
    const paid=amountPaid===''?null:Number(amountPaid);
    const{data,error:rpcError}=await getSupabaseBrowserClient().rpc('create_pos_invoice',{
      p_organization_id:org.organizationId,p_customer_id:customerId||null,p_items:cart.map(item=>({product_id:item.id,quantity:item.quantity})),p_discount_type:effectiveType,p_discount_value:effectiveDiscount,p_payment_method:paymentMethod,p_amount_paid:paid,p_client_invoice_id:crypto.randomUUID()
    });
    setCreating(false);
    if(rpcError)return setError('Bill could not be created. Please check stock/network and retry.');
    const result=Array.isArray(data)?data[0]:data;
    setSuccess({id:result?.invoice_id??'',invoiceNumber:result?.invoice_number??'Created',total:Number(result?.grand_total??estimated.total)});
    setCart([]);setCustomerId('');setDiscountValue('0');setAmountPaid('');
    const{data:refreshed}=await getSupabaseBrowserClient().from('products').select(PRODUCT_COLUMNS).eq('organization_id',org.organizationId).eq('active',true).is('deleted_at',null).order('name').limit(250);
    setProducts((refreshed??[]) as Product[]);
  }

  if(!org)return <WorkspaceLoader/>;
  const Shell=portal==='owner'?OwnerShell:StaffShell;
  const base=portal==='owner'?'/owner':'/staff';
  const t=posText(org.preferredLanguage);
  const searchStatus=org.preferredLanguage==='hi'?'पूरे कैटलॉग में खोज रहे हैं…':org.preferredLanguage==='hinglish'?'Poore catalog mein search ho raha hai…':'Searching the full catalog…';

  return <Shell businessName={org.organizationName} language={org.preferredLanguage}>
    <div className="content-head pos-page-head"><div><span className="page-kicker">{portal==='staff'?t.counterKickerStaff:t.counterKickerOwner}</span><h1>{portal==='staff'?t.counterStaffTitle:t.counterOwnerTitle}</h1><p>{t.counterSub}</p></div><div className="counter-shortcut" aria-hidden="true">↵ <span>{t.searchFocused}</span></div></div>
    {error&&<div className="form-error" role="alert">{error}</div>}
    {success&&<div className="bill-success" role="status"><div><span>{t.billCreated}</span><h2>{success.invoiceNumber}</h2><p>{formatINR(success.total)} · {t.stockUpdated}</p></div><div className="hero-actions" style={{marginTop:0}}>{success.id&&<button className="btn btn-primary" onClick={()=>router.push(`${base}/invoices/${success.id}`)}>{t.viewPrint}</button>}<button className="btn" onClick={()=>setSuccess(null)}>{t.newBill}</button></div></div>}
    <div className="billing-grid premium-counter">
      <section className="card billing-products"><div className="billing-search"><span className="search-mark" aria-hidden="true">⌕</span><input autoFocus aria-label={t.scanSearch} autoComplete="off" className="input" placeholder={t.scanSearch} value={query} onChange={e=>setQuery(e.target.value)} onKeyDown={handleSearchKeyDown}/></div>{catalogBusy&&<div className="catalog-search-state" role="status">{searchStatus}</div>}<div className="product-picker">{filteredProducts.map(product=><button type="button" key={product.id} className="product-pick" disabled={Number(product.stock)<=0} onClick={()=>addProduct(product)}><span><strong>{product.name}</strong><small>{product.sku||product.barcode||`${Number(product.tax_rate)}% GST`}</small></span><span className="product-pick-right"><strong>{formatINR(product.selling_price)}</strong><small className={Number(product.stock)<=5?'stock-low':''}>{Number(product.stock)} {product.unit}</small></span></button>)}{filteredProducts.length===0&&!catalogBusy&&<div className="empty-state">{t.noMatchingProducts}</div>}</div></section>
      <section className="card bill-cart"><div className="bill-cart-head"><div><span className="page-kicker">{t.currentBill}</span><h2>{cart.length} {cart.length===1?t.item:t.items}</h2></div><button type="button" className="text-danger" onClick={()=>setCart([])}>{t.clear}</button></div><div className="cart-list">{cart.length===0?<div className="empty-state bill-empty"><span className="empty-receipt" aria-hidden="true">▤</span><strong>{t.startProduct}</strong><br/>{t.searchTapAdd}</div>:cart.map(item=><div className="cart-row" key={item.id}><div><strong>{item.name}</strong><small>{formatINR(item.selling_price)} · {Number(item.tax_rate)}% GST</small></div><div className="qty-control" aria-label={`${item.name} quantity`}><button type="button" aria-label={`Reduce ${item.name} quantity`} onClick={()=>setQuantity(item.id,item.quantity-1)}>-</button><input aria-label={`${item.name} quantity`} inputMode="numeric" value={item.quantity} onChange={e=>setQuantity(item.id,Number(e.target.value||1))}/><button type="button" aria-label={`Increase ${item.name} quantity`} onClick={()=>setQuantity(item.id,item.quantity+1)}>+</button></div><strong>{formatINR(Number(item.selling_price)*item.quantity)}</strong><button type="button" aria-label={`Remove ${item.name}`} className="cart-remove" onClick={()=>setCart(c=>c.filter(x=>x.id!==item.id))}>×</button></div>)}</div>
        <div className="bill-options"><div className="field"><label>{t.customer}</label><select className="select" value={customerId} onChange={e=>setCustomerId(e.target.value)}><option value="">{t.walkInCustomer}</option>{customers.map(c=><option key={c.id} value={c.id}>{c.name}{c.phone?` · ${c.phone}`:''}</option>)}</select></div>
          {portal==='owner'?<div className="discount-row"><div className="field"><label>{t.discount}</label><select className="select" value={discountType} onChange={e=>setDiscountType(e.target.value as 'PERCENT'|'FLAT')}><option value="PERCENT">{t.percentage}</option><option value="FLAT">{t.flat}</option></select></div><div className="field"><label>{t.value}</label><input className="input" type="number" min="0" step="0.01" value={discountValue} onChange={e=>setDiscountValue(e.target.value)}/></div></div>:policy.allowStaffDiscount?<div className="field"><label>{t.discount} % <span className="muted">({t.ownerDiscountLimit} {policy.staffDiscountLimit}%)</span></label><input className="input" type="number" min="0" max={policy.staffDiscountLimit} step="0.5" value={discountValue} onChange={e=>setDiscountValue(e.target.value)}/></div>:<div className="staff-policy-note">{t.discountOwnerOnly}</div>}
          <div className="payment-methods" aria-label="Payment method">{['CASH','UPI','CARD','CREDIT'].map(method=><button type="button" aria-pressed={paymentMethod===method} className={paymentMethod===method?'active':''} key={method} onClick={()=>setPaymentMethod(method)}>{method}</button>)}</div>
          <div className="field"><label>{t.amountPaid} <span className="muted">({t.amountPaidHint})</span></label><input className="input" type="number" inputMode="decimal" min="0" step="0.01" placeholder={paymentMethod==='CREDIT'?'0':estimated.total.toFixed(2)} value={amountPaid} onChange={e=>setAmountPaid(e.target.value)}/></div>
        </div>
        <div className="bill-totals"><div><span>{t.taxable}</span><strong>{formatINR(estimated.base)}</strong></div><div><span>{t.discount}</span><strong>- {formatINR(estimated.discount)}</strong></div><div><span>GST</span><strong>{formatINR(estimated.tax)}</strong></div><div className="bill-grand"><span>{t.total}</span><strong>{formatINR(estimated.total)}</strong></div></div>
        <button className="generate-bill" disabled={creating||cart.length===0} onClick={createBill}>{creating?t.creatingBill:`${t.createBill} · ${formatINR(estimated.total)}`}</button><p className="billing-note">{t.transactionSavedFirst}</p>
      </section>
    </div>
  </Shell>;
}
