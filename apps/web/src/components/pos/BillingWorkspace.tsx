'use client';

import { useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import { useRouter } from 'next/navigation';
import OwnerShell from '@/components/pos/OwnerShell';
import StaffShell from '@/components/pos/StaffShell';
import WorkspaceLoader from '@/components/pos/WorkspaceLoader';
import PosAssist from '@/components/pos/PosAssist';
import CheckoutCustomer, { type CustomerDetails } from '@/components/pos/CheckoutCustomer';
import CameraBarcodeScanner from '@/components/pos/CameraBarcodeScanner';
import { lookupBarcodeName } from '@/lib/barcode-lookup';
import { connectSc03Printer, prepareSc03Printer, queueSc03Print } from '@/lib/sc03-printer';
import BillingQuickAdd from '@/components/pos/BillingQuickAdd';
import { formatINR, getCurrentOrganization, isSubscriptionUsable, type CurrentOrganization } from '@/lib/pos';
import { createInvoice, getBillingPolicy, listCustomers, listProducts } from '@/lib/pos-api';
import { posText } from '@/lib/pos-i18n';
import { uiText } from '@/lib/pos-language';
import { getFirebaseAuth } from '@/lib/firebase';
import { clearRecovery, readRecovery, recoveryKey, saveRecovery, type BillingRecovery } from '@/lib/billing-recovery';
import { readOfflineWorkspace,saveOfflineWorkspace,clearOfflineWorkspace,prepareOfflineShell } from '@/lib/offline-workspace';
import { pendingBills,queueBill } from '@/lib/offline-bill';
import PendingOfflineBill from './PendingOfflineBill';
import { mergeVoiceBill,voiceBillReview } from '@/lib/voice-bill-review';
import QuantityInput from './QuantityInput';
import SimpleBillingGuide from './SimpleBillingGuide';
import { billingQuantity } from '@/lib/billing-quantity';

type Product={id:string;name:string;sku:string|null;barcode:string|null;selling_price:number;tax_rate:number;tax_inclusive:boolean;stock:number;unit:string};
type Customer={id:string;name:string;phone:string|null};
type CartItem=Product&{quantity:number};
type Props={portal:'owner'|'staff'};
type BillingPolicy={allowStaffDiscount:boolean;staffDiscountLimit:number;defaultPayment:string};

function mergeProducts(...lists:Product[][]){
  const byId=new Map<string,Product>();
  for(const list of lists)for(const product of list)byId.set(product.id,product);
  return [...byId.values()];
}

export default function BillingWorkspace({portal}:Props){
  const router=useRouter();
  const [simpleMode,setSimpleMode]=useState(false);
  const [online,setOnline]=useState(true);
  const [offlineLoaded,setOfflineLoaded]=useState(false);
  const [offlineNotice,setOfflineNotice]=useState('');
  const [preparingOffline,setPreparingOffline]=useState(false);
  useEffect(()=>{const refresh=()=>setOnline(navigator.onLine);refresh();window.addEventListener('online',refresh);window.addEventListener('offline',refresh);return()=>{window.removeEventListener('online',refresh);window.removeEventListener('offline',refresh);};},[]);
  const[org,setOrg]=useState<CurrentOrganization|null>(null);
  const language=org?.preferredLanguage??'en';
  const tr=(en:string,hi:string,hinglish:string)=>uiText(language,en,hi,hinglish);
  const[products,setProducts]=useState<Product[]>([]);
  const[remoteProducts,setRemoteProducts]=useState<Product[]>([]);
  const[customers,setCustomers]=useState<Customer[]>([]);
  const[cart,setCart]=useState<CartItem[]>([]);
  const[query,setQuery]=useState('');
  const[customerId,setCustomerId]=useState('');
  const [customerDetails,setCustomerDetails]=useState<CustomerDetails>({name:'',phone:''});
  const updateCustomerDetails=useCallback((value:CustomerDetails)=>{
    setCustomerDetails(value);
    if(value.name.trim()||value.phone.trim())setCustomerId('');
  },[]);
  const [printTarget,setPrintTarget]=useState<'sc03'|'system'>('sc03');
  const [barcodeDraft,setBarcodeDraft]=useState<{barcode:string;name:string;nonce:number}>();
  const [scanNotice,setScanNotice]=useState('');
  const scanBusy=useRef(false);
  const draftGeneration=useRef(0);
  const renderedGeneration=draftGeneration.current;
  const[discountType,setDiscountType]=useState<'PERCENT'|'FLAT'>('PERCENT');
  const[discountValue,setDiscountValue]=useState('0');
  const[paymentMethod,setPaymentMethod]=useState('CASH');
  const[amountPaid,setAmountPaid]=useState('');
  const[policy,setPolicy]=useState<BillingPolicy>({allowStaffDiscount:false,staffDiscountLimit:0,defaultPayment:'CASH'});
  const[creating,setCreating]=useState(false);
  const pendingInvoice=useRef<{fingerprint:string;id:string}|null>(null);
  const submitting=useRef(false);
  const workspaceUid=useRef<string|null>(null);
  const[catalogBusy,setCatalogBusy]=useState(false);
  const[error,setError]=useState('');
  const[printerNotice,setPrinterNotice]=useState('');
  const[success,setSuccess]=useState<{id:string;invoiceNumber:string;total:number}|null>(null);
  const [recovery,setRecovery]=useState<BillingRecovery|null>(null);
  const [recoveryReady,setRecoveryReady]=useState(false);
  const [storageError,setStorageError]=useState('');
  const recoveryStorageKey=useRef<string|null>(null);
  useEffect(()=>{
    let active=true;
    void prepareSc03Printer().catch(reason=>{
      if(active)setPrinterNotice(reason instanceof Error?reason.message:tr('Saved printer could not be restored. Select it once using Bluetooth.','सेव किया प्रिंटर वापस नहीं जुड़ा। Bluetooth से एक बार चुनें।','Saved printer restore nahi ho saka. Bluetooth se ek baar chunein.'));
    });
    return()=>{active=false;};
  },[language]);
  const snapshot=():BillingRecovery=>({version:1,savedAt:Date.now(),cart,customerId,customerDetails,discountType,discountValue,paymentMethod,amountPaid,pendingInvoice:pendingInvoice.current});
  useEffect(()=>{
    if(!org)return;
    const uid=getFirebaseAuth().currentUser?.uid;
    if(!uid)return;
    const key=recoveryKey(uid,org.organizationId);recoveryStorageKey.current=key;
    try{
      const saved=readRecovery(key);
      if(saved&&(saved.cart.length||saved.customerDetails?.name||saved.customerDetails?.phone)){setRecovery(saved);return;}
      setRecoveryReady(true);
    }
    catch{setStorageError(tr("Device storage could not be read. Keep this page open until your bill is saved.","डिवाइस स्टोरेज नहीं खुला। बिल सेव होने तक यह पेज खुला रखें।","Device storage nahi khula. Bill save hone tak yeh page khula rakhein."));}
  },[org]);
  useEffect(()=>{
    if(!recoveryReady||!recoveryStorageKey.current)return;
    try{saveRecovery(recoveryStorageKey.current,snapshot());setStorageError('');}
    catch{setStorageError(tr("Draft could not be saved on this device. Do not close this page.","अधूरा बिल डिवाइस पर सेव नहीं हुआ। यह पेज बंद न करें।","Adhoora bill device par save nahi hua. Yeh page band na karein."));}
  },[cart,customerId,customerDetails,discountType,discountValue,paymentMethod,amountPaid,recoveryReady]);
  function restoreDraft(){
    if(!recovery)return;
    draftGeneration.current++;
    setCart(recovery.cart as CartItem[]);setCustomerId(recovery.customerId);setCustomerDetails(recovery.customerDetails??{name:'',phone:''});setDiscountType(recovery.discountType);setDiscountValue(recovery.discountValue);setPaymentMethod(recovery.paymentMethod);setAmountPaid(recovery.amountPaid);pendingInvoice.current=recovery.pendingInvoice;
    setRecovery(null);setRecoveryReady(true);
  }

  useEffect(()=>{
    async function load(){
      try {
      const auth=getFirebaseAuth();await auth.authStateReady();workspaceUid.current=auth.currentUser?.uid??null;
      if(!navigator.onLine){
        const saved=auth.currentUser?readOfflineWorkspace(auth.currentUser.uid,portal):null;
        if(!saved)throw new Error('Offline billing is not prepared, has expired, or belongs to another login. Connect to the internet and open billing first.');
        setOrg(saved.organization);setProducts(saved.products as unknown as Product[]);setCustomers(saved.customers as unknown as Customer[]);setPolicy(saved.policy);setPaymentMethod('CASH');setOfflineLoaded(true);
        setOfflineNotice(`${uiText(saved.organization.preferredLanguage,'Offline catalog','ऑफलाइन सूची','Offline list')}: ${new Date(saved.savedAt).toLocaleString()}. ${uiText(saved.organization.preferredLanguage,'Only saved products and customers are available.','केवल सेव किए प्रोडक्ट और ग्राहक उपलब्ध हैं।','Sirf save kiye products aur customers available hain.')}`);return;
      }
      if(auth.currentUser)clearOfflineWorkspace(auth.currentUser.uid);
      const current=await getCurrentOrganization();
      if(!current)return router.replace('/auth/login');
      const expected=portal==='owner'?'OWNER':'STAFF';
      if(current.role!==expected)return router.replace(current.role==='OWNER'?'/owner/billing':'/staff/billing');
      if(!isSubscriptionUsable(current.subscriptionStatus,current.endsAt))return router.replace(current.role==='OWNER'?'/owner':'/staff');
      setOrg(current);
      try {
        const [productResult, customerResult, settingsResult] = await Promise.all([
          listProducts('', true, 250), listCustomers('', true, 400), getBillingPolicy()
        ]);
        setProducts(productResult.data as unknown as Product[]);
        setCustomers(customerResult.data as unknown as Customer[]);
        const next = settingsResult.data;
        setPolicy(next); setPaymentMethod(next.defaultPayment);
      } catch (reason) {
        setError(reason instanceof Error ? reason.message : tr("Could not load products and customers.","प्रोडक्ट और ग्राहक नहीं खुल सके।","Products aur customers nahi khul sake."));
      }
      } catch (reason) {
        setError(reason instanceof Error ? reason.message : tr("Could not load your workspace.","आपकी दुकान नहीं खुल सकी।","Aapki dukaan nahi khul saki."));
      }
    }
    load();
  },[portal,router]);

  async function prepareOffline(){
    setPreparingOffline(true);setOfflineNotice('');
    try{
      const current=await getCurrentOrganization();const uid=getFirebaseAuth().currentUser?.uid;
      if(!current||!uid||current.organizationId!==org?.organizationId||current.role!==(portal==='owner'?'OWNER':'STAFF')||!isSubscriptionUsable(current.subscriptionStatus,current.endsAt))throw new Error(tr("Reload and verify your shop access first.","पहले पेज दोबारा खोलकर दुकान का एक्सेस जाँचें।","Pehle page dobara kholkar dukaan ka access check karein."));
      if(cart.length||recovery)throw new Error(tr("Finish or restore the current draft before preparing offline billing.","ऑफलाइन बिलिंग तैयार करने से पहले मौजूदा बिल पूरा करें या वापस खोलें।","Offline billing taiyar karne se pehle abhi ka bill poora karein ya wapas kholein."));
      const [catalog,people,settings]=await Promise.all([listProducts('',true,500),listCustomers('',true,500),getBillingPolicy()]);
      await prepareOfflineShell(portal);
      if(getFirebaseAuth().currentUser?.uid!==uid)throw new Error(tr("Login changed during preparation. Reload and retry.","तैयारी के दौरान लॉगिन बदल गया। पेज दोबारा खोलकर कोशिश करें।","Taiyari ke dauran login badal gaya. Page dobara kholkar koshish karein."));
      saveOfflineWorkspace({version:1,uid,portal,savedAt:Date.now(),organization:current,products:catalog.data,customers:people.data,policy:settings.data});
      setProducts(catalog.data as unknown as Product[]);setCustomers(people.data as unknown as Customer[]);setPolicy(settings.data);
      setOfflineNotice(`${tr('Offline reopening ready for up to 24 hours','24 घंटे तक ऑफलाइन दोबारा खोलने की तैयारी पूरी','24 ghante tak offline dobara kholne ki taiyari poori')}: ${catalog.data.length} ${posText(language).products}, ${people.data.length} ${posText(language).customers}. ${tr('Bookmark this page. Prepare again after stock changes.','इस पेज को बुकमार्क करें। स्टॉक बदलने के बाद दोबारा तैयार करें।','Is page ko bookmark karein. Stock badalne ke baad dobara taiyar karein.')}`);
    }catch(reason){setOfflineNotice(reason instanceof Error?reason.message:tr("Offline preparation failed.","ऑफलाइन तैयारी पूरी नहीं हुई।","Offline taiyari poori nahi hui."));}
    finally{setPreparingOffline(false);}
  }

  // Keep initial render light, but search the full tenant catalog when local results are not enough.
  useEffect(()=>{
    const text=query.trim();
    if(!org||!online||offlineLoaded||text.length<2){setRemoteProducts([]);setCatalogBusy(false);return;}
    let active=true;
    const timer=window.setTimeout(async()=>{
      setCatalogBusy(true);
      try {
        const result = await listProducts(text, true, 50);
        if(!active)return;
        setRemoteProducts(result.data as unknown as Product[]);
      } catch {
        if(active)setRemoteProducts([]);
      } finally {
        if(active)setCatalogBusy(false);
      }
    },240);
    return()=>{active=false;window.clearTimeout(timer);};
  },[query,org,online,offlineLoaded]);

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
    if(submitting.current)return;
    setSuccess(null);
    setCart(current=>{
      const existing=current.find(item=>item.id===product.id);
      if(existing)return current.map(item=>item.id===product.id?{...item,quantity:Math.min(item.quantity+1,Number(product.stock))}:item);
      if(Number(product.stock)<=0)return current;
      return[...current,{...product,quantity:Math.min(1,Number(product.stock))}];
    });
    setQuery('');setRemoteProducts([]);
  }

  function setQuantity(productId:string,quantity:number){
    if(submitting.current)return;
    setCart(current=>current.map(item=>{
      if(item.id!==productId)return item;
      const next=billingQuantity(quantity,Number(item.stock));
      return next===null?item:{...item,quantity:next};
    }));
  }

  async function scannedBarcode(raw:string){
    if(submitting.current||scanBusy.current)return;
    const code=raw.trim();if(!code)return;
    const generation=draftGeneration.current;
    scanBusy.current=true;setScanNotice(tr('Searching barcode…','बारकोड खोज रहे हैं…','Barcode dhoondh rahe hain…'));setError('');
    try{
      let exact=mergeProducts(products,remoteProducts).find(p=>p.barcode===code||p.sku===code);
      if(!exact&&online&&!offlineLoaded){
        const result=await listProducts(code,true,50);
        exact=(result.data as unknown as Product[]).find(p=>p.barcode===code||p.sku===code);
      }
      if(generation!==draftGeneration.current)return;
      if(exact){
        setProducts(current=>mergeProducts(current,[exact!]));
        if(Number(exact.stock)<=0){setScanNotice(`${exact.name}: ${tr('Out of stock. Update inventory before billing.','स्टॉक खत्म है। बिल बनाने से पहले स्टॉक अपडेट करें।','Stock khatam hai. Bill banane se pehle stock update karein.')}`);return;}
        addProduct(exact);setScanNotice(`${exact.name}: ${tr('Added to bill.','बिल में जोड़ा गया।','Bill mein joda gaya.')}`);return;
      }
      if(!online||offlineLoaded){setScanNotice(tr("Barcode is not in this device’s offline catalog. Connect to add a new product.","बारकोड इस डिवाइस की सूची में नहीं है। नया प्रोडक्ट जोड़ने के लिए इंटरनेट जोड़ें।","Barcode is device ki list mein nahi hai. Naya product jodne ke liye internet jodein."));return;}
      let name='';let source='';
      try{const found=await lookupBarcodeName(code);if(found){name=found.name;source=found.source;}}catch{/* Manual name entry remains available. */}
      if(generation!==draftGeneration.current)return;
      setBarcodeDraft({barcode:code,name,nonce:Date.now()});
      setScanNotice(name?`${tr('Suggested name','सुझाया गया नाम','Sujhaya gaya naam')} (${source}): ${name}. ${tr('Check the name, price, GST and stock in New product.','नया प्रोडक्ट में नाम, कीमत, GST और स्टॉक जाँचें।','Naya product mein naam, price, GST aur stock check karein.')}`:tr("Barcode captured. No online name found; enter the name, price and stock in New product.","बारकोड मिल गया। ऑनलाइन नाम नहीं मिला; नया प्रोडक्ट में नाम, कीमत और स्टॉक भरें।","Barcode mil gaya. Online naam nahi mila; Naya product mein naam, price aur stock bharein."));
    }catch(reason){setError(reason instanceof Error?reason.message:tr("Could not search the shop catalog. Try again before adding a new product.","दुकान की सूची नहीं खोज सके। नया प्रोडक्ट जोड़ने से पहले दोबारा कोशिश करें।","Dukaan ki list nahi khoj sake. Naya product jodne se pehle dobara koshish karein."));}
    finally{scanBusy.current=false;}
  }

  async function handleSearchKeyDown(event:KeyboardEvent<HTMLInputElement>){
    if(event.key!=='Enter')return;
    event.preventDefault();
    const raw=query.trim();
    if(!raw)return;
    if(/^\d{8,14}$/.test(raw)){await scannedBarcode(raw);return;}
    const lowered=raw.toLowerCase();
    const exact=mergeProducts(products,remoteProducts).find(p=>String(p.barcode??'').toLowerCase()===lowered||String(p.sku??'').toLowerCase()===lowered);
    if(exact){addProduct(exact);return;}
    if(filteredProducts.length===1){addProduct(filteredProducts[0]);return;}
    if(!org||!online||offlineLoaded){setError(tr("This product is not in the saved offline catalog.","यह प्रोडक्ट सेव की गई ऑफलाइन सूची में नहीं है।","Yeh product save ki gayi offline list mein nahi hai."));return;}
    setCatalogBusy(true);
    const generation=draftGeneration.current;
    try {
      const result=await listProducts(raw,true,30);
      if(generation!==draftGeneration.current)return;
      const found=(result.data as unknown as Product[]).find(product=>
        String(product.barcode??'').toLowerCase()===lowered||String(product.sku??'').toLowerCase()===lowered
      );
      if(found){setProducts(current=>mergeProducts(current,[found]));addProduct(found);}
    } catch (reason) {
      setError(reason instanceof Error?reason.message:tr("Could not search products.","प्रोडक्ट नहीं खोज सके।","Products nahi khoj sake."));
    } finally {
      setCatalogBusy(false);
    }
  }

  async function createBill(items=cart, fromAssistant=false, printAfterSave=false){
    if(recovery){setError(tr("Restore the saved draft before creating a new bill.","नया बिल बनाने से पहले पिछला अधूरा बिल खोलें।","Naya bill banane se pehle pichhla adhoora bill kholein."));if(fromAssistant)throw new Error(tr("Restore the saved draft first.","पहले अधूरा बिल खोलें।","Pehle adhoora bill kholein."));return;}
    if(!org||items.length===0||submitting.current){if(fromAssistant)throw new Error(tr("Wait for the current bill to finish.","मौजूदा बिल पूरा होने तक रुकें।","Abhi ka bill poora hone tak rukein."));return;}
    submitting.current=true;
    draftGeneration.current++;
    setCreating(true);setError('');setSuccess(null);
    const paid=amountPaid===''?null:Number(amountPaid);
    try {
      if(!workspaceUid.current||getFirebaseAuth().currentUser?.uid!==workspaceUid.current)throw new Error(tr("Your login changed. Reload before billing.","आपका लॉगिन बदल गया। बिल बनाने से पहले पेज दोबारा खोलें।","Aapka login badal gaya. Bill banane se pehle page dobara kholein."));
      const customerName=customerDetails.name.trim();
      const customerPhone=customerDetails.phone.replace(/[\s().-]/g,'');
      if(Boolean(customerName)!==Boolean(customerPhone))throw new Error(tr("Enter both the customer name and mobile number, or leave both blank for Walk-in.","ग्राहक का नाम और मोबाइल नंबर दोनों भरें, या Walk-in के लिए दोनों खाली छोड़ें।","Customer ka naam aur mobile number dono bharein, ya Walk-in ke liye dono khaali chhodein."));
      if(customerPhone&&!/^\+?\d{7,15}$/.test(customerPhone))throw new Error(tr("Check the mobile number: use 7–15 digits.","मोबाइल नंबर जाँचें: 7–15 अंक लिखें।","Mobile number check karein: 7–15 ank likhein."));
      let invoiceCustomerId=customerId||null;
      let invoiceCustomerDetails=customerName?{name:customerName,phone:customerPhone}:undefined;
      if(customerName){
        if(!online||offlineLoaded)throw new Error(tr("Reconnect to save a new customer. Offline bills can use a saved customer or Walk-in.","नया ग्राहक सेव करने के लिए इंटरनेट जोड़ें। ऑफलाइन बिल में सेव ग्राहक या Walk-in चुनें।","Naya customer save karne ke liye internet jodein. Offline bill mein saved customer ya Walk-in chunein."));
        const comparablePhone=(value:string|null)=>String(value??'').replace(/[\s().+-]/g,'');
        let matches=customers.filter(customer=>comparablePhone(customer.phone)===comparablePhone(customerPhone));
        if(matches.length===0){
          const result=await listCustomers(customerPhone,true,100);
          matches=(result.data as unknown as Customer[]).filter(customer=>comparablePhone(customer.phone)===comparablePhone(customerPhone));
        }
        if(matches.length>0){
          setCustomers(current=>[...matches.filter(match=>!current.some(customer=>customer.id===match.id)),...current]);
          if(matches.length>1)throw new Error(tr("Several saved customers use this mobile number. Choose one from the customer list and leave the new details blank.","कई सेव ग्राहकों का मोबाइल नंबर यह है। ग्राहक सूची से सही ग्राहक चुनें और नया विवरण खाली छोड़ें।","Is mobile number par kai saved customers hain. Customer list se sahi customer chunein aur nayi details khaali chhodein."));
          const match=matches[0];
          if(match.name.trim().toLowerCase()!==customerName.toLowerCase()){
            setCustomerId(match.id);setCustomerDetails({name:'',phone:''});
            throw new Error(tr(`This mobile number is already saved as ${match.name}. It has been selected; review the bill and save again.`,`यह मोबाइल नंबर ${match.name} के नाम से सेव है। उसे चुन लिया है; बिल जाँचकर फिर सेव करें।`,`Yeh mobile number ${match.name} ke naam se saved hai. Use select kar liya hai; bill check karke phir save karein.`));
          }
          invoiceCustomerId=match.id;
          invoiceCustomerDetails=undefined;
        }
      }
      const input={
        customerId:invoiceCustomerId,
        customerDetails:invoiceCustomerDetails,
        items:items.map(item=>({productId:item.id,quantity:item.quantity,expectedPrice:Number(item.selling_price),expectedTax:Number(item.tax_rate),expectedInclusive:Boolean(item.tax_inclusive)})),
        discountType:effectiveType,
        discountValue:effectiveDiscount,
        paymentMethod,
        amountPaid:paid
      };
      const fingerprint=JSON.stringify(input);
      if(pendingInvoice.current?.fingerprint!==fingerprint)pendingInvoice.current={fingerprint,id:crypto.randomUUID()};
      if(!recoveryStorageKey.current)throw new Error(tr("Device recovery is not ready. Please reload and sign in again.","डिवाइस रिकवरी तैयार नहीं है। पेज दोबारा खोलकर साइन इन करें।","Device recovery taiyar nahi hai. Page dobara kholkar sign in karein."));
      saveRecovery(recoveryStorageKey.current,{...snapshot(),cart:items,pendingInvoice:pendingInvoice.current});
      const offlineKey=recoveryStorageKey.current;
      if(!navigator.onLine||offlineLoaded){
        if(!isSubscriptionUsable(org.subscriptionStatus,org.endsAt))throw new Error(tr("Subscription expired. Reconnect to verify access.","सब्सक्रिप्शन खत्म हो गया। एक्सेस जाँचने के लिए इंटरनेट जोड़ें।","Subscription khatam ho gaya. Access check karne ke liye internet jodein."));
        const uid=getFirebaseAuth().currentUser?.uid;
        if(offlineLoaded&&(!uid||!readOfflineWorkspace(uid,portal)))throw new Error(tr("Offline access expired. Connect and reload before another sale.","ऑफलाइन एक्सेस खत्म हो गया। अगली बिक्री से पहले इंटरनेट जोड़कर पेज दोबारा खोलें।","Offline access khatam ho gaya. Agli sale se pehle internet jodkar page dobara kholein."));
        if(!['CASH','CREDIT'].includes(paymentMethod))throw new Error(tr("Offline saving supports cash or credit only. Online payments need a connection.","ऑफलाइन केवल नकद या उधार सेव कर सकते हैं। ऑनलाइन भुगतान के लिए इंटरनेट चाहिए।","Offline sirf cash ya udhaar save kar sakte hain. Online payment ke liye internet chahiye."));
        if(items.some(item=>item.quantity>Number(item.stock)))throw new Error(tr("Insufficient cached stock.","सेव की गई सूची में पर्याप्त स्टॉक नहीं है।","Save ki gayi list mein kaafi stock nahi hai."));
        await queueBill({key:offlineKey,id:pendingInvoice.current.id,createdAt:Date.now(),lines:items.map(item=>({name:item.name,quantity:item.quantity})),input:{...input,clientInvoiceId:pendingInvoice.current.id,items:items.map(item=>({productId:item.id,quantity:item.quantity,expectedPrice:Number(item.selling_price),expectedTax:Number(item.tax_rate),expectedInclusive:item.tax_inclusive}))}},Object.fromEntries(items.map(item=>[item.id,Number(item.stock)])));
        clearRecovery(offlineKey);pendingInvoice.current=null;setCart([]);setCustomerId('');setCustomerDetails({name:'',phone:''});setDiscountValue('0');setAmountPaid('');
        setError(tr("Bill is safe on this device. Confirmation is pending; sync when internet returns.","बिल इस डिवाइस पर सुरक्षित है। अभी पुष्टि बाकी है; इंटरनेट आने पर सिंक करें।","Bill is device par surakshit hai. Abhi confirmation baaki hai; internet aane par sync karein."));
        return;
      }
      if(printAfterSave&&printTarget==='sc03'){await connectSc03Printer();setPrinterNotice('');}
      if((await pendingBills(offlineKey)).length)throw new Error(tr("Sync pending device bills before creating an online bill so stock stays correct.","स्टॉक सही रखने के लिए ऑनलाइन बिल बनाने से पहले डिवाइस के बाकी बिल सिंक करें।","Stock sahi rakhne ke liye online bill banane se pehle device ke baaki bills sync karein."));
      const uid=getFirebaseAuth().currentUser?.uid;if(uid)clearOfflineWorkspace(uid);
      const response=await createInvoice({...input,clientInvoiceId:pendingInvoice.current.id});
      try{clearRecovery(recoveryStorageKey.current);}catch{setStorageError(tr("Bill saved, but the local recovery copy could not be cleared. Retry will use the same invoice ID.","बिल सेव हो गया, लेकिन डिवाइस की रिकवरी कॉपी नहीं हट सकी। दोबारा कोशिश में वही बिल आईडी उपयोग होगी।","Bill save ho gaya, lekin device ki recovery copy nahi hat saki. Dobara koshish mein wahi bill ID use hogi."));}
      pendingInvoice.current=null;
      const result=response.data;
      setSuccess({id:result.invoice_id,invoiceNumber:result.invoice_number,total:Number(result.grand_total??estimated.total)});
      setCart([]);setCustomerId('');setCustomerDetails({name:'',phone:''});setDiscountValue('0');setAmountPaid('');
      try {
        const refreshed=await listProducts('',true,250);
        setProducts(refreshed.data as unknown as Product[]);
      } catch { setError(tr("Bill saved successfully. Refresh the catalog before creating another bill.","बिल सेव हो गया। अगला बिल बनाने से पहले प्रोडक्ट सूची रिफ्रेश करें।","Bill save ho gaya. Agla bill banane se pehle product list refresh karein.")); }
      if (printAfterSave) {
        // Invoice already exists; a cancelled or failed print must never create another sale.
        let printQuery='autoprint=1';
        if(printTarget==='sc03'){
          try{printQuery=`autoprint=sc03&print_token=${encodeURIComponent(queueSc03Print(result.invoice_id))}`;}
          catch{setError(tr("Bill saved. Automatic print could not be prepared. Open View Receipt and tap Print SC03 once.","बिल सेव हो गया। अपने आप प्रिंट नहीं हो सका। रसीद देखें खोलकर SC03 प्रिंट एक बार दबाएँ।","Bill save ho gaya. Auto print nahi ho saka. Receipt dekhein kholkar Print SC03 ek baar dabayein."));return;}
        }
        router.push(`${portal==='owner'?'/owner':'/staff'}/invoice?id=${encodeURIComponent(result.invoice_id)}&${printQuery}`);
      }
    } catch (reason) {
      setError(reason instanceof Error?reason.message:tr("Bill could not be created. Please check stock/network and retry.","बिल नहीं बन सका। स्टॉक और इंटरनेट जाँचकर दोबारा कोशिश करें।","Bill nahi ban saka. Stock aur internet check karke dobara koshish karein."));
      if(fromAssistant)throw reason;
    } finally {
      setCreating(false);
      submitting.current=false;
    }
  }

  if(!org)return error?<main className="card"><p className="form-error" role="alert">{error}</p><button className="btn" onClick={()=>window.location.reload()}>Retry</button></main>:<WorkspaceLoader/>;
  const Shell=portal==='owner'?OwnerShell:StaffShell;
  const base=portal==='owner'?'/owner':'/staff';
  const t=posText(org.preferredLanguage);
  const searchStatus=org.preferredLanguage==='hi'?'पूरे कैटलॉग में खोज रहे हैं…':org.preferredLanguage==='hinglish'?'Poore catalog mein search ho raha hai…':'Searching the full catalog…';

  return <Shell businessName={org.organizationName} language={org.preferredLanguage}>
    <fieldset disabled={creating} style={{border:0,padding:0,margin:0,minWidth:0}}><div className={simpleMode?'simple-billing-mode':''}>
    <div className="simple-mode-switch"><button type="button" className="btn" aria-pressed={simpleMode} onClick={()=>setSimpleMode(value=>!value)}>{simpleMode?tr('Simple mode: on — switch to Standard','आसान मोड चालू — सामान्य मोड खोलें','Aasaan mode chalu — Standard mode kholein'):tr('Use Simple mode','आसान मोड खोलें','Aasaan mode kholein')}</button></div>
    {simpleMode&&<SimpleBillingGuide hindi={org.preferredLanguage!=='en'} offline={!online||offlineLoaded} review={[
      ...cart.map(item=>`${item.name}: ${item.quantity} ${item.unit}`),
      `${tr('Estimated total','अनुमानित कुल','Andazee total')}: ${formatINR(estimated.total)}`,
      `${t.customer}: ${customerDetails.name.trim()||customers.find(c=>c.id===customerId)?.name||t.walkInCustomer}`,
      `${t.payment}: ${paymentMethod}`,
      `${tr('Amount received','मिली रकम','Mili rakam')}: ${amountPaid|| (paymentMethod==='CREDIT'?'0':formatINR(estimated.total))}`
    ].join('. ')}/>}
    <section className="card offline-preparation"><h2>{online?tr('Prepare offline billing','ऑफलाइन बिलिंग तैयार करें','Offline billing taiyar karein'):tr('You are offline','इंटरनेट बंद है','Internet band hai')}</h2>{online&&!offlineLoaded&&<button className="btn" disabled={preparingOffline||creating} onClick={prepareOffline}>{preparingOffline?tr('Preparing…','तैयार हो रहा है…','Taiyar ho raha hai…'):tr('Prepare this device','इस डिवाइस पर तैयार करें','Is device par taiyar karein')}</button>}{offlineLoaded&&online&&<button className="btn" onClick={()=>window.location.reload()}>{tr('Internet is back — reload','इंटरनेट वापस आया — पेज दोबारा खोलें','Internet wapas aaya — reload karein')}</button>}{offlineNotice&&<p role="status">{offlineNotice}</p>}{!online&&<p>{tr('Cash/credit bills stay pending on this device. AI and new products need internet.','नकद/उधार बिल इसी डिवाइस पर बाकी रहते हैं। AI और नए प्रोडक्ट के लिए इंटरनेट चाहिए।','Cash/udhaar bills isi device par pending rehte hain. AI aur naye products ke liye internet chahiye.')}</p>}</section>
    <PendingOfflineBill organizationId={org.organizationId} onSynced={()=>{const uid=getFirebaseAuth().currentUser?.uid;if(uid)clearOfflineWorkspace(uid);setError(tr("Bill synced. Reload the catalog before the next sale.","बिल सिंक हो गया। अगली बिक्री से पहले प्रोडक्ट सूची रिफ्रेश करें।","Bill sync ho gaya. Agli sale se pehle product list refresh karein."));void listProducts('',true,250).then(result=>setProducts(result.data as unknown as Product[])).catch(()=>setError(tr("Bill synced, but catalog refresh failed. Reload before another sale.","बिल सिंक हो गया, लेकिन सूची रिफ्रेश नहीं हुई। अगली बिक्री से पहले पेज दोबारा खोलें।","Bill sync ho gaya, lekin list refresh nahi hui. Agli sale se pehle page dobara kholein.")));}} />
    {storageError&&<p className="form-error" role="alert">{storageError}</p>}
    {recovery&&<section className="card"><h2>{tr('Saved draft found','पिछला अधूरा बिल मिला','Pichhla adhoora bill mila')}</h2><p>{recovery.cart.length>0&&`${recovery.cart.length} ${t.items} · `}{new Date(recovery.savedAt).toLocaleString(language==='hi'?'hi-IN':'en-IN')}. {tr('This is a recovery copy, not proof of a completed invoice. Restore it to safely retry.','यह रिकवरी कॉपी है, पूरे हुए बिल की पुष्टि नहीं। सुरक्षित दोबारा कोशिश के लिए इसे खोलें।','Yeh recovery copy hai, poore hue bill ki pushti nahi. Surakshit dobara koshish ke liye ise kholein.')}</p><button className="btn btn-primary" onClick={restoreDraft}>{tr('Restore draft','अधूरा बिल खोलें','Adhoora bill kholein')}</button></section>}
    {recoveryReady&&cart.length>0&&!storageError&&<p role="status">{tr('Draft saved on this device. The bill is final only after server confirmation.','अधूरा बिल इस डिवाइस पर सुरक्षित है। सर्वर की पुष्टि के बाद ही बिल पूरा होगा।','Adhoora bill is device par surakshit hai. Server ki pushti ke baad hi bill poora hoga.')}</p>}
    {online&&!offlineLoaded&&<BillingQuickAdd barcodeDraft={barcodeDraft} onBatchSaved={async()=>{const result=await listProducts('',true,250);setProducts(result.data as unknown as Product[]);}} hindi={org.preferredLanguage!=='en'} disabled={creating} onCustomer={customer=>{setCustomers(current=>[customer,...current]);setCustomerId(customer.id);}} onProduct={product=>{setProducts(current=>mergeProducts(current,[product]));if(renderedGeneration===draftGeneration.current)addProduct(product);else setScanNotice(tr('Product saved. Select it for the current bill.','प्रोडक्ट सेव हो गया। मौजूदा बिल के लिए इसे चुनें।','Product save ho gaya. Abhi ke bill ke liye ise chunein.'));}}/>}
    {online&&!offlineLoaded&&<PosAssist mode="bill" getBillReview={(draft,hindi)=>voiceBillReview(mergeVoiceBill(cart,draft),{customer:customerDetails.name.trim()||customers.find(c=>c.id===customerId)?.name||(hindi?'बिना नाम के ग्राहक':'Walk-in'),customerId,payment:paymentMethod,paid:amountPaid,discountType:effectiveType,discount:effectiveDiscount},hindi)} confirmLabel={tr('Confirm & save bill','पुष्टि करके बिल सेव करें','Confirm karke bill save karein')} reviewContext={`${tr('Adds to current cart','मौजूदा बिल में जुड़ेंगे','Abhi ke bill mein judenge')} (${cart.length}). ${t.customer}: ${customerDetails.name.trim()||customers.find(c=>c.id===customerId)?.name||t.walkInCustomer}. ${t.payment}: ${paymentMethod}. ${t.amountPaid}: ${amountPaid||(paymentMethod==='CREDIT'?'0':tr('Full amount','पूरी रकम','Poori rakam'))}. ${t.discount}: ${effectiveDiscount}${effectiveType==='PERCENT'?'%':' INR'}. ${tr('Change these below before confirming.','पुष्टि से पहले नीचे इन्हें बदल सकते हैं।','Confirm karne se pehle neeche inhein badal sakte hain.')}`} onConfirm={async draft=>{
      const next=mergeVoiceBill(cart,draft);
      await createBill(next,true);
    }} onDraft={draft=>{
      if(creating)throw new Error(tr("Wait for the current bill to finish saving.","मौजूदा बिल सेव होने तक रुकें।","Abhi ka bill save hone tak rukein."));
      const next=mergeVoiceBill(cart,draft);
      setCart(next);
      setSuccess(null);setError('');
    }}/>}
    <div className="content-head pos-page-head"><div><span className="page-kicker">{portal==='staff'?t.counterKickerStaff:t.counterKickerOwner}</span><h1>{portal==='staff'?t.counterStaffTitle:t.counterOwnerTitle}</h1><p>{t.counterSub}</p></div><div className="counter-shortcut" aria-hidden="true">↵ <span>{t.searchFocused}</span></div></div>
    {error&&<div className="form-error" role="alert">{error}</div>}
    {success&&<div className="bill-success" role="status"><div><span>{t.billCreated}</span><h2>{success.invoiceNumber}</h2><p>{formatINR(success.total)} · {t.stockUpdated}</p></div><div className="hero-actions" style={{marginTop:0}}>{success.id&&<button className="btn btn-primary" onClick={()=>router.push(`${base}/invoice?id=${success.id}`)}>{tr('View receipt','रसीद देखें','Receipt dekhein')}</button>}<button className="btn" onClick={()=>setSuccess(null)}>{t.newBill}</button></div></div>}
    <section className="card billing-customer-panel" aria-labelledby="billing-customer-title">
      <div className="billing-step-heading"><span className="billing-step-index">01</span><div><h2 id="billing-customer-title">{tr('Customer details','ग्राहक का विवरण','Customer details')}</h2><p>{tr('Optional — choose a saved customer or enter a new name and mobile number.','वैकल्पिक — सेव ग्राहक चुनें या नया नाम और मोबाइल नंबर भरें।','Optional — saved customer chunein ya naya naam aur mobile number bharein.')}</p></div></div>
      <div className="billing-customer-layout">
        <div className="field"><label htmlFor="billing-customer-select">{t.customer}</label><select id="billing-customer-select" className="select" value={customerId} onChange={event=>{setCustomerId(event.target.value);if(event.target.value)setCustomerDetails({name:'',phone:''});}}><option value="">{t.walkInCustomer}</option>{customers.map(customer=><option key={customer.id} value={customer.id}>{customer.name}{customer.phone?` · ${customer.phone}`:''}</option>)}</select></div>
        <CheckoutCustomer value={customerDetails} onChange={updateCustomerDetails} disabled={creating} offline={!online||offlineLoaded}/>
      </div>
    </section>
    <div className="billing-grid premium-counter">
      <section className="card billing-products"><div className="billing-step-heading billing-products-heading"><span className="billing-step-index">02</span><div><h2>{tr('Add products','प्रोडक्ट जोड़ें','Product jodein')}</h2><p>{tr('Search, scan a barcode, or tap an item to add it.','खोजें, बारकोड स्कैन करें या आइटम जोड़ने के लिए टैप करें।','Search karein, barcode scan karein, ya item jodne ke liye tap karein.')}</p></div></div><div className="billing-scanner-area"><CameraBarcodeScanner hindi={org.preferredLanguage!=='en'} disabled={creating} onScan={scannedBarcode}/>{scanNotice&&<p role="status">{scanNotice}</p>}</div><div className="billing-search"><span className="search-mark" aria-hidden="true">⌕</span><input autoFocus={!simpleMode} aria-label={t.scanSearch} autoComplete="off" className="input" placeholder={t.scanSearch} value={query} onChange={e=>setQuery(e.target.value)} onKeyDown={handleSearchKeyDown}/></div>{catalogBusy&&<div className="catalog-search-state" role="status">{searchStatus}</div>}<div className="product-picker">{filteredProducts.map(product=><button type="button" key={product.id} className="product-pick" disabled={creating||Number(product.stock)<=0} onClick={()=>addProduct(product)}><span><strong>{product.name}</strong><small>{product.sku||product.barcode||`${Number(product.tax_rate)}% GST`}</small></span><span className="product-pick-right"><strong>{formatINR(product.selling_price)}</strong><small className={Number(product.stock)<=5?'stock-low':''}>{Number(product.stock)} {product.unit}</small></span></button>)}{filteredProducts.length===0&&!catalogBusy&&<div className="empty-state">{t.noMatchingProducts}</div>}</div></section>
      <section className="card bill-cart"><div className="bill-cart-head"><div><span className="page-kicker">{t.currentBill}</span><h2>{cart.length} {cart.length===1?t.item:t.items}</h2></div><button type="button" className="text-danger" onClick={()=>{draftGeneration.current++;setCart([]);}}>{t.clear}</button></div><div className="cart-list">{cart.length===0?<div className="empty-state bill-empty"><span className="empty-receipt" aria-hidden="true">▤</span><strong>{t.startProduct}</strong><br/>{t.searchTapAdd}</div>:cart.map(item=><div className="cart-row" key={item.id}><div><strong>{item.name}</strong><small>{formatINR(item.selling_price)} · {Number(item.tax_rate)}% GST</small></div><div className="qty-control" aria-label={`${item.name}: ${t.quantity}`}><button type="button" aria-label={`${tr('Reduce quantity','मात्रा घटाएँ','Matra ghatayein')}: ${item.name}`} onClick={()=>setQuantity(item.id,item.quantity-1)}>-</button><QuantityInput name={item.name} value={item.quantity} stock={Number(item.stock)} onCommit={quantity=>setQuantity(item.id,quantity)}/><button type="button" aria-label={`${tr('Increase quantity','मात्रा बढ़ाएँ','Matra badhayein')}: ${item.name}`} onClick={()=>setQuantity(item.id,item.quantity+1)}>+</button></div><strong>{formatINR(Number(item.selling_price)*item.quantity)}</strong><button type="button" aria-label={`${t.remove}: ${item.name}`} className="cart-remove" onClick={()=>setCart(c=>c.filter(x=>x.id!==item.id))}>×</button></div>)}</div>
        <div className="bill-options">
          {portal==='owner'?<div className="discount-row"><div className="field"><label>{t.discount}</label><select className="select" value={discountType} onChange={e=>setDiscountType(e.target.value as 'PERCENT'|'FLAT')}><option value="PERCENT">{t.percentage}</option><option value="FLAT">{t.flat}</option></select></div><div className="field"><label>{t.value}</label><input className="input" type="number" min="0" step="0.01" value={discountValue} onChange={e=>setDiscountValue(e.target.value)}/></div></div>:policy.allowStaffDiscount?<div className="field"><label>{t.discount} % <span className="muted">({t.ownerDiscountLimit} {policy.staffDiscountLimit}%)</span></label><input className="input" type="number" min="0" max={policy.staffDiscountLimit} step="0.5" value={discountValue} onChange={e=>setDiscountValue(e.target.value)}/></div>:<div className="staff-policy-note">{t.discountOwnerOnly}</div>}
          <div className="payment-methods" aria-label={t.paymentMethod}>{['CASH','UPI','CARD','CREDIT'].map(method=><button type="button" aria-pressed={paymentMethod===method} className={paymentMethod===method?'active':''} key={method} onClick={()=>setPaymentMethod(method)}>{method==='CASH'?tr('Cash','नकद','Cash'):method==='CREDIT'?tr('Credit','उधार','Udhaar'):method==='CARD'?tr('Card','कार्ड','Card'):method}</button>)}</div>
          <div className="field"><label>{t.amountPaid} <span className="muted">({t.amountPaidHint})</span></label><input className="input" type="number" inputMode="decimal" min="0" step="0.01" placeholder={paymentMethod==='CREDIT'?'0':estimated.total.toFixed(2)} value={amountPaid} onChange={e=>setAmountPaid(e.target.value)}/></div>
        </div>
        <div className="bill-totals"><div><span>{t.taxable}</span><strong>{formatINR(estimated.base)}</strong></div><div><span>{t.discount}</span><strong>- {formatINR(estimated.discount)}</strong></div><div><span>GST</span><strong>{formatINR(estimated.tax)}</strong></div><div className="bill-grand"><span>{t.total}</span><strong>{formatINR(estimated.total)}</strong></div></div>
        <div className="field"><label htmlFor="billing-printer">{tr('Print to','प्रिंटर चुनें','Printer chunein')}</label><select id="billing-printer" className="select" value={printTarget} onChange={e=>setPrintTarget(e.target.value as 'sc03'|'system')}><option value="sc03">{tr('SC03h Bluetooth mini printer','SC03h ब्लूटूथ मिनी प्रिंटर','SC03h Bluetooth mini printer')}</option><option value="system">{tr('System printer / PDF','सिस्टम प्रिंटर / PDF','System printer / PDF')}</option></select></div>
        {printerNotice&&<p role="status">{printerNotice}</p>}
        <div className="billing-print-guide"><span className="billing-print-guide-mark" aria-hidden="true">i</span><p><strong>{tr('Quick print guide','प्रिंट करने का तरीका','Print karne ka tareeka')}</strong><br/>{tr('Choose SC03 for direct Bluetooth printing or System/PDF for the browser dialog. Save & Print stores the bill first; if printing is interrupted, reopen the receipt instead of creating the bill again.','सीधे Bluetooth प्रिंट के लिए SC03 या ब्राउज़र डायलॉग के लिए System/PDF चुनें। Save & Print पहले बिल सेव करता है; प्रिंट रुकने पर नया बिल बनाने के बजाय रसीद फिर खोलें।','Direct Bluetooth print ke liye SC03 ya browser dialog ke liye System/PDF chunein. Save & Print pehle bill save karta hai; print ruk jaaye to naya bill banane ke bajay receipt dobara kholein.')}</p></div>
        <div className="billing-save-actions">
          <button type="button" className="btn" style={{width:'100%'}} disabled={creating||cart.length===0} onClick={()=>void createBill(cart,false,false)}>{creating?t.creatingBill:(tr('Save only','केवल सेव करें','Sirf save karein'))}</button>
          <button type="button" className="btn btn-primary" style={{width:'100%'}} disabled={creating||cart.length===0||!online||offlineLoaded} onClick={()=>void createBill(cart,false,true)}>{creating?t.creatingBill:(tr('Save & print','सेव और प्रिंट करें','Save aur print karein'))}</button>
        </div>
        {(!online||offlineLoaded)&&<p className="billing-note">{tr('Web printing needs an online invoice. Save only keeps eligible offline bills queued safely.','वेब प्रिंटिंग के लिए ऑनलाइन बिल चाहिए। केवल सेव करें से योग्य ऑफलाइन बिल सुरक्षित बाकी रहते हैं।','Web printing ke liye online bill chahiye. Sirf save karein se eligible offline bills surakshit pending rehte hain.')}</p>}
      </section>
    </div>
    </div></fieldset>
  </Shell>;
}
