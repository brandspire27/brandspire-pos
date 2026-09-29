-- BRANDSPIRE POS PHASE 6
-- Owner due collection, safe invoice cancellation, payment history and GST reporting.

alter table public.payments
  add column if not exists note text;

alter table public.invoices
  add column if not exists cancellation_reason text,
  add column if not exists cancelled_by uuid references auth.users(id) on delete set null;

create index if not exists payments_org_created_idx
  on public.payments(organization_id, created_at desc);
create index if not exists invoices_org_due_idx
  on public.invoices(organization_id, amount_due, created_at desc)
  where amount_due > 0 and status not in ('CANCELLED', 'REFUNDED');

-- Owner-only collection of later/partial payments against an existing invoice.
create or replace function public.collect_invoice_payment(
  p_organization_id uuid,
  p_invoice_id uuid,
  p_amount numeric,
  p_method text,
  p_note text default null
)
returns table(
  invoice_id uuid,
  invoice_number text,
  amount_paid numeric,
  amount_due numeric,
  payment_status text
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_invoice public.invoices%rowtype;
  v_new_paid numeric;
  v_new_due numeric;
  v_payment_status text;
  v_invoice_status text;
begin
  if v_user_id is null then
    raise exception 'Authentication required';
  end if;

  if not public.has_org_role(p_organization_id, 'OWNER') then
    raise exception 'Owner access required';
  end if;

  if not public.can_use_brandspire_pos(p_organization_id) then
    raise exception 'Brandspire POS subscription is not active';
  end if;

  if p_method not in ('CASH','UPI','CARD','OTHER') then
    raise exception 'Payment method must be CASH, UPI, CARD or OTHER';
  end if;

  if p_amount is null or p_amount <= 0 then
    raise exception 'Payment amount must be greater than zero';
  end if;

  select * into v_invoice
  from public.invoices
  where id = p_invoice_id
    and organization_id = p_organization_id
  for update;

  if not found then
    raise exception 'Invoice not found';
  end if;

  if v_invoice.status in ('CANCELLED','REFUNDED') then
    raise exception 'Payment cannot be recorded against a cancelled/refunded invoice';
  end if;

  if coalesce(v_invoice.amount_due, 0) <= 0 then
    raise exception 'This invoice has no outstanding amount';
  end if;

  if p_amount > v_invoice.amount_due then
    raise exception 'Payment cannot exceed invoice due amount of %', v_invoice.amount_due;
  end if;

  v_new_paid := round(v_invoice.amount_paid + p_amount, 2);
  v_new_due := round(greatest(v_invoice.grand_total - v_new_paid, 0), 2);
  v_payment_status := case when v_new_due = 0 then 'PAID' else 'PARTIALLY_PAID' end;
  v_invoice_status := case when v_new_due = 0 then 'PAID' else 'PARTIALLY_PAID' end;

  insert into public.payments(
    organization_id,
    invoice_id,
    amount,
    method,
    status,
    created_by,
    note
  ) values (
    p_organization_id,
    p_invoice_id,
    round(p_amount, 2),
    p_method,
    'CAPTURED',
    v_user_id,
    nullif(trim(coalesce(p_note, '')), '')
  );

  update public.invoices
  set amount_paid = v_new_paid,
      amount_due = v_new_due,
      payment_status = v_payment_status,
      status = v_invoice_status,
      updated_at = now()
  where id = p_invoice_id;

  if v_invoice.customer_id is not null then
    update public.customers
    set outstanding_balance = greatest(outstanding_balance - p_amount, 0),
        updated_at = now()
    where id = v_invoice.customer_id
      and organization_id = p_organization_id;
  end if;

  insert into public.audit_logs(
    organization_id,
    actor_user_id,
    actor_role,
    action,
    entity_type,
    entity_id,
    summary
  ) values (
    p_organization_id,
    v_user_id,
    'OWNER',
    'INVOICE_PAYMENT_COLLECTED',
    'INVOICE',
    p_invoice_id,
    jsonb_build_object(
      'invoice_number', v_invoice.invoice_number,
      'amount', round(p_amount, 2),
      'method', p_method,
      'amount_due_before', v_invoice.amount_due,
      'amount_due_after', v_new_due,
      'note', p_note
    )
  );

  return query
  select p_invoice_id, v_invoice.invoice_number, v_new_paid, v_new_due, v_payment_status;
end;
$$;

revoke all on function public.collect_invoice_payment(uuid, uuid, numeric, text, text) from public;
grant execute on function public.collect_invoice_payment(uuid, uuid, numeric, text, text) to authenticated;

-- Owner-only cancellation for invoices that have no captured payment.
-- Paid/partially-paid invoices intentionally require a future refund/credit-note workflow.
create or replace function public.cancel_pos_invoice(
  p_organization_id uuid,
  p_invoice_id uuid,
  p_reason text
)
returns table(invoice_id uuid, invoice_number text, status text)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_invoice public.invoices%rowtype;
  v_item record;
  v_stock_after numeric;
  v_reason text := nullif(trim(coalesce(p_reason, '')), '');
begin
  if v_user_id is null then
    raise exception 'Authentication required';
  end if;

  if not public.has_org_role(p_organization_id, 'OWNER') then
    raise exception 'Owner access required';
  end if;

  if v_reason is null or length(v_reason) < 3 then
    raise exception 'Cancellation reason is required';
  end if;

  select * into v_invoice
  from public.invoices
  where id = p_invoice_id
    and organization_id = p_organization_id
  for update;

  if not found then
    raise exception 'Invoice not found';
  end if;

  if v_invoice.status = 'CANCELLED' then
    return query select v_invoice.id, v_invoice.invoice_number, v_invoice.status;
    return;
  end if;

  if v_invoice.status = 'REFUNDED' then
    raise exception 'Refunded invoice cannot be cancelled';
  end if;

  if coalesce(v_invoice.amount_paid, 0) > 0 then
    raise exception 'Paid or partially-paid invoices require the refund/credit-note workflow';
  end if;

  -- Restore inventory once, inside the same transaction as cancellation.
  for v_item in
    select product_id, quantity, product_name_snapshot
    from public.invoice_items
    where invoice_id = p_invoice_id
      and organization_id = p_organization_id
      and product_id is not null
  loop
    update public.products
    set stock = stock + v_item.quantity,
        updated_at = now()
    where id = v_item.product_id
      and organization_id = p_organization_id
    returning stock into v_stock_after;

    if found then
      insert into public.inventory_movements(
        organization_id,
        product_id,
        invoice_id,
        movement_type,
        quantity_change,
        stock_after,
        actor_user_id,
        note
      ) values (
        p_organization_id,
        v_item.product_id,
        p_invoice_id,
        'RETURN',
        v_item.quantity,
        v_stock_after,
        v_user_id,
        'Invoice cancelled: ' || v_reason
      );
    end if;
  end loop;

  if v_invoice.customer_id is not null and coalesce(v_invoice.amount_due, 0) > 0 then
    update public.customers
    set outstanding_balance = greatest(outstanding_balance - v_invoice.amount_due, 0),
        updated_at = now()
    where id = v_invoice.customer_id
      and organization_id = p_organization_id;
  end if;

  update public.invoices
  set status = 'CANCELLED',
      amount_due = 0,
      cancellation_reason = v_reason,
      cancelled_by = v_user_id,
      cancelled_at = now(),
      updated_at = now()
  where id = p_invoice_id;

  insert into public.audit_logs(
    organization_id,
    actor_user_id,
    actor_role,
    action,
    entity_type,
    entity_id,
    summary
  ) values (
    p_organization_id,
    v_user_id,
    'OWNER',
    'INVOICE_CANCELLED',
    'INVOICE',
    p_invoice_id,
    jsonb_build_object(
      'invoice_number', v_invoice.invoice_number,
      'reason', v_reason,
      'grand_total', v_invoice.grand_total,
      'due_removed', v_invoice.amount_due,
      'stock_restored', true
    )
  );

  return query select p_invoice_id, v_invoice.invoice_number, 'CANCELLED'::text;
end;
$$;

revoke all on function public.cancel_pos_invoice(uuid, uuid, text) from public;
grant execute on function public.cancel_pos_invoice(uuid, uuid, text) to authenticated;

-- GST report summary. Cancelled/refunded invoices are excluded.
create or replace function public.owner_gst_report_summary(
  p_organization_id uuid,
  p_from timestamptz,
  p_to timestamptz
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_result jsonb;
begin
  if v_user_id is null then
    raise exception 'Authentication required';
  end if;

  if not public.has_org_role(p_organization_id, 'OWNER') then
    raise exception 'Owner access required';
  end if;

  if p_from is null or p_to is null or p_from >= p_to then
    raise exception 'Invalid GST report date range';
  end if;

  with eligible_invoices as (
    select id, grand_total, taxable_amount, cgst, sgst, igst
    from public.invoices
    where organization_id = p_organization_id
      and created_at >= p_from
      and created_at < p_to
      and status not in ('CANCELLED','REFUNDED')
  ),
  summary as (
    select
      count(*)::bigint as invoice_count,
      coalesce(sum(grand_total),0)::numeric as gross_sales,
      coalesce(sum(taxable_amount),0)::numeric as taxable_sales,
      coalesce(sum(cgst),0)::numeric as cgst,
      coalesce(sum(sgst),0)::numeric as sgst,
      coalesce(sum(igst),0)::numeric as igst
    from eligible_invoices
  ),
  rate_breakdown as (
    select coalesce(jsonb_agg(jsonb_build_object(
      'rate', tax_rate,
      'taxable', taxable,
      'cgst', cgst,
      'sgst', sgst,
      'igst', igst,
      'totalTax', cgst + sgst + igst,
      'gross', gross
    ) order by tax_rate), '[]'::jsonb) as data
    from (
      select
        ii.tax_rate,
        coalesce(sum(ii.taxable_amount),0)::numeric as taxable,
        coalesce(sum(ii.cgst),0)::numeric as cgst,
        coalesce(sum(ii.sgst),0)::numeric as sgst,
        coalesce(sum(ii.igst),0)::numeric as igst,
        coalesce(sum(ii.line_total),0)::numeric as gross
      from public.invoice_items ii
      join eligible_invoices ei on ei.id = ii.invoice_id
      group by ii.tax_rate
      order by ii.tax_rate
    ) q
  )
  select jsonb_build_object(
    'summary', jsonb_build_object(
      'invoiceCount', s.invoice_count,
      'grossSales', s.gross_sales,
      'taxableSales', s.taxable_sales,
      'cgst', s.cgst,
      'sgst', s.sgst,
      'igst', s.igst,
      'totalTax', s.cgst + s.sgst + s.igst
    ),
    'rateBreakdown', rb.data
  )
  into v_result
  from summary s
  cross join rate_breakdown rb;

  return coalesce(v_result, '{}'::jsonb);
end;
$$;

revoke all on function public.owner_gst_report_summary(uuid, timestamptz, timestamptz) from public;
grant execute on function public.owner_gst_report_summary(uuid, timestamptz, timestamptz) to authenticated;
