// Keep weighed goods fractional; reject invalid input rather than silently charging for 1 unit.
export function billingQuantity(value:number, stock:number):number|null {
  if(!Number.isFinite(value)||!Number.isFinite(stock)||value<=0||stock<=0)return null;
  return Math.min(value,stock);
}
