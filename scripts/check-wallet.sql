-- Prueba de la migración 001_wallet.sql (billetera de Cristales). Pegar en Supabase → SQL Editor.
-- Todo corre en una transacción que termina en ROLLBACK: no deja datos.
-- Si algo falla, aparece un error que empieza con un código (W1, W2…). Si pasa, se ve una tabla final.
begin;

insert into auth.users (id, aud, role, email) values
  ('00000000-0000-0000-0000-0000000000c1', 'authenticated', 'authenticated', 'wallet_a@example.invalid'),
  ('00000000-0000-0000-0000-0000000000c2', 'authenticated', 'authenticated', 'wallet_b@example.invalid');

do $$
declare
  a uuid := '00000000-0000-0000-0000-0000000000c1';
  o uuid; o1 uuid; bal int; ok boolean;
begin
  -- Orden como la crea /api/pay/intent: pending + intent guardado.
  insert into public.orders (user_id, pack_id, crystals, amount, currency, onvo_intent_id)
  values (a, 'pack_s', 120, 100000, 'CRC', 'pi_test_1') returning id into o;
  o1 := o;

  -- W1: acredita una sola vez aunque el webhook llegue 3 veces
  ok := public.credit_order(o, 'pi_test_1', 100000, 'CRC');
  if not ok then raise exception 'W1a: la primera acreditación devolvió false'; end if;
  if public.credit_order(o, 'pi_test_1', 100000, 'CRC') then raise exception 'W1b: acreditó dos veces'; end if;
  perform public.credit_order(o, 'pi_test_1', 100000, 'CRC');
  if (select crystals from public.wallets where user_id = a) <> 120 then raise exception 'W1c: saldo distinto de 120'; end if;
  if (select count(*) from public.ledger where order_id = o) <> 1 then raise exception 'W1d: más de una fila en ledger'; end if;
  if (select status from public.orders where id = o) <> 'paid' then raise exception 'W1e: la orden no quedó paid'; end if;

  -- W2: rechaza monto, moneda o intent distintos y órdenes inexistentes
  insert into public.orders (user_id, pack_id, crystals, amount, currency, onvo_intent_id)
  values (a, 'pack_m', 330, 220000, 'CRC', 'pi_test_2') returning id into o;
  begin perform public.credit_order(o, 'pi_test_2', 1, 'CRC'); raise exception 'W2a: aceptó otro monto';
  exception when others then if sqlerrm like 'W2a:%' then raise; end if; end;
  begin perform public.credit_order(o, 'pi_test_2', 220000, 'USD'); raise exception 'W2b: aceptó otra moneda';
  exception when others then if sqlerrm like 'W2b:%' then raise; end if; end;
  begin perform public.credit_order(o, 'pi_otro', 220000, 'CRC'); raise exception 'W2c: aceptó otro intent';
  exception when others then if sqlerrm like 'W2c:%' then raise; end if; end;
  begin perform public.credit_order(gen_random_uuid(), 'pi_test_2', 220000, 'CRC'); raise exception 'W2d: aceptó una orden inexistente';
  exception when others then if sqlerrm like 'W2d:%' then raise; end if; end;
  if (select crystals from public.wallets where user_id = a) <> 120 then raise exception 'W2e: un intento rechazado cambió el saldo'; end if;

  -- W3: canje de cosmético: descuenta, no dos veces el mismo ítem, no sin saldo
  bal := public.buy_cosmetic(a, 'beam_premium_x', 100);
  if bal <> 20 then raise exception 'W3a: saldo tras canje %', bal; end if;
  begin perform public.buy_cosmetic(a, 'beam_premium_x', 10); raise exception 'W3b: compró dos veces el mismo ítem';
  exception when others then if sqlerrm like 'W3b:%' then raise; end if; end;
  begin perform public.buy_cosmetic(a, 'hull_premium_y', 500); raise exception 'W3c: compró sin saldo';
  exception when others then if sqlerrm like 'W3c:%' then raise; end if; end;
  if (select crystals from public.wallets where user_id = a) <> 20 then raise exception 'W3d: un canje rechazado cambió el saldo'; end if;

  -- W6 (migración 004): reembolso tras gastar parte → saldo a 0, sin negativos, idempotente
  bal := public.refund_order(o1);
  if bal <> 20 then raise exception 'W6a: el reembolso quitó % (esperado 20: lo que quedaba)', bal; end if;
  if (select crystals from public.wallets where user_id = a) <> 0 then raise exception 'W6b: saldo tras reembolso distinto de 0'; end if;
  if (select status from public.orders where id = o1) <> 'refunded' then raise exception 'W6c: la orden no quedó refunded'; end if;
  if public.refund_order(o1) <> 0 then raise exception 'W6d: reembolsó dos veces'; end if;
  if (select count(*) from public.ledger where order_id = o1 and reason = 'refund') <> 1 then raise exception 'W6e: filas de reembolso duplicadas'; end if;
  if has_function_privilege('authenticated', 'public.refund_order(uuid)', 'execute') then raise exception 'W6f: authenticated puede reembolsar'; end if;

  -- W4: permisos: solo service_role ejecuta las funciones de dinero
  if has_function_privilege('authenticated', 'public.credit_order(uuid, text, integer, text)', 'execute') then raise exception 'W4a: authenticated puede acreditar'; end if;
  if has_function_privilege('anon', 'public.credit_order(uuid, text, integer, text)', 'execute') then raise exception 'W4b: anon puede acreditar'; end if;
  if has_function_privilege('authenticated', 'public.buy_cosmetic(uuid, text, integer)', 'execute') then raise exception 'W4c: authenticated puede canjear directo'; end if;
  if not has_function_privilege('service_role', 'public.credit_order(uuid, text, integer, text)', 'execute') then raise exception 'W4d: service_role no puede acreditar'; end if;
end $$;

-- W5: RLS real: B no ve la billetera ni las órdenes de A, y no puede escribirlas
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000c2","role":"authenticated"}', true);
do $$
begin
  if (select count(*) from public.wallets) <> 0 then raise exception 'W5a: B ve billeteras ajenas'; end if;
  if (select count(*) from public.orders) <> 0 then raise exception 'W5b: B ve órdenes ajenas'; end if;
  begin
    update public.wallets set crystals = 999999;
    if found then raise exception 'W5c: B modificó una billetera'; end if;
  exception when insufficient_privilege then null; end;
  begin
    insert into public.wallets (user_id, crystals) values ('00000000-0000-0000-0000-0000000000c2', 999999);
    raise exception 'W5d: B se creó saldo';
  exception when insufficient_privilege then null;
            when others then if sqlerrm like 'W5d:%' then raise; end if;
  end;
end $$;
select 'OK billetera' as resultado,
       (select count(*) from public.wallets) as billeteras_que_ve_b;

rollback;
