import { BadGatewayException, BadRequestException, Injectable } from '@nestjs/common';
import { z } from 'zod';
import { SupabaseService } from '../common/supabase.service';

const querySchema = z.object({ query: z.string().trim().min(2).max(500) });

type Snapshot = {
  periodDays: number;
  sales: { total:number; bills:number; due:number };
  topProducts: Array<{ name:string; quantity:number; sales:number }>;
  lowStock: Array<{ name:string; stock:number; threshold:number }>;
  outstandingCustomers: Array<{ name:string; amount:number }>;
};

@Injectable()
export class BusinessInsightsService {
  constructor(private readonly supabase: SupabaseService) {}

  private async snapshot(organizationId:string):Promise<Snapshot>{
    const since=new Date(Date.now()-30*24*60*60*1000).toISOString();
    const [invoiceRes, productRes, customerRes, itemRes] = await Promise.all([
      this.supabase.admin.from('invoices').select('id,grand_total,amount_due,status,created_at').eq('organization_id',organizationId).gte('created_at',since).not('status','in','(CANCELLED,REFUNDED)').limit(3000),
      this.supabase.admin.from('products').select('id,name,stock,low_stock_threshold').eq('organization_id',organizationId).is('deleted_at',null).eq('active',true).limit(500),
      this.supabase.admin.from('customers').select('name,outstanding_balance').eq('organization_id',organizationId).gt('outstanding_balance',0).is('deleted_at',null).order('outstanding_balance',{ascending:false}).limit(15),
      this.supabase.admin.from('invoice_items').select('product_name_snapshot,quantity,line_total,invoices!inner(created_at,status)').eq('organization_id',organizationId).gte('invoices.created_at',since).not('invoices.status','in','(CANCELLED,REFUNDED)').limit(5000)
    ]);
    const firstError=invoiceRes.error??productRes.error??customerRes.error??itemRes.error;if(firstError)throw new BadRequestException(firstError.message);
    const invoices=(invoiceRes.data??[]) as Array<{grand_total:number;amount_due:number}>;
    const totals=invoices.reduce((a,i)=>({total:a.total+Number(i.grand_total||0),due:a.due+Number(i.amount_due||0)}),{total:0,due:0});
    const productMap=new Map<string,{name:string;quantity:number;sales:number}>();
    for(const row of (itemRes.data??[]) as unknown as Array<{product_name_snapshot:string;quantity:number;line_total:number}>){const key=row.product_name_snapshot;const current=productMap.get(key)??{name:key,quantity:0,sales:0};current.quantity+=Number(row.quantity||0);current.sales+=Number(row.line_total||0);productMap.set(key,current);}
    const topProducts=[...productMap.values()].sort((a,b)=>b.sales-a.sales).slice(0,10).map(x=>({...x,quantity:Number(x.quantity.toFixed(3)),sales:Number(x.sales.toFixed(2))}));
    const lowStock=((productRes.data??[]) as Array<{name:string;stock:number;low_stock_threshold:number}>).filter(p=>Number(p.stock)<=Number(p.low_stock_threshold)).sort((a,b)=>Number(a.stock)-Number(b.stock)).slice(0,15).map(p=>({name:p.name,stock:Number(p.stock),threshold:Number(p.low_stock_threshold)}));
    const outstandingCustomers=((customerRes.data??[]) as Array<{name:string;outstanding_balance:number}>).map(c=>({name:c.name,amount:Number(c.outstanding_balance)}));
    return {periodDays:30,sales:{total:Number(totals.total.toFixed(2)),bills:invoices.length,due:Number(totals.due.toFixed(2))},topProducts,lowStock,outstandingCustomers};
  }

  async ask(organizationId:string,userId:string,input:unknown){
    const parsed=querySchema.safeParse(input);if(!parsed.success)throw new BadRequestException(parsed.error.issues[0]?.message??'Invalid question');
    const provider=(process.env.AI_PROVIDER??'').trim();
    const key=(process.env.AI_PROVIDER_KEY??'').trim();
    const baseUrl=(process.env.AI_PROVIDER_BASE_URL??'https://api.openai.com/v1').replace(/\/$/,'');
    const model=(process.env.AI_PROVIDER_MODEL??'').trim();
    if(!provider||!key||!model){return {configured:false,answer:null,message:'Online AI provider is not configured. Offline Brandspire Assist remains available.'};}
    if(provider!=='openai-compatible')throw new BadRequestException('Unsupported AI_PROVIDER. Use openai-compatible for Phase 8.');

    const data=await this.snapshot(organizationId);
    const system=[
      'You are Brandspire POS Business Insights for an Indian SMB owner.',
      'Answer only from the supplied controlled business snapshot. Never claim direct database access.',
      'If the snapshot does not support the answer, say that clearly.',
      'Be concise, practical, and do not provide tax/legal/accounting advice.',
      'Respond in the same language/style as the owner question when possible.',
      'Amounts are INR.'
    ].join(' ');
    const body={model,messages:[{role:'system',content:system},{role:'user',content:`Question: ${parsed.data.query}\n\nControlled 30-day snapshot:\n${JSON.stringify(data)}`}],temperature:0.2,max_tokens:500};
    let success=true;let errorCode:string|null=null;
    try{
      const response=await fetch(`${baseUrl}/chat/completions`,{method:'POST',headers:{'Content-Type':'application/json',Authorization:`Bearer ${key}`},body:JSON.stringify(body),signal:AbortSignal.timeout(20000)});
      if(!response.ok){success=false;errorCode=`HTTP_${response.status}`;throw new BadGatewayException('AI provider request failed');}
      const json=await response.json() as {choices?:Array<{message?:{content?:string}}>};
      const answer=json.choices?.[0]?.message?.content?.trim();if(!answer){success=false;errorCode='EMPTY_RESPONSE';throw new BadGatewayException('AI provider returned an empty response');}
      await this.supabase.admin.from('ai_usage_events').insert({organization_id:organizationId,user_id:userId,feature:'BUSINESS_INSIGHTS',provider,model,input_chars:parsed.data.query.length,success:true});
      return {configured:true,answer,snapshotPeriodDays:data.periodDays};
    }catch(error){
      await this.supabase.admin.from('ai_usage_events').insert({organization_id:organizationId,user_id:userId,feature:'BUSINESS_INSIGHTS',provider,model,input_chars:parsed.data.query.length,success:false,error_code:errorCode??'PROVIDER_ERROR'});
      if(error instanceof BadGatewayException)throw error;throw new BadGatewayException(error instanceof Error?error.message:'AI provider request failed');
    }
  }
}
