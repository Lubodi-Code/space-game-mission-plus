-- Fase 10E: saldo de Cristales, órdenes de pago ONVO, ledger idempotente e inventario.
-- Regla: el cliente (rol authenticated) solo LEE sus filas. Toda escritura pasa por las
-- funciones de abajo, que solo puede ejecutar service_role (rutas server/ de Nuxt).

create table public.wallets (
  user_id uuid primary key references auth.users (id) on delete cascade,
  crystals integer not null default 0 check (crystals >= 0),
  updated_at timestamptz not null default now()
);

create table public.orders (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  pack_id text not null,
  crystals integer not null check (crystals > 0),
  amount integer not null check (amount > 0),      -- en la unidad que espera ONVO (ver server/utils/onvo.ts)
  currency text not null,
  onvo_intent_id text unique,
  status text not null default 'pending' check (status in ('pending', 'paid', 'failed')),
  created_at timestamptz not null default now(),
  paid_at timestamptz
);
create index orders_user_idx on public.orders (user_id, created_at desc);

create table public.ledger (
  id bigserial primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  delta integer not null,
  reason text not null check (reason in ('purchase', 'cosmetic')),
  order_id uuid unique references public.orders (id), -- una sola acreditación por orden
  item_id text,
  created_at timestamptz not null default now()
);

create table public.inventory (
  user_id uuid not null references auth.users (id) on delete cascade,
  item_id text not null,
  acquired_at timestamptz not null default now(),
  primary key (user_id, item_id)
);

alter table public.wallets enable row level security;
alter table public.orders enable row level security;
alter table public.ledger enable row level security;
alter table public.inventory enable row level security;

create policy wallets_read on public.wallets for select to authenticated using (user_id = auth.uid());
create policy orders_read on public.orders for select to authenticated using (user_id = auth.uid());
create policy ledger_read on public.ledger for select to authenticated using (user_id = auth.uid());
create policy inventory_read on public.inventory for select to authenticated using (user_id = auth.uid());

-- Acredita una orden pagada. Idempotente: si ya estaba 'paid' devuelve false sin tocar nada.
-- Acepta 'failed': un intent puede fallar y luego pagarse al reintentar (eventos fuera de orden).
-- Chequea que intent, monto y moneda coincidan con lo que el servidor guardó al crearla.
create or replace function public.credit_order(p_order_id uuid, p_intent_id text, p_amount integer, p_currency text)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  o public.orders%rowtype;
begin
  select * into o from public.orders where id = p_order_id for update;
  if not found then raise exception 'order_not_found'; end if;
  if o.status = 'paid' then return false; end if;
  if o.status not in ('pending', 'failed') then raise exception 'order_not_payable'; end if;
  if o.onvo_intent_id is distinct from p_intent_id then raise exception 'intent_mismatch'; end if;
  if o.amount <> p_amount or upper(o.currency) <> upper(p_currency) then raise exception 'amount_mismatch'; end if;

  update public.orders set status = 'paid', paid_at = now() where id = o.id;
  insert into public.ledger (user_id, delta, reason, order_id) values (o.user_id, o.crystals, 'purchase', o.id);
  insert into public.wallets (user_id, crystals) values (o.user_id, o.crystals)
    on conflict (user_id) do update set crystals = public.wallets.crystals + excluded.crystals, updated_at = now();
  return true;
end;
$$;

-- Canjea un cosmético premium. El precio lo pasa el servidor desde shared/catalog.js.
-- Devuelve el saldo resultante. Falla si no alcanza o si ya lo tenía.
create or replace function public.buy_cosmetic(p_user_id uuid, p_item_id text, p_price integer)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  bal integer;
begin
  if p_price <= 0 then raise exception 'bad_price'; end if;
  if exists (select 1 from public.inventory where user_id = p_user_id and item_id = p_item_id) then
    raise exception 'already_owned';
  end if;
  update public.wallets set crystals = crystals - p_price, updated_at = now()
    where user_id = p_user_id and crystals >= p_price
    returning crystals into bal;
  if not found then raise exception 'insufficient_funds'; end if;
  insert into public.inventory (user_id, item_id) values (p_user_id, p_item_id);
  insert into public.ledger (user_id, delta, reason, item_id) values (p_user_id, -p_price, 'cosmetic', p_item_id);
  return bal;
end;
$$;

revoke all on function public.credit_order(uuid, text, integer, text) from public, anon, authenticated;
revoke all on function public.buy_cosmetic(uuid, text, integer) from public, anon, authenticated;
grant execute on function public.credit_order(uuid, text, integer, text) to service_role;
grant execute on function public.buy_cosmetic(uuid, text, integer) to service_role;
