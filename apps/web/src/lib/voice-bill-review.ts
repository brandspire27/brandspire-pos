export type ReviewProduct={id:string;name:string;selling_price:number;tax_rate:number;tax_inclusive:boolean;stock:number;unit:string};
export type ReviewLine=ReviewProduct&{quantity:number};
export function mergeVoiceBill<T extends ReviewLine>(cart:T[],value:Record<string,unknown>):T[]{
  if(!Array.isArray(value.items)||!value.items.length)throw new Error('No bill items were understood. Please speak again.');
  const next=cart.map(item=>({...item}));
  for(const item of value.items as {product:T;quantity:number}[]){
    const product=item?.product;
    if(!product?.id||!product.name||!Number.isFinite(item.quantity)||item.quantity<=0)throw new Error('Product or quantity is incomplete. Please speak again.');
    const index=next.findIndex(row=>row.id===product.id);
    const quantity=item.quantity+(index<0?0:next[index].quantity);
    const row={...product,quantity};if(index<0)next.push(row);else next[index]=row;
  }
  for(const row of next){
    if(!Number.isFinite(Number(row.stock))||row.quantity>Number(row.stock))throw new Error(`Insufficient stock for ${row.name}.`);
    if(!Number.isFinite(Number(row.selling_price))||Number(row.selling_price)<0||!Number.isFinite(Number(row.tax_rate))||Number(row.tax_rate)<0||Number(row.tax_rate)>100)throw new Error(`Invalid price or tax for ${row.name}.`);
  }
  return next;
}
export function voiceBillReview(lines:ReviewLine[],context:{customer:string;customerId:string;payment:string;paid:string;discountType:string;discount:number},hindi:boolean){
  if(!Number.isFinite(context.discount)||context.discount<0)throw new Error('Enter a valid discount before saving.');
  let base=0,tax=0;
  for(const row of lines){const gross=Number(row.selling_price)*row.quantity,rate=Number(row.tax_rate)/100;const taxable=row.tax_inclusive&&rate>0?gross/(1+rate):gross;base+=taxable;tax+=row.tax_inclusive?gross-taxable:taxable*rate;}
  const discount=context.discountType==='PERCENT'?base*Math.min(context.discount,100)/100:Math.min(base,context.discount);
  const total=Math.round((base-discount+tax*(base>0?(base-discount)/base:1))*100)/100;
  const paid=context.paid===''?(context.payment==='CREDIT'?0:total):Number(context.paid);
  if(!Number.isFinite(paid)||paid<0||paid>total)throw new Error('Amount paid must be between zero and the bill total.');
  const due=Math.round((total-paid)*100)/100;
  const payment=hindi?({CASH:'नकद',CREDIT:'उधार',UPI:'यू पी आई',CARD:'कार्ड'}[context.payment]??context.payment):context.payment;
  const details=lines.map(row=>`${row.name}, ${row.quantity} ${row.unit}, ${hindi?'प्रति यूनिट':'per unit'} ${Number(row.selling_price).toFixed(2)} ${hindi?'रुपये':'rupees'}`).join('. ');
  const text=hindi?`${details}. ग्राहक ${context.customer}. छूट ${discount.toFixed(2)} रुपये. टैक्स सहित कुल ${total.toFixed(2)} रुपये. भुगतान ${payment}. जमा ${paid.toFixed(2)} रुपये. बाकी ${due.toFixed(2)} रुपये.`:`${details}. Customer ${context.customer}. Discount ${discount.toFixed(2)} rupees. Total including tax ${total.toFixed(2)} rupees. Payment ${payment}. Paid ${paid.toFixed(2)} rupees. Due ${due.toFixed(2)} rupees.`;
  return {text,signature:JSON.stringify({lines,context,total}),total};
}
