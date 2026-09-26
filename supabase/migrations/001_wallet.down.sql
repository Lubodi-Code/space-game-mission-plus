-- Reversa de 001_wallet.sql. Borra saldos, órdenes e inventario: solo para entornos sin pagos reales.
drop function if exists public.buy_cosmetic(uuid, text, integer);
drop function if exists public.credit_order(uuid, text, integer, text);
drop table if exists public.inventory;
drop table if exists public.ledger;
drop table if exists public.orders;
drop table if exists public.wallets;
