-- Brandspire POS Phase 15
-- Security, reliability and performance hardening.
-- Safe to run after migrations 0001-0009.

-- Search/index hardening for common tenant-scoped counter operations.
create index if not exists products_org_barcode_active_idx
  on public.products(organization_id, barcode)
  where active = true and deleted_at is null and barcode is not null;

create index if not exists products_org_sku_active_idx
  on public.products(organization_id, sku)
  where active = true and deleted_at is null and sku is not null;

create index if not exists products_org_lower_name_active_idx
  on public.products(organization_id, lower(name))
  where active = true and deleted_at is null;

create index if not exists customers_org_lower_name_active_idx
  on public.customers(organization_id, lower(name))
  where active = true and deleted_at is null;

create index if not exists invoice_items_org_product_created_idx
  on public.invoice_items(organization_id, product_id, created_at desc);

-- Concurrency-safe offline idempotency hardening.
create or replace function public.create_pos_invoice(
  p_organization_id uuid,
  p_customer_id uuid,
  p_items jsonb,
  p_discount_type text default 'PERCENT',
  p_discount_value numeric default 0,
  p_payment_method text default 'CASH',
  p_amount_paid numeric default null,
  p_client_invoice_id uuid default null
)
returns table(invoice_id uuid, invoice_number text, grand_total numeric, payment_status text)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_role public.member_role;
  v_prefix text;
  v_year integer;
  v_counter bigint;
  v_invoice_number text;
  v_invoice_id uuid;
  v_item jsonb;
  v_product public.products%rowtype;
  v_quantity numeric;
  v_gross numeric;
  v_base numeric;
  v_line_tax numeric;
  v_total_base numeric := 0;
  v_total_tax numeric := 0;
  v_discount_amount numeric := 0;
  v_discount_ratio numeric := 1;
  v_taxable numeric := 0;
  v_cgst numeric := 0;
  v_sgst numeric := 0;
  v_igst numeric := 0;
  v_grand numeric := 0;
  v_paid numeric := 0;
  v_due numeric := 0;
  v_payment_status text;
  v_invoice_status text;
  v_org_state text;
  v_customer_state text;
  v_interstate boolean := false;
  v_negative_stock boolean := false;
  v_adjusted_base numeric;
  v_adjusted_tax numeric;
  v_line_cgst numeric;
  v_line_sgst numeric;
  v_line_igst numeric;
  v_line_total numeric;
begin
  if v_user_id is null then raise exception 'Authentication required'; end if;

  select m.role into v_role
  from public.organization_members m
  where m.organization_id = p_organization_id and m.user_id = v_user_id and m.active = true
  limit 1;
  if v_role is null then raise exception 'Organization access denied'; end if;
  if v_role not in ('OWNER','STAFF') then raise exception 'Billing permission denied'; end if;
  if not public.can_use_brandspire_pos(p_organization_id) then raise exception 'Brandspire POS subscription is not active'; end if;

  -- Serialize retries carrying the same client-generated invoice UUID.
  -- This closes the race where two simultaneous offline-sync retries could both
  -- pass the initial existence check before the unique constraint is reached.
  if p_client_invoice_id is not null then
    perform pg_advisory_xact_lock(
      hashtext(p_organization_id::text),
      hashtext(p_client_invoice_id::text)
    );

    select i.id, i.invoice_number, i.grand_total, i.payment_status
    into v_invoice_id, v_invoice_number, v_grand, v_payment_status
    from public.invoices i
    where i.organization_id = p_organization_id
      and i.client_invoice_id = p_client_invoice_id;

    if found then
      return query select v_invoice_id, v_invoice_number, v_grand, v_payment_status;
      return;
    end if;
  end if;

  if p_items is null or jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'At least one product is required';
  end if;
  if p_discount_type not in ('PERCENT','FLAT') then raise exception 'Invalid discount type'; end if;
  if p_payment_method not in ('CASH','UPI','CARD','CREDIT','OTHER') then raise exception 'Invalid payment method'; end if;

  select o.state, coalesce(s.invoice_prefix, 'BSP'), coalesce(s.negative_stock_enabled, false)
  into v_org_state, v_prefix, v_negative_stock
  from public.organizations o
  left join public.organization_settings s on s.organization_id = o.id
  where o.id = p_organization_id;

  if p_customer_id is not null then
    select c.state into v_customer_state
    from public.customers c
    where c.id = p_customer_id and c.organization_id = p_organization_id and c.deleted_at is null and c.active = true;
    if not found then raise exception 'Customer not found'; end if;
  end if;

  v_interstate := p_customer_id is not null and v_org_state is not null and v_customer_state is not null
    and lower(trim(v_org_state)) <> lower(trim(v_customer_state));

  -- First pass: lock products, validate stock, compute base/tax from trusted database prices.
  for v_item in select * from jsonb_array_elements(p_items)
  loop
    begin v_quantity := (v_item->>'quantity')::numeric; exception when others then raise exception 'Invalid quantity'; end;
    if v_quantity <= 0 then raise exception 'Quantity must be greater than zero'; end if;

    select * into v_product from public.products
    where id = (v_item->>'product_id')::uuid and organization_id = p_organization_id and active = true and deleted_at is null
    for update;
    if not found then raise exception 'Product not found'; end if;
    if not v_negative_stock and v_product.stock < v_quantity then raise exception 'Insufficient stock for %', v_product.name; end if;

    v_gross := v_product.selling_price * v_quantity;
    if v_product.tax_inclusive and v_product.tax_rate > 0 then
      v_base := v_gross / (1 + (v_product.tax_rate / 100));
      v_line_tax := v_gross - v_base;
    else
      v_base := v_gross;
      v_line_tax := v_base * (v_product.tax_rate / 100);
    end if;
    v_total_base := v_total_base + v_base;
    v_total_tax := v_total_tax + v_line_tax;
  end loop;

  if p_discount_type = 'PERCENT' then
    v_discount_amount := v_total_base * least(greatest(coalesce(p_discount_value,0),0),100) / 100;
  else
    v_discount_amount := least(greatest(coalesce(p_discount_value,0),0), v_total_base);
  end if;
  if v_total_base > 0 then v_discount_ratio := (v_total_base - v_discount_amount) / v_total_base; end if;
  v_taxable := v_total_base - v_discount_amount;

  if v_interstate then
    v_igst := v_total_tax * v_discount_ratio;
  else
    v_cgst := (v_total_tax * v_discount_ratio) / 2;
    v_sgst := (v_total_tax * v_discount_ratio) / 2;
  end if;

  v_grand := round(v_taxable + v_cgst + v_sgst + v_igst, 2);
  if p_amount_paid is null then
    v_paid := case when p_payment_method = 'CREDIT' then 0 else v_grand end;
  else
    v_paid := least(greatest(p_amount_paid, 0), v_grand);
  end if;
  v_due := round(v_grand - v_paid, 2);
  v_payment_status := case when v_paid >= v_grand then 'PAID' when v_paid > 0 then 'PARTIALLY_PAID' else 'UNPAID' end;
  v_invoice_status := case when v_payment_status = 'PAID' then 'PAID' when v_payment_status = 'PARTIALLY_PAID' then 'PARTIALLY_PAID' else 'PENDING' end;

  v_year := extract(year from timezone('Asia/Kolkata', now()))::integer;
  insert into public.invoice_counters(organization_id, invoice_year, next_number)
  values (p_organization_id, v_year, 1)
  on conflict (organization_id, invoice_year) do nothing;

  select next_number into v_counter from public.invoice_counters
  where organization_id = p_organization_id and invoice_year = v_year for update;
  update public.invoice_counters set next_number = v_counter + 1, updated_at = now()
  where organization_id = p_organization_id and invoice_year = v_year;
  v_invoice_number := v_prefix || '-' || v_year::text || '-' || lpad(v_counter::text, 6, '0');

  insert into public.invoices(
    organization_id, customer_id, invoice_number, client_invoice_id, created_by, created_by_role,
    status, payment_status, payment_method, subtotal, discount_type, discount_value, discount_amount,
    taxable_amount, cgst, sgst, igst, grand_total, amount_paid, amount_due
  ) values (
    p_organization_id, p_customer_id, v_invoice_number, p_client_invoice_id, v_user_id, v_role::text,
    v_invoice_status, v_payment_status, p_payment_method, round(v_total_base,2), p_discount_type,
    coalesce(p_discount_value,0), round(v_discount_amount,2), round(v_taxable,2), round(v_cgst,2), round(v_sgst,2),
    round(v_igst,2), v_grand, round(v_paid,2), v_due
  ) returning id into v_invoice_id;

  -- Second pass: insert immutable line snapshots and update inventory transactionally.
  for v_item in select * from jsonb_array_elements(p_items)
  loop
    v_quantity := (v_item->>'quantity')::numeric;
    select * into v_product from public.products where id = (v_item->>'product_id')::uuid and organization_id = p_organization_id for update;
    v_gross := v_product.selling_price * v_quantity;
    if v_product.tax_inclusive and v_product.tax_rate > 0 then
      v_base := v_gross / (1 + (v_product.tax_rate / 100));
      v_line_tax := v_gross - v_base;
    else
      v_base := v_gross;
      v_line_tax := v_base * (v_product.tax_rate / 100);
    end if;
    v_adjusted_base := v_base * v_discount_ratio;
    v_adjusted_tax := v_line_tax * v_discount_ratio;
    if v_interstate then v_line_igst := v_adjusted_tax; v_line_cgst := 0; v_line_sgst := 0;
    else v_line_igst := 0; v_line_cgst := v_adjusted_tax / 2; v_line_sgst := v_adjusted_tax / 2; end if;
    v_line_total := v_adjusted_base + v_adjusted_tax;

    insert into public.invoice_items(
      organization_id, invoice_id, product_id, product_name_snapshot, sku_snapshot, hsn_sac_snapshot,
      unit_snapshot, quantity, unit_price, tax_rate, tax_inclusive, taxable_amount, cgst, sgst, igst, line_total
    ) values (
      p_organization_id, v_invoice_id, v_product.id, v_product.name, v_product.sku, v_product.hsn_sac,
      v_product.unit, v_quantity, v_product.selling_price, v_product.tax_rate, v_product.tax_inclusive,
      round(v_adjusted_base,2), round(v_line_cgst,2), round(v_line_sgst,2), round(v_line_igst,2), round(v_line_total,2)
    );

    update public.products set stock = stock - v_quantity where id = v_product.id;
    insert into public.inventory_movements(organization_id, product_id, invoice_id, movement_type, quantity_change, stock_after, actor_user_id, note)
    select p_organization_id, v_product.id, v_invoice_id, 'SALE', -v_quantity, stock, v_user_id, v_invoice_number
    from public.products where id = v_product.id;
  end loop;

  if v_paid > 0 then
    insert into public.payments(organization_id, invoice_id, amount, method, status, created_by)
    values (p_organization_id, v_invoice_id, v_paid, p_payment_method, 'CAPTURED', v_user_id);
  end if;

  if p_customer_id is not null and v_due > 0 then
    update public.customers set outstanding_balance = outstanding_balance + v_due where id = p_customer_id and organization_id = p_organization_id;
  end if;

  insert into public.audit_logs(organization_id, actor_user_id, actor_role, action, entity_type, entity_id, summary)
  values (p_organization_id, v_user_id, v_role::text, 'INVOICE_CREATED', 'INVOICE', v_invoice_id,
    jsonb_build_object('invoice_number', v_invoice_number, 'grand_total', v_grand, 'payment_status', v_payment_status));

  return query select v_invoice_id, v_invoice_number, v_grand, v_payment_status;
end;
$$;

revoke all on function public.create_pos_invoice(uuid, uuid, jsonb, text, numeric, text, numeric, uuid) from public;
grant execute on function public.create_pos_invoice(uuid, uuid, jsonb, text, numeric, text, numeric, uuid) to authenticated;
