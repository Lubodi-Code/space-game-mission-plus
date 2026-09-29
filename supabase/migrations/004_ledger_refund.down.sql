-- Revierte 004. Falla a propósito si ya hay filas 'refund' u órdenes 'refunded' (no se pueden
-- borrar reembolsos reales sin decidir qué hacer con ellos).
drop function if exists public.refund_order(uuid);
drop index if exists public.ledger_order_reason_idx;
alter table public.ledger add constraint ledger_order_id_key unique (order_id);
alter table public.orders drop constraint orders_status_check;
alter table public.orders add constraint orders_status_check check (status in ('pending', 'paid', 'failed'));
alter table public.ledger drop constraint ledger_reason_check;
alter table public.ledger add constraint ledger_reason_check check (reason in ('purchase', 'cosmetic'));
