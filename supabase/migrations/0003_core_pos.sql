-- BRANDSPIRE POS PHASE 2
-- Core customers, products, inventory and transaction-safe billing.

create table if not exists public.customers (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  name text not null,
  phone text,
  email text,
  address text,
  state text,
  gstin text,
  notes text,
  outstanding_balance numeric(14,2) not null default 0,
  active boolean not null default true,
  deleted_at timestamptz,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.products (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  name text not null,
  sku text,
  barcode text,
  unit text not null default 'pcs',
  hsn_sac text,
  purchase_price numeric(14,2) not null default 0 check (purchase_price >= 0),
  selling_price numeric(14,2) not null check (selling_price >= 0),
  tax_rate numeric(6,3) not null default 0 check (tax_rate >= 0 and tax_rate <= 100),
  tax_inclusive boolean not null default false,
  stock numeric(16,3) not null default 0,
  low_stock_threshold numeric(16,3) not null default 5 check (low_stock_threshold >= 0),
  active boolean not null default true,
  deleted_at timestamptz,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists products_org_sku_unique
  on public.products(organization_id, lower(sku)) where sku is not null and deleted_at is null;
create unique index if not exists products_org_barcode_unique
  on public.products(organization_id, barcode) where barcode is not null and deleted_at is null;

create table if not exists public.invoice_counters (
  organization_id uuid not null references public.organizations(id) on delete cascade,
  invoice_year integer not null,
  next_number bigint not null default 1 check (next_number > 0),
  updated_at timestamptz not null default now(),
  primary key (organization_id, invoice_year)
);

create table if not exists public.invoices (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  customer_id uuid references public.customers(id) on delete set null,
  invoice_number text not null,
  client_invoice_id uuid,
  created_by uuid not null references auth.users(id),
  created_by_role text not null check (created_by_role in ('OWNER','STAFF')),
  status text not null check (status in ('DRAFT','PENDING','PAID','PARTIALLY_PAID','CANCELLED','REFUNDED')),
  payment_status text not null check (payment_status in ('UNPAID','PARTIALLY_PAID','PAID','REFUNDED')),
  payment_method text check (payment_method in ('CASH','UPI','CARD','CREDIT','OTHER')),
  subtotal numeric(14,2) not null default 0,
  discount_type text not null default 'PERCENT' check (discount_type in ('PERCENT','FLAT')),
  discount_value numeric(14,2) not null default 0,
  discount_amount numeric(14,2) not null default 0,
  taxable_amount numeric(14,2) not null default 0,
  cgst numeric(14,2) not null default 0,
  sgst numeric(14,2) not null default 0,
  igst numeric(14,2) not null default 0,
  round_off numeric(14,2) not null default 0,
  grand_total numeric(14,2) not null default 0,
  amount_paid numeric(14,2) not null default 0,
  amount_due numeric(14,2) not null default 0,
  invoice_date timestamptz not null default now(),
  cancelled_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, invoice_number),
  unique (organization_id, client_invoice_id)
);

create table if not exists public.invoice_items (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  invoice_id uuid not null references public.invoices(id) on delete cascade,
  product_id uuid references public.products(id) on delete set null,
  product_name_snapshot text not null,
  sku_snapshot text,
  hsn_sac_snapshot text,
  unit_snapshot text not null,
  quantity numeric(16,3) not null check (quantity > 0),
  unit_price numeric(14,2) not null,
  tax_rate numeric(6,3) not null,
  tax_inclusive boolean not null,
  taxable_amount numeric(14,2) not null,
  cgst numeric(14,2) not null default 0,
  sgst numeric(14,2) not null default 0,
  igst numeric(14,2) not null default 0,
  line_total numeric(14,2) not null,
  created_at timestamptz not null default now()
);

create table if not exists public.payments (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  invoice_id uuid not null references public.invoices(id) on delete cascade,
  amount numeric(14,2) not null check (amount > 0),
  method text not null check (method in ('CASH','UPI','CARD','CREDIT','OTHER')),
  status text not null default 'CAPTURED' check (status in ('PENDING','CAPTURED','FAILED','REFUNDED')),
  provider text,
  provider_payment_id text,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

create table if not exists public.inventory_movements (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  product_id uuid not null references public.products(id) on delete cascade,
  invoice_id uuid references public.invoices(id) on delete set null,
  movement_type text not null check (movement_type in ('OPENING','STOCK_IN','STOCK_OUT','SALE','PURCHASE','ADJUSTMENT','RETURN')),
  quantity_change numeric(16,3) not null,
  stock_after numeric(16,3) not null,
  actor_user_id uuid references auth.users(id) on delete set null,
  note text,
  created_at timestamptz not null default now()
);

create index if not exists customers_org_created_idx on public.customers(organization_id, created_at desc);
create index if not exists customers_org_phone_idx on public.customers(organization_id, phone);
create index if not exists products_org_created_idx on public.products(organization_id, created_at desc);
create index if not exists products_org_name_idx on public.products(organization_id, name);
create index if not exists invoices_org_created_idx on public.invoices(organization_id, created_at desc);
create index if not exists invoices_org_status_idx on public.invoices(organization_id, status, created_at desc);
create index if not exists invoices_org_customer_idx on public.invoices(organization_id, customer_id, created_at desc);
create index if not exists invoice_items_invoice_idx on public.invoice_items(invoice_id);
create index if not exists payments_invoice_idx on public.payments(invoice_id, created_at desc);
create index if not exists inventory_movements_product_idx on public.inventory_movements(organization_id, product_id, created_at desc);

-- Reuse the Phase 1 updated_at trigger function.
drop trigger if exists customers_updated_at on public.customers;
create trigger customers_updated_at before update on public.customers for each row execute function public.set_updated_at();
drop trigger if exists products_updated_at on public.products;
create trigger products_updated_at before update on public.products for each row execute function public.set_updated_at();
drop trigger if exists invoices_updated_at on public.invoices;
create trigger invoices_updated_at before update on public.invoices for each row execute function public.set_updated_at();

alter table public.customers enable row level security;
alter table public.products enable row level security;
alter table public.invoice_counters enable row level security;
alter table public.invoices enable row level security;
alter table public.invoice_items enable row level security;
alter table public.payments enable row level security;
alter table public.inventory_movements enable row level security;

-- Customer policies: Staff can add/search; Owner can manage. No hard-delete policy.
drop policy if exists customers_member_read on public.customers;
create policy customers_member_read on public.customers for select to authenticated
using (public.is_org_member(organization_id));
drop policy if exists customers_member_insert on public.customers;
create policy customers_member_insert on public.customers for insert to authenticated
with check (public.is_org_member(organization_id) and (created_by is null or created_by = auth.uid()));
drop policy if exists customers_owner_update on public.customers;
create policy customers_owner_update on public.customers for update to authenticated
using (public.has_org_role(organization_id, 'OWNER'))
with check (public.has_org_role(organization_id, 'OWNER'));

-- Product policies: Staff can add/search; Owner can manage. No hard-delete policy.
drop policy if exists products_member_read on public.products;
create policy products_member_read on public.products for select to authenticated
using (public.is_org_member(organization_id));
drop policy if exists products_member_insert on public.products;
create policy products_member_insert on public.products for insert to authenticated
with check (public.is_org_member(organization_id) and (created_by is null or created_by = auth.uid()));
drop policy if exists products_owner_update on public.products;
create policy products_owner_update on public.products for update to authenticated
using (public.has_org_role(organization_id, 'OWNER'))
with check (public.has_org_role(organization_id, 'OWNER'));

-- Bills are immutable from normal clients. Creation goes through the transactional RPC below.
drop policy if exists invoices_member_read on public.invoices;
create policy invoices_member_read on public.invoices for select to authenticated
using (public.is_org_member(organization_id));
drop policy if exists invoice_items_member_read on public.invoice_items;
create policy invoice_items_member_read on public.invoice_items for select to authenticated
using (public.is_org_member(organization_id));
drop policy if exists payments_member_read on public.payments;
create policy payments_member_read on public.payments for select to authenticated
using (public.is_org_member(organization_id));
drop policy if exists inventory_owner_read on public.inventory_movements;
create policy inventory_owner_read on public.inventory_movements for select to authenticated
using (public.has_org_role(organization_id, 'OWNER'));

create or replace function public.can_use_brandspire_pos(target_org uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.organizations o
    join public.subscriptions s on s.organization_id = o.id
    where o.id = target_org
      and o.status = 'ACTIVE'
      and s.status in ('TRIAL','ACTIVE','GRACE_PERIOD')
      and (s.starts_at is null or s.starts_at <= now())
      and (s.ends_at is null or s.ends_at > now())
  );
$$;

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

  if p_client_invoice_id is not null then
    select i.id, i.invoice_number, i.grand_total, i.payment_status
    into v_invoice_id, v_invoice_number, v_grand, v_payment_status
    from public.invoices i
    where i.organization_id = p_organization_id and i.client_invoice_id = p_client_invoice_id;
    if found then return query select v_invoice_id, v_invoice_number, v_grand, v_payment_status; return; end if;
  end if;

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
