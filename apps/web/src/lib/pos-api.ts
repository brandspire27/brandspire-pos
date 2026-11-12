import { authenticatedApiRequest } from '@/lib/firebase';
import { getFirebaseAuth } from '@/lib/firebase';
import { getCurrentOrganization } from '@/lib/pos';

type PosResponse<T> = { success: true; data: T };

export function listProducts(query = '', activeOnly = false, limit = 500) {
  const params = new URLSearchParams({ q: query, active: String(activeOnly), limit: String(limit) });
  return authenticatedApiRequest<PosResponse<Record<string, unknown>[]>>(`/pos/products?${params}`);
}

export async function addProduct(input: Record<string, unknown>) {
  if(input.id)return authenticatedApiRequest<PosResponse<{id:string}>>('/pos/products',{method:'POST',body:JSON.stringify(input)});
  const workspace=await getCurrentOrganization();
  const uid=getFirebaseAuth().currentUser?.uid;
  if(!workspace||!uid)throw new Error('Sign in before adding a product.');
  const canonical=JSON.stringify(Object.fromEntries(Object.entries(input).sort(([a],[b])=>a.localeCompare(b))));
  const digest=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(canonical));
  const fingerprint=Array.from(new Uint8Array(digest),b=>b.toString(16).padStart(2,'0')).join('');
  const key=`brandspire.product-request:${uid}:${workspace.organizationId}:${fingerprint}`;
  const send=async()=>{
    let id:string;
    try{id=localStorage.getItem(key)||crypto.randomUUID();localStorage.setItem(key,id);}
    catch{throw new Error('Cannot save a safe product retry ID on this device. Check device storage before adding a product.');}
    const result=await authenticatedApiRequest<PosResponse<{id:string}>>('/pos/products',{method:'POST',body:JSON.stringify({...input,id})});
    try{localStorage.removeItem(key);}catch{/* Retain ID: another attempt safely returns the existing product. */}
    return result;
  };
  return navigator.locks ? navigator.locks.request(key,send) : send();
}

export function removeProduct(id: string) {
  return authenticatedApiRequest(`/pos/products/${encodeURIComponent(id)}`, { method: 'DELETE' });
}

export function listCustomers(query = '', activeOnly = false, limit = 500) {
  const params = new URLSearchParams({ q: query, active: String(activeOnly), limit: String(limit) });
  return authenticatedApiRequest<PosResponse<Record<string, unknown>[]>>(`/pos/customers?${params}`);
}

export function addCustomer(input: Record<string, unknown>) {
  return authenticatedApiRequest<PosResponse<{ id: string }>>('/pos/customers', { method: 'POST', body: JSON.stringify(input) });
}

export function removeCustomer(id: string) {
  return authenticatedApiRequest(`/pos/customers/${encodeURIComponent(id)}`, { method: 'DELETE' });
}

export function getBillingPolicy() {
  return authenticatedApiRequest<PosResponse<{ allowStaffDiscount: boolean; staffDiscountLimit: number; defaultPayment: string }>>('/pos/billing-policy');
}

export function getOrganizationSettings() {
  return authenticatedApiRequest<PosResponse<Record<string, unknown>>>('/pos/settings');
}

export function updateOrganizationSettings(input: Record<string, unknown>) {
  return authenticatedApiRequest<PosResponse<Record<string, unknown>>>('/pos/settings', {
    method: 'PUT', body: JSON.stringify(input)
  });
}

export function listInvoices(options: { due?: boolean; query?: string; limit?: number } = {}) {
  const params = new URLSearchParams({
    due: String(options.due ?? false),
    q: options.query ?? '',
    limit: String(options.limit ?? 200)
  });
  return authenticatedApiRequest<PosResponse<Record<string, unknown>[]>>(`/pos/invoices?${params}`);
}

export function createInvoice(input: Record<string, unknown>) {
  return authenticatedApiRequest<PosResponse<{ invoice_id: string; invoice_number: string; grand_total: number }>>(
    '/pos/invoices', { method: 'POST', body: JSON.stringify(input) }
  );
}

export function getInvoiceDetail(id: string) {
  return authenticatedApiRequest<PosResponse<{
    invoice: Record<string, unknown>;
    items: Record<string, unknown>[];
    payments: Record<string, unknown>[];
    organization: Record<string, unknown>;
    settings: Record<string, unknown>;
  }>>(`/pos/invoices/${encodeURIComponent(id)}`);
}

export function collectInvoicePayment(id: string, input: { amount: number; method: string; note?: string }) {
  return authenticatedApiRequest<PosResponse<{ amountDue: number }>>(`/pos/invoices/${encodeURIComponent(id)}/payments`, {
    method: 'POST', body: JSON.stringify(input)
  });
}

export function cancelInvoice(id: string, reason: string) {
  return authenticatedApiRequest(`/pos/invoices/${encodeURIComponent(id)}/cancel`, {
    method: 'POST', body: JSON.stringify({ reason })
  });
}

export function adjustInventory(id: string, quantityChange: number, note?: string) {
  return authenticatedApiRequest(`/pos/products/${encodeURIComponent(id)}/adjust-stock`, {
    method: 'POST', body: JSON.stringify({ quantityChange, note })
  });
}

export function listInventoryMovements() {
  return authenticatedApiRequest<PosResponse<Record<string, unknown>[]>>('/pos/inventory/movements');
}

export function getCustomerLedger(id: string) {
  return authenticatedApiRequest<PosResponse<{ customer: Record<string, unknown>; events: Record<string, unknown>[] }>>(
    `/pos/customers/${encodeURIComponent(id)}/ledger`
  );
}

export function getOwnerReport(from: string, to: string, gst = false) {
  const params = new URLSearchParams({ from, to });
  return authenticatedApiRequest<PosResponse<Record<string, unknown>>>(`/pos/reports/${gst ? 'gst-summary' : 'summary'}?${params}`);
}

export function getOwnerDashboard(todayStart: string) {
  return authenticatedApiRequest<PosResponse<{
    todaySales: number; todayBills: number; lowStock: number; outstanding: number;
    recentInvoices: DashboardInvoice[];
  }>>(`/pos/dashboard?${new URLSearchParams({ todayStart })}`);
}

type DashboardInvoice = { id: string; invoice_number: string; grand_total: number; payment_status: string; created_at: string };

export function listReturnInvoices() {
  return authenticatedApiRequest<PosResponse<Record<string, unknown>[]>>('/pos/returns/invoices');
}

export function listReturnItems(invoiceId: string) {
  return authenticatedApiRequest<PosResponse<Record<string, unknown>[]>>(`/pos/returns/invoices/${encodeURIComponent(invoiceId)}/items`);
}

export function issueCreditNote(invoiceId: string, input: Record<string, unknown>) {
  return authenticatedApiRequest<PosResponse<{ credit_note_number: string; total_amount: number }>>(
    `/pos/invoices/${encodeURIComponent(invoiceId)}/credit-notes`, { method: 'POST', body: JSON.stringify(input) }
  );
}
