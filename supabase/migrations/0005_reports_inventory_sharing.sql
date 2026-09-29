-- BRANDSPIRE POS PHASE 5
-- Owner reports + safe inventory adjustment RPCs.

create or replace function public.adjust_product_stock(
  p_organization_id uuid,
  p_product_id uuid,
  p_quantity_change numeric,
  p_note text default null
)
returns table(product_id uuid, product_name text, stock numeric)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_product public.products%rowtype;
  v_new_stock numeric;
  v_negative_stock_enabled boolean := false;
  v_movement_type text;
begin
  if v_user_id is null then
    raise exception 'Authentication required';
  end if;

  if not public.has_org_role(p_organization_id, 'OWNER') then
    raise exception 'Owner access required';
  end if;

  if p_quantity_change is null or p_quantity_change = 0 then
    raise exception 'Stock change cannot be zero';
  end if;

  if not public.can_use_brandspire_pos(p_organization_id) then
    raise exception 'Brandspire POS subscription is not active';
  end if;

  select * into v_product
  from public.products
  where id = p_product_id
    and organization_id = p_organization_id
    and deleted_at is null
    and active = true
  for update;

  if not found then
    raise exception 'Product not found';
  end if;

  select coalesce(negative_stock_enabled, false)
  into v_negative_stock_enabled
  from public.organization_settings
  where organization_id = p_organization_id;

  v_new_stock := v_product.stock + p_quantity_change;
  if v_new_stock < 0 and not v_negative_stock_enabled then
    raise exception 'This adjustment would create negative stock';
  end if;

  update public.products
  set stock = v_new_stock
  where id = p_product_id;

  v_movement_type := case when p_quantity_change > 0 then 'STOCK_IN' else 'STOCK_OUT' end;

  insert into public.inventory_movements(
    organization_id,
    product_id,
    movement_type,
    quantity_change,
    stock_after,
    actor_user_id,
    note
  ) values (
    p_organization_id,
    p_product_id,
    v_movement_type,
    p_quantity_change,
    v_new_stock,
    v_user_id,
    nullif(trim(coalesce(p_note, '')), '')
  );

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
    'INVENTORY_ADJUSTED',
    'PRODUCT',
    p_product_id,
    jsonb_build_object(
      'product_name', v_product.name,
      'quantity_change', p_quantity_change,
      'stock_before', v_product.stock,
      'stock_after', v_new_stock,
      'note', p_note
    )
  );

  return query select p_product_id, v_product.name, v_new_stock;
end;
$$;

revoke all on function public.adjust_product_stock(uuid, uuid, numeric, text) from public;
grant execute on function public.adjust_product_stock(uuid, uuid, numeric, text) to authenticated;

create or replace function public.owner_report_summary(
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
    raise exception 'Invalid report date range';
  end if;

  with filtered_invoices as (
    select i.*
    from public.invoices i
    where i.organization_id = p_organization_id
      and i.created_at >= p_from
      and i.created_at < p_to
      and i.status not in ('CANCELLED', 'REFUNDED')
  ),
  summary as (
    select
      count(*)::bigint as bill_count,
      coalesce(sum(grand_total), 0)::numeric as sales,
      coalesce(sum(amount_paid), 0)::numeric as collected,
      coalesce(sum(amount_due), 0)::numeric as due,
      coalesce(avg(grand_total), 0)::numeric as average_bill
    from filtered_invoices
  ),
  payment_breakdown as (
    select coalesce(jsonb_agg(jsonb_build_object('method', method, 'amount', amount) order by amount desc), '[]'::jsonb) as data
    from (
      select coalesce(payment_method, 'OTHER') as method, coalesce(sum(amount_paid), 0)::numeric as amount
      from filtered_invoices
      group by coalesce(payment_method, 'OTHER')
    ) q
  ),
  top_products as (
    select coalesce(jsonb_agg(jsonb_build_object(
      'name', product_name_snapshot,
      'quantity', quantity,
      'sales', sales
    ) order by sales desc), '[]'::jsonb) as data
    from (
      select
        ii.product_name_snapshot,
        coalesce(sum(ii.quantity), 0)::numeric as quantity,
        coalesce(sum(ii.line_total), 0)::numeric as sales
      from public.invoice_items ii
      join filtered_invoices fi on fi.id = ii.invoice_id
      group by ii.product_name_snapshot
      order by sales desc
      limit 8
    ) q
  ),
  daily_sales as (
    select coalesce(jsonb_agg(jsonb_build_object('date', day, 'sales', sales, 'bills', bills) order by day), '[]'::jsonb) as data
    from (
      select
        (timezone('Asia/Kolkata', created_at))::date as day,
        coalesce(sum(grand_total), 0)::numeric as sales,
        count(*)::bigint as bills
      from filtered_invoices
      group by (timezone('Asia/Kolkata', created_at))::date
      order by day
    ) q
  ),
  staff_sales as (
    select coalesce(jsonb_agg(jsonb_build_object(
      'name', display_name,
      'sales', sales,
      'bills', bills
    ) order by sales desc), '[]'::jsonb) as data
    from (
      select
        coalesce(sp.full_name, 'Staff') as display_name,
        coalesce(sum(fi.grand_total), 0)::numeric as sales,
        count(*)::bigint as bills
      from filtered_invoices fi
      left join public.staff_profiles sp on sp.user_id = fi.created_by
      where fi.created_by_role = 'STAFF'
      group by coalesce(sp.full_name, 'Staff')
      order by sales desc
      limit 8
    ) q
  ),
  low_stock as (
    select coalesce(jsonb_agg(jsonb_build_object(
      'id', id,
      'name', name,
      'stock', stock,
      'threshold', low_stock_threshold,
      'unit', unit
    ) order by stock asc), '[]'::jsonb) as data
    from (
      select id, name, stock, low_stock_threshold, unit
      from public.products
      where organization_id = p_organization_id
        and active = true
        and deleted_at is null
        and stock <= low_stock_threshold
      order by stock asc
      limit 10
    ) q
  )
  select jsonb_build_object(
    'summary', jsonb_build_object(
      'billCount', s.bill_count,
      'sales', s.sales,
      'collected', s.collected,
      'due', s.due,
      'averageBill', s.average_bill
    ),
    'paymentBreakdown', pb.data,
    'topProducts', tp.data,
    'dailySales', ds.data,
    'staffSales', ss.data,
    'lowStock', ls.data
  )
  into v_result
  from summary s
  cross join payment_breakdown pb
  cross join top_products tp
  cross join daily_sales ds
  cross join staff_sales ss
  cross join low_stock ls;

  return coalesce(v_result, '{}'::jsonb);
end;
$$;

revoke all on function public.owner_report_summary(uuid, timestamptz, timestamptz) from public;
grant execute on function public.owner_report_summary(uuid, timestamptz, timestamptz) to authenticated;
