'use client';

import { FormEvent, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import OwnerShell from '@/components/pos/OwnerShell';
import WorkspaceLoader from '@/components/pos/WorkspaceLoader';
import { getCurrentOrganization, type CurrentOrganization } from '@/lib/pos';
import { getSupabaseBrowserClient } from '@/lib/supabase';
import { posText, type PosLanguage } from '@/lib/pos-i18n';

type Settings = {
  invoice_prefix: string;
  default_print_format: 'THERMAL_58MM' | 'THERMAL_80MM' | 'A4';
  default_payment_method: 'CASH' | 'UPI' | 'CARD' | 'CREDIT' | 'OTHER';
  negative_stock_enabled: boolean;
  allow_staff_discount: boolean;
  staff_discount_limit: number;
  receipt_header: string;
  receipt_footer: string;
  invoice_footer: string;
  show_gstin_on_receipt: boolean;
  print_copies: number;
};

type Business = {
  name: string;
  phone: string;
  email: string;
  gstin: string;
  address: string;
  city: string;
  state: string;
  pincode: string;
  preferred_language: PosLanguage;
};

const defaultSettings: Settings = {
  invoice_prefix: 'BSP',
  default_print_format: 'THERMAL_58MM',
  default_payment_method: 'CASH',
  negative_stock_enabled: false,
  allow_staff_discount: false,
  staff_discount_limit: 0,
  receipt_header: '',
  receipt_footer: 'Thank you for your business!',
  invoice_footer: 'Thank you for choosing us.',
  show_gstin_on_receipt: true,
  print_copies: 1
};

const emptyBusiness: Business = {
  name: '', phone: '', email: '', gstin: '', address: '', city: '', state: '', pincode: '', preferred_language: 'en'
};

const text = (value: unknown) => typeof value === 'string' ? value : '';

export default function OwnerSettingsPage() {
  const router = useRouter();
  const [org, setOrg] = useState<CurrentOrganization | null>(null);
  const [business, setBusiness] = useState<Business>(emptyBusiness);
  const [settings, setSettings] = useState<Settings>(defaultSettings);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  useEffect(() => {
    async function load() {
      try {
        const current = await getCurrentOrganization();
        if (!current) return router.replace('/auth/login');
        if (current.role !== 'OWNER') return router.replace('/staff');
        setOrg(current);

        const supabase = getSupabaseBrowserClient();
        const [orgResult, settingsResult] = await Promise.all([
          supabase.from('organizations')
            .select('name,phone,email,gstin,address,city,state,pincode,preferred_language')
            .eq('id', current.organizationId)
            .single(),
          supabase.from('organization_settings')
            .select('invoice_prefix,default_print_format,default_payment_method,negative_stock_enabled,allow_staff_discount,staff_discount_limit,receipt_header,receipt_footer,invoice_footer,show_gstin_on_receipt,print_copies')
            .eq('organization_id', current.organizationId)
            .single()
        ]);

        if (orgResult.error) throw orgResult.error;
        if (settingsResult.error) throw settingsResult.error;

        const o = orgResult.data;
        setBusiness({
          name: text(o?.name),
          phone: text(o?.phone),
          email: text(o?.email),
          gstin: text(o?.gstin),
          address: text(o?.address),
          city: text(o?.city),
          state: text(o?.state),
          pincode: text(o?.pincode),
          preferred_language: ((o?.preferred_language ?? 'en') as PosLanguage)
        });

        const s = settingsResult.data;
        setSettings({
          invoice_prefix: text(s?.invoice_prefix) || defaultSettings.invoice_prefix,
          default_print_format: (s?.default_print_format ?? defaultSettings.default_print_format) as Settings['default_print_format'],
          default_payment_method: (s?.default_payment_method ?? defaultSettings.default_payment_method) as Settings['default_payment_method'],
          negative_stock_enabled: s?.negative_stock_enabled ?? defaultSettings.negative_stock_enabled,
          allow_staff_discount: s?.allow_staff_discount ?? defaultSettings.allow_staff_discount,
          staff_discount_limit: Number(s?.staff_discount_limit ?? defaultSettings.staff_discount_limit),
          receipt_header: text(s?.receipt_header),
          receipt_footer: text(s?.receipt_footer) || defaultSettings.receipt_footer,
          invoice_footer: text(s?.invoice_footer) || defaultSettings.invoice_footer,
          show_gstin_on_receipt: s?.show_gstin_on_receipt ?? defaultSettings.show_gstin_on_receipt,
          print_copies: Number(s?.print_copies ?? defaultSettings.print_copies)
        });
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Could not load settings.');
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [router]);

  async function save(event: FormEvent) {
    event.preventDefault();
    if (!org) return;
    setSaving(true); setError(''); setSuccess('');

    try {
      const supabase = getSupabaseBrowserClient();
      const [orgResult, settingsResult] = await Promise.all([
        supabase.from('organizations').update({
          name: text(business.name).trim(),
          phone: text(business.phone).trim() || null,
          email: text(business.email).trim() || null,
          gstin: text(business.gstin).trim().toUpperCase() || null,
          address: text(business.address).trim() || null,
          city: text(business.city).trim() || null,
          state: text(business.state).trim() || null,
          pincode: text(business.pincode).trim() || null,
          preferred_language: business.preferred_language
        }).eq('id', org.organizationId),
        supabase.from('organization_settings').update({
          ...settings,
          invoice_prefix: text(settings.invoice_prefix).trim().toUpperCase() || 'BSP',
          receipt_header: text(settings.receipt_header),
          receipt_footer: text(settings.receipt_footer),
          invoice_footer: text(settings.invoice_footer),
          staff_discount_limit: Number(settings.staff_discount_limit || 0),
          print_copies: Number(settings.print_copies || 1)
        }).eq('organization_id', org.organizationId)
      ]);

      if (orgResult.error) throw orgResult.error;
      if (settingsResult.error) throw settingsResult.error;
      setSuccess(posText(business.preferred_language).settingsSaved);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save settings.');
    } finally {
      setSaving(false);
    }
  }

  if (loading || !org) return <WorkspaceLoader />;

  const t = posText(business.preferred_language || org.preferredLanguage);

  return <OwnerShell businessName={org.organizationName} language={org.preferredLanguage}>
    <div className="content-head pos-page-head"><div><span className="page-kicker">{t.settingsKicker}</span><h1>{t.settingsTitle}</h1><p>{t.settingsSub}</p></div></div>
    {error && <div className="form-error">{error}</div>}{success && <div className="form-success">{success}</div>}
    <form onSubmit={save} className="settings-stack">
      <section className="card settings-card"><div className="settings-section-head"><span className="section-icon">01</span><div><h2>{t.businessProfile}</h2><p>{t.businessProfileSub}</p></div></div><div className="settings-grid-3"><div className="field span-2"><label>{t.businessName}</label><input className="input" required value={business.name} onChange={(e)=>setBusiness({...business,name:e.target.value})}/></div><div className="field"><label>GSTIN</label><input className="input" value={business.gstin} onChange={(e)=>setBusiness({...business,gstin:e.target.value.toUpperCase()})}/></div><div className="field"><label>{t.phone}</label><input className="input" value={business.phone} onChange={(e)=>setBusiness({...business,phone:e.target.value})}/></div><div className="field span-2"><label>{t.email}</label><input className="input" type="email" value={business.email} onChange={(e)=>setBusiness({...business,email:e.target.value})}/></div><div className="field span-3"><label>{t.address}</label><input className="input" value={business.address} onChange={(e)=>setBusiness({...business,address:e.target.value})}/></div><div className="field"><label>{t.city}</label><input className="input" value={business.city} onChange={(e)=>setBusiness({...business,city:e.target.value})}/></div><div className="field"><label>{t.state}</label><input className="input" value={business.state} onChange={(e)=>setBusiness({...business,state:e.target.value})}/></div><div className="field"><label>{t.pincode}</label><input className="input" maxLength={6} value={business.pincode} onChange={(e)=>setBusiness({...business,pincode:e.target.value.replace(/\D/g,'')})}/></div></div></section>
      <section className="card settings-card"><div className="settings-section-head"><span className="section-icon">02</span><div><h2>{t.languageBilling}</h2><p>{t.languageBillingSub}</p></div></div><div className="settings-grid-3"><div className="field"><label>{t.language}</label><select className="select" value={business.preferred_language} onChange={(e)=>setBusiness({...business,preferred_language:e.target.value as PosLanguage})}><option value="en">English</option><option value="hinglish">Hinglish</option><option value="hi">हिंदी</option></select></div><div className="field"><label>{t.invoicePrefix}</label><input className="input" maxLength={8} value={settings.invoice_prefix} onChange={(e)=>setSettings({...settings,invoice_prefix:e.target.value})}/></div><div className="field"><label>{t.defaultPayment}</label><select className="select" value={settings.default_payment_method} onChange={(e)=>setSettings({...settings,default_payment_method:e.target.value as Settings['default_payment_method']})}><option>CASH</option><option>UPI</option><option>CARD</option><option>CREDIT</option><option>OTHER</option></select></div></div></section>
      <section className="card settings-card"><div className="settings-section-head"><span className="section-icon">03</span><div><h2>{t.printerReceipt}</h2><p>{t.printerReceiptSub}</p></div></div><div className="printer-choice-grid">{([['THERMAL_58MM','2-inch',t.thermalReceipt58],['THERMAL_80MM','3-inch',t.thermalReceipt80],['A4','A4',t.fullPageGstInvoice]] as const).map(([value,title,desc])=><button type="button" key={value} className={`printer-choice ${settings.default_print_format===value?'active':''}`} onClick={()=>setSettings({...settings,default_print_format:value})}><span className={`paper-demo ${value.toLowerCase()}`}/><strong>{title}</strong><small>{desc}</small></button>)}</div><div className="settings-grid-3 top-gap"><div className="field"><label>{t.printCopies}</label><select className="select" value={settings.print_copies} onChange={(e)=>setSettings({...settings,print_copies:Number(e.target.value)})}>{[1,2,3].map(n=><option key={n} value={n}>{n}</option>)}</select></div><label className="switch-field"><input type="checkbox" checked={settings.show_gstin_on_receipt} onChange={(e)=>setSettings({...settings,show_gstin_on_receipt:e.target.checked})}/><span className="switch-ui"/><span><strong>{t.showGstinReceipt}</strong><small>{t.recommendedGst}</small></span></label><label className="switch-field"><input type="checkbox" checked={settings.negative_stock_enabled} onChange={(e)=>setSettings({...settings,negative_stock_enabled:e.target.checked})}/><span className="switch-ui"/><span><strong>{t.allowNegativeStock}</strong><small>{t.saferInventory}</small></span></label></div><div className="settings-grid-2 top-gap"><div className="field"><label>{t.receiptHeader}</label><input className="input" value={settings.receipt_header} onChange={(e)=>setSettings({...settings,receipt_header:e.target.value})} placeholder="Optional message above receipt"/></div><div className="field"><label>{t.receiptFooter}</label><input className="input" value={settings.receipt_footer} onChange={(e)=>setSettings({...settings,receipt_footer:e.target.value})} placeholder="Thank you for your business!"/></div></div></section>
      <section className="card settings-card"><div className="settings-section-head"><span className="section-icon">04</span><div><h2>{t.staffBillingPolicy}</h2><p>{t.staffBillingPolicySub}</p></div></div><div className="policy-row"><label className="switch-field"><input type="checkbox" checked={settings.allow_staff_discount} onChange={(e)=>setSettings({...settings,allow_staff_discount:e.target.checked})}/><span className="switch-ui"/><span><strong>{t.allowStaffDiscount}</strong><small>{t.backendPolicy}</small></span></label><div className="field policy-limit"><label>{t.maximumPercent}</label><input className="input" type="number" min="0" max="100" step="0.5" disabled={!settings.allow_staff_discount} value={settings.staff_discount_limit} onChange={(e)=>setSettings({...settings,staff_discount_limit:Number(e.target.value)})}/></div></div></section>
      <div className="settings-savebar"><div><strong>{t.readySave}</strong><span>{t.changesBusinessOnly}</span></div><button className="btn btn-primary" disabled={saving}>{saving?t.saving:t.saveSettings}</button></div>
    </form>
  </OwnerShell>;
}
