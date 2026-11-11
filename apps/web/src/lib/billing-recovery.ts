const observed = new Map<string,string|null>();
export type BillingRecovery = {
  version: 1; savedAt: number; cart: unknown[]; customerId: string;
  discountType: 'PERCENT' | 'FLAT'; discountValue: string;
  paymentMethod: string; amountPaid: string;
  pendingInvoice: {fingerprint:string;id:string} | null;
};
export function recoveryKey(uid:string, organizationId:string) {
  return `brandspire.billing.recovery.v1:${encodeURIComponent(uid)}:${encodeURIComponent(organizationId)}`;
}
export function readRecovery(key:string): BillingRecovery | null {
  const raw=localStorage.getItem(key);
  observed.set(key,raw);
  if(!raw)return null;
  const value=JSON.parse(raw);
  if(value.version!==1 || !Array.isArray(value.cart) || value.cart.length>1000)throw new Error('Saved draft could not be read.');
  if(!value.cart.every((p:Record<string,unknown>)=>typeof p.id==='string' && typeof p.name==='string' && Number.isFinite(p.quantity) && Number(p.quantity)>0))throw new Error('Saved draft has invalid items.');
  return value as BillingRecovery;
}
export function saveRecovery(key:string, value:BillingRecovery) {
  // Storage failure must be visible; never claim a durable save on quota/private-mode failure.
  const current=localStorage.getItem(key);
  if(current !== (observed.get(key)??null))throw new Error('This draft changed in another tab. Reload before continuing.');
  const serialized=JSON.stringify(value);
  localStorage.setItem(key,serialized);observed.set(key,serialized);
}
export function clearRecovery(key:string) {
  if(localStorage.getItem(key)!==(observed.get(key)??null))throw new Error('Draft changed in another tab.');
  localStorage.removeItem(key);observed.set(key,null);
}
