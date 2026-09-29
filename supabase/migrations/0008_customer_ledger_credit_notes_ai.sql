-- BRANDSPIRE POS PHASE 8
-- Customer ledger, paid-invoice credit notes/refunds, and controlled AI usage tracking.

alter table public.invoices
  add column if not exists credited_amount numeric(14,2) not null default 0 check (credited_amount >= 0);

alter table public.payments
  add column if not exists payment_kind text not null default 'COLLECTION'
  check (payment_kind in ('COLLECTION','REFUND'));

create table if not exists public.credit_note_counters (
  organization_id uuid not null references public.organizations(id) on delete cascade,
  note_year integer not null,
  next_number bigint not null default 1 check (next_number > 0),
  updated_at timestamptz not null default now(),
  primary key (organization_id, note_year)
);

create table if not exists public.credit_notes (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  invoice_id uuid not null references public.invoices(id) on delete restrict,
  customer_id uuid references public.customers(id) on delete set null,
  credit_note_number text not null,
  reason text not null,
  status text not null default 'ISSUED' check (status in ('ISSUED','VOID')),
  refund_method text not null check (refund_method in ('CASH','UPI','CARD','OTHER')),
  taxable_amount numeric(14,2) not null default 0,
  cgst numeric(14,2) not null default 0,
  sgst numeric(14,2) not null default 0,
  igst numeric(14,2) not null default 0,
  total_amount numeric(14,2) not null check (total_amount > 0),
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  unique (organization_id, credit_note_number)
);

create table if not exists public.credit_note_items (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  credit_note_id uuid not null references public.credit_notes(id) on delete cascade,
  invoice_item_id uuid not null references public.invoice_items(id) on delete restrict,
  product_id uuid references public.products(id) on delete set null,
  product_name_snapshot text not null,
  quantity numeric(16,3) not null check (quantity > 0),
  unit_credit numeric(14,2) not null check (unit_credit >= 0),
  taxable_amount numeric(14,2) not null default 0,
  cgst numeric(14,2) not null default 0,
  sgst numeric(14,2) not null default 0,
  igst numeric(14,2) not null default 0,
  line_total numeric(14,2) not null check (line_total > 0),
  created_at timestamptz not null default now()
);

create table if not exists public.ai_usage_events (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  feature text not null,
  provider text,
  model text,
  input_chars integer not null default 0,
  success boolean not null default true,
  error_code text,
  created_at timestamptz not null default now()
);

create index if not exists credit_notes_org_created_idx on public.credit_notes(organization_id, created_at desc);
create index if not exists credit_notes_invoice_idx on public.credit_notes(organization_id, invoice_id, created_at desc);
create index if not exists credit_notes_customer_idx on public.credit_notes(organization_id, customer_id, created_at desc);
create index if not exists credit_note_items_invoice_item_idx on public.credit_note_items(invoice_item_id);
create index if not exists ai_usage_org_created_idx on public.ai_usage_events(organization_id, created_at desc);

alter table public.credit_note_counters enable row level security;
alter table public.credit_notes enable row level security;
alter table public.credit_note_items enable row level security;
alter table public.ai_usage_events enable row level security;

-- Credit notes are Owner-controlled. Staff does not receive refund/return access.
drop policy if exists credit_notes_owner_read on public.credit_notes;
create policy credit_notes_owner_read on public.credit_notes for select to authenticated
using (public.has_org_role(organization_id, 'OWNER'));

drop policy if exists credit_note_items_owner_read on public.credit_note_items;
create policy credit_note_items_owner_read on public.credit_note_items for select to authenticated
using (public.has_org_role(organization_id, 'OWNER'));

drop policy if exists ai_usage_owner_read on public.ai_usage_events;
create policy ai_usage_owner_read on public.ai_usage_events for select to authenticated
using (public.has_org_role(organization_id, 'OWNER'));

-- Owner customer ledger. This is a receivables-style ledger:
-- Invoice increases balance, collection reduces it, credit note reduces it,
-- refund payout offsets the credit note so a completed refund returns balance to zero.
create or replace function public.get_customer_ledger(
  p_organization_id uuid,
  p_customer_id uuid
)
returns table(
  event_time timestamptz,
  event_type text,
  reference text,
  description text,
  debit numeric,
  credit numeric,
  running_balance numeric
)
language sql
security definer
set search_path = public
as $$
  with authorized as (
    select 1
    where auth.uid() is not null
      and public.has_org_role(p_organization_id, 'OWNER')
  ),
  events as (
    select i.created_at as event_time,
           'INVOICE'::text as event_type,
           i.invoice_number::text as reference,
           ('Invoice ' || i.invoice_number)::text as description,
           i.grand_total::numeric as debit,
           0::numeric as credit,
           10 as sort_order,
           i.id as entity_id
      from public.invoices i, authorized
     where i.organization_id = p_organization_id
       and i.customer_id = p_customer_id
       and i.status not in ('CANCELLED')

    union all

    select p.created_at,
           case when p.payment_kind = 'REFUND' then 'REFUND' else 'PAYMENT' end,
           i.invoice_number,
           case when p.payment_kind = 'REFUND'
                then ('Refund via ' || p.method)
                else ('Payment via ' || p.method)
           end,
           case when p.payment_kind = 'REFUND' then p.amount else 0 end,
           case when p.payment_kind = 'COLLECTION' then p.amount else 0 end,
           20,
           p.id
      from public.payments p
      join public.invoices i on i.id = p.invoice_id and i.organization_id = p.organization_id
      join authorized on true
     where p.organization_id = p_organization_id
       and i.customer_id = p_customer_id
       and p.status in ('CAPTURED','REFUNDED')

    union all

    select c.created_at,
           'CREDIT_NOTE',
           c.credit_note_number,
           ('Credit note for ' || i.invoice_number),
           0,
           c.total_amount,
           30,
           c.id
      from public.credit_notes c
      join public.invoices i on i.id = c.invoice_id and i.organization_id = c.organization_id
      join authorized on true
     where c.organization_id = p_organization_id
       and c.customer_id = p_customer_id
       and c.status = 'ISSUED'
  ),
  ordered as (
    select *,
      sum(debit - credit) over (
        order by event_time asc, sort_order asc, entity_id asc
        rows between unbounded preceding and current row
      ) as balance
    from events
  )
  select event_time, event_type, reference, description,
         round(debit,2), round(credit,2), round(balance,2)
  from ordered
  order by event_time desc, sort_order desc, entity_id desc;
$$;

revoke all on function public.get_customer_ledger(uuid, uuid) from public;
grant execute on function public.get_customer_ledger(uuid, uuid) to authenticated;

-- Issue a partial/full credit note against a fully-paid invoice and refund it.
-- p_items example: [{"invoice_item_id":"uuid","quantity":1}]
create or replace function public.issue_invoice_credit_note(
  p_organization_id uuid,
  p_invoice_id uuid,
  p_reason text,
  p_refund_method text,
  p_items jsonb
)
returns table(
  credit_note_id uuid,
  credit_note_number text,
  total_amount numeric,
  invoice_status text
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_invoice public.invoices%rowtype;
  v_reason text := nullif(trim(coalesce(p_reason,'')), '');
  v_year integer := extract(year from now())::integer;
  v_next bigint;
  v_number text;
  v_note_id uuid;
  v_item jsonb;
  v_invoice_item public.invoice_items%rowtype;
  v_requested_qty numeric;
  v_already_returned numeric;
  v_remaining_qty numeric;
  v_ratio numeric;
  v_line_total numeric;
  v_taxable numeric;
  v_cgst numeric;
  v_sgst numeric;
  v_igst numeric;
  v_total numeric := 0;
  v_total_taxable numeric := 0;
  v_total_cgst numeric := 0;
  v_total_sgst numeric := 0;
  v_total_igst numeric := 0;
  v_stock_after numeric;
  v_new_credited numeric;
  v_new_status text;
begin
  if v_user_id is null then raise exception 'Authentication required'; end if;
  if not public.has_org_role(p_organization_id, 'OWNER') then raise exception 'Owner access required'; end if;
  if not public.can_use_brandspire_pos(p_organization_id) then raise exception 'Brandspire POS subscription is not active'; end if;
  if v_reason is null or length(v_reason) < 3 then raise exception 'Return/refund reason is required'; end if;
  if p_refund_method not in ('CASH','UPI','CARD','OTHER') then raise exception 'Refund method must be CASH, UPI, CARD or OTHER'; end if;
  if p_items is null or jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then raise exception 'Select at least one item to return'; end if;

  select * into v_invoice
    from public.invoices
   where id = p_invoice_id and organization_id = p_organization_id
   for update;
  if not found then raise exception 'Invoice not found'; end if;
  if v_invoice.status in ('CANCELLED','REFUNDED') then raise exception 'This invoice cannot be returned'; end if;
  if coalesce(v_invoice.amount_due,0) > 0 then raise exception 'Settle the invoice due before issuing a refund/credit note'; end if;
  if coalesce(v_invoice.amount_paid,0) <= 0 then raise exception 'This invoice has no captured payment to refund'; end if;

  insert into public.credit_note_counters(organization_id,note_year,next_number)
  values (p_organization_id,v_year,2)
  on conflict (organization_id,note_year)
  do update set next_number = public.credit_note_counters.next_number + 1, updated_at = now()
  returning next_number - 1 into v_next;

  v_number := 'BSP-CN-' || v_year || '-' || lpad(v_next::text,6,'0');

  insert into public.credit_notes(
    organization_id,invoice_id,customer_id,credit_note_number,reason,refund_method,
    taxable_amount,cgst,sgst,igst,total_amount,created_by
  ) values (
    p_organization_id,p_invoice_id,v_invoice.customer_id,v_number,v_reason,p_refund_method,
    0,0,0,0,0.01,v_user_id
  ) returning id into v_note_id;

  for v_item in select * from jsonb_array_elements(p_items)
  loop
    begin
      v_requested_qty := (v_item->>'quantity')::numeric;
    exception when others then
      raise exception 'Invalid return quantity';
    end;
    if v_requested_qty is null or v_requested_qty <= 0 then raise exception 'Return quantity must be greater than zero'; end if;

    select * into v_invoice_item
      from public.invoice_items
     where id = (v_item->>'invoice_item_id')::uuid
       and invoice_id = p_invoice_id
       and organization_id = p_organization_id;
    if not found then raise exception 'Invoice item not found'; end if;

    select coalesce(sum(cni.quantity),0) into v_already_returned
      from public.credit_note_items cni
      join public.credit_notes cn on cn.id = cni.credit_note_id
     where cni.invoice_item_id = v_invoice_item.id
       and cn.status = 'ISSUED';

    v_remaining_qty := v_invoice_item.quantity - v_already_returned;
    if v_requested_qty > v_remaining_qty then
      raise exception 'Return quantity for % exceeds remaining returnable quantity %', v_invoice_item.product_name_snapshot, v_remaining_qty;
    end if;

    v_ratio := v_requested_qty / v_invoice_item.quantity;
    v_line_total := round(v_invoice_item.line_total * v_ratio, 2);
    v_taxable := round(v_invoice_item.taxable_amount * v_ratio, 2);
    v_cgst := round(v_invoice_item.cgst * v_ratio, 2);
    v_sgst := round(v_invoice_item.sgst * v_ratio, 2);
    v_igst := round(v_invoice_item.igst * v_ratio, 2);

    insert into public.credit_note_items(
      organization_id,credit_note_id,invoice_item_id,product_id,product_name_snapshot,
      quantity,unit_credit,taxable_amount,cgst,sgst,igst,line_total
    ) values (
      p_organization_id,v_note_id,v_invoice_item.id,v_invoice_item.product_id,v_invoice_item.product_name_snapshot,
      v_requested_qty,round(v_line_total/v_requested_qty,2),v_taxable,v_cgst,v_sgst,v_igst,v_line_total
    );

    if v_invoice_item.product_id is not null then
      update public.products
         set stock = stock + v_requested_qty, updated_at = now()
       where id = v_invoice_item.product_id and organization_id = p_organization_id
       returning stock into v_stock_after;

      if found then
        insert into public.inventory_movements(
          organization_id,product_id,invoice_id,movement_type,quantity_change,stock_after,actor_user_id,note
        ) values (
          p_organization_id,v_invoice_item.product_id,p_invoice_id,'RETURN',v_requested_qty,v_stock_after,v_user_id,
          'Credit note ' || v_number || ': ' || v_reason
        );
      end if;
    end if;

    v_total := v_total + v_line_total;
    v_total_taxable := v_total_taxable + v_taxable;
    v_total_cgst := v_total_cgst + v_cgst;
    v_total_sgst := v_total_sgst + v_sgst;
    v_total_igst := v_total_igst + v_igst;
  end loop;

  if v_total <= 0 then raise exception 'Refund total must be greater than zero'; end if;
  if v_total > (v_invoice.amount_paid - coalesce(v_invoice.credited_amount,0)) + 0.01 then
    raise exception 'Refund exceeds the remaining refundable paid amount';
  end if;

  update public.credit_notes
     set taxable_amount = round(v_total_taxable,2),
         cgst = round(v_total_cgst,2),
         sgst = round(v_total_sgst,2),
         igst = round(v_total_igst,2),
         total_amount = round(v_total,2)
   where id = v_note_id;

  insert into public.payments(
    organization_id,invoice_id,amount,method,status,created_by,note,payment_kind
  ) values (
    p_organization_id,p_invoice_id,round(v_total,2),p_refund_method,'REFUNDED',v_user_id,
    'Refund for credit note ' || v_number || ': ' || v_reason,'REFUND'
  );

  v_new_credited := round(coalesce(v_invoice.credited_amount,0) + v_total,2);
  v_new_status := case when v_new_credited + 0.01 >= v_invoice.grand_total then 'REFUNDED' else v_invoice.status end;

  update public.invoices
     set credited_amount = v_new_credited,
         status = v_new_status,
         payment_status = case when v_new_status = 'REFUNDED' then 'REFUNDED' else payment_status end,
         updated_at = now()
   where id = p_invoice_id;

  insert into public.audit_logs(
    organization_id,actor_user_id,actor_role,action,entity_type,entity_id,summary
  ) values (
    p_organization_id,v_user_id,'OWNER','CREDIT_NOTE_ISSUED','CREDIT_NOTE',v_note_id,
    jsonb_build_object('invoice_id',p_invoice_id,'invoice_number',v_invoice.invoice_number,'credit_note_number',v_number,'amount',round(v_total,2),'refund_method',p_refund_method,'reason',v_reason)
  );

  return query select v_note_id,v_number,round(v_total,2),v_new_status;
end;
$$;

revoke all on function public.issue_invoice_credit_note(uuid, uuid, text, text, jsonb) from public;
grant execute on function public.issue_invoice_credit_note(uuid, uuid, text, text, jsonb) to authenticated;
