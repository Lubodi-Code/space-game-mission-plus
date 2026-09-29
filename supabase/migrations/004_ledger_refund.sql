-- Fase 13: reembolsos manuales de órdenes pagadas.
-- Flujo: se reembolsa en el dashboard de ONVO y después se ejecuta en el SQL Editor:
--   select public.refund_order('<id de la orden>');
-- Quita los Cristales de esa orden sin dejar el saldo negativo: si ya se gastaron, el saldo queda en
-- 0 y el ledger registra lo que realmente se descontó. Idempotente: una orden ya reembolsada no hace nada.

alter table public.ledger drop constraint ledger_reason_check;
alter table public.ledger add constraint ledger_reason_check check (reason in ('purchase', 'cosmetic', 'refund'));

alter table public.orders drop constraint orders_status_check;
alter table public.orders add constraint orders_status_check check (status in ('pending', 'paid', 'failed', 'refunded'));

-- unique(order_id) garantizaba UNA acreditación por orden; el reembolso necesita su propia fila,
-- así que la unicidad pasa a ser por (orden, razón): sigue habiendo una sola 'purchase' por orden.
alter table public.ledger drop constraint ledger_order_id_key;
create unique index ledger_order_reason_idx on public.ledger (order_id, reason) where order_id is not null;

create function public.refund_order(p_order_id uuid)
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  o public.orders%rowtype;
  bal integer;
  taken integer;
begin
  select * into o from public.orders where id = p_order_id for update;
  if not found then raise exception 'order_not_found'; end if;
  if o.status = 'refunded' then return 0; end if;
  if o.status <> 'paid' then raise exception 'order_not_refundable'; end if;

  select crystals into bal from public.wallets where user_id = o.user_id for update;
  taken := least(coalesce(bal, 0), o.crystals); -- lo que se puede quitar sin dejar saldo negativo
  if taken > 0 then
    update public.wallets set crystals = crystals - taken, updated_at = now() where user_id = o.user_id;
  end if;
  insert into public.ledger (user_id, delta, reason, order_id) values (o.user_id, -taken, 'refund', o.id);
  update public.orders set status = 'refunded' where id = o.id;
  return taken;
end;
$$;

revoke all on function public.refund_order(uuid) from public, anon, authenticated;
grant execute on function public.refund_order(uuid) to service_role;
