-- Fase 12: perfil del jugador en la nube, amigos e invitaciones a sala.
--
-- Reglas:
-- - El cliente (rol authenticated) solo LEE sus propias filas. Toda escritura pasa por las
--   funciones SECURITY DEFINER de abajo, que usan auth.uid() (nunca un id que mande el cliente).
-- - El progreso "blando" (XP, Chatarra, desbloqueos) lo escribe el cliente, igual que hoy en
--   localStorage: aquí solo se valida forma y topes. Lo que se paga con dinero (Cristales,
--   inventario premium) NO pasa por aquí: sigue en wallets/inventory (001_wallet.sql).
-- - A otro jugador solo se le muestra lo mínimo y solo si es amigo: nombre, avatar, código,
--   nivel, estadísticas de juego y si está en línea. Nunca el email.

-- ------------------------------------------------------------------ tablas
create table public.player_profiles (
  user_id      uuid primary key references auth.users (id) on delete cascade,
  friend_code  text not null unique check (friend_code ~ '^[A-Z]{4}-[0-9]{4}$'),
  display_name text not null default 'Comandante' check (char_length(display_name) between 1 and 24),
  avatar_url   text check (avatar_url is null or char_length(avatar_url) <= 500),
  data         jsonb not null default '{}'::jsonb check (octet_length(data::text) <= 65536),
  level        integer not null default 1 check (level >= 1),
  stats        jsonb not null default '{}'::jsonb,
  last_seen    timestamptz,
  -- Anti-spam de solicitudes: cuenta intentos por ventana de 1 h (no baja al cancelar).
  req_window   timestamptz not null default now(),
  req_count    integer not null default 0,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create table public.friendships (
  requester  uuid not null references auth.users (id) on delete cascade,
  addressee  uuid not null references auth.users (id) on delete cascade,
  status     text not null default 'pending' check (status in ('pending', 'accepted')),
  created_at timestamptz not null default now(),
  primary key (requester, addressee),
  check (requester <> addressee)
);
-- Un solo vínculo por par, sin importar quién lo pidió.
create unique index friendships_pair_idx
  on public.friendships (least(requester, addressee), greatest(requester, addressee));
create index friendships_addressee_idx on public.friendships (addressee);

create table public.room_invites (
  id         bigserial primary key,
  from_user  uuid not null references auth.users (id) on delete cascade,
  to_user    uuid not null references auth.users (id) on delete cascade,
  room_code  text not null check (room_code ~ '^[A-Z0-9]{4,8}$'),
  created_at timestamptz not null default now()
);
create index room_invites_to_idx on public.room_invites (to_user, created_at desc);
create index room_invites_from_idx on public.room_invites (from_user, to_user, created_at desc);
-- Sin DELETE desde la app: Realtime no aplica RLS a los eventos DELETE y anunciaría ids ajenos.
-- Las invitaciones vencen por lectura (10 min). Si la tabla crece, limpiar con un job de servicio.

-- ------------------------------------------------------------------ RLS
alter table public.player_profiles enable row level security;
alter table public.friendships     enable row level security;
alter table public.room_invites    enable row level security;

create policy "perfil propio" on public.player_profiles
  for select to authenticated using (user_id = auth.uid());
create policy "mis amistades" on public.friendships
  for select to authenticated using (auth.uid() in (requester, addressee));
-- Realtime (postgres_changes) respeta RLS: cada uno solo recibe sus invitaciones.
create policy "mis invitaciones" on public.room_invites
  for select to authenticated using (to_user = auth.uid());

revoke all on public.player_profiles, public.friendships, public.room_invites from anon, authenticated;
grant select on public.player_profiles, public.friendships, public.room_invites to authenticated;

alter publication supabase_realtime add table public.room_invites;

-- ------------------------------------------------------------------ helpers (privados)
-- Número de j->k acotado a [0, hi]; 0 si no es número.
create function public._sg_num(j jsonb, k text, hi numeric)
returns numeric language sql immutable set search_path = public, pg_temp as $$
  select case when jsonb_typeof(j -> k) = 'number'
              then least(greatest((j ->> k)::numeric, 0), hi) else 0 end
$$;

-- Unión de dos arrays de strings cortos (≤ 64 chars), sin repetidos, máximo 300.
create function public._sg_union(a jsonb, b jsonb)
returns jsonb language sql immutable set search_path = public, pg_temp as $$
  select coalesce(jsonb_agg(v order by v), '[]'::jsonb) from (
    select distinct v from (
      select e #>> '{}' as v
      from jsonb_array_elements(
        (case when jsonb_typeof(a) = 'array' then a else '[]'::jsonb end) ||
        (case when jsonb_typeof(b) = 'array' then b else '[]'::jsonb end)) e
      where jsonb_typeof(e) = 'string' and char_length(e #>> '{}') between 1 and 64
    ) s limit 300
  ) d
$$;

-- Máximo por clave de dos objetos {clave: número}; claves ≤ 32 chars, máximo 200 claves.
create function public._sg_max_obj(a jsonb, b jsonb, hi numeric)
returns jsonb language sql immutable set search_path = public, pg_temp as $$
  select coalesce(jsonb_object_agg(k, v), '{}'::jsonb) from (
    select k, max(v) as v from (
      select key as k, least(greatest(value::text::numeric, 0), hi) as v
      from jsonb_each(case when jsonb_typeof(a) = 'object' then a else '{}'::jsonb end)
      where jsonb_typeof(value) = 'number'
      union all
      select key, least(greatest(value::text::numeric, 0), hi)
      from jsonb_each(case when jsonb_typeof(b) = 'object' then b else '{}'::jsonb end)
      where jsonb_typeof(value) = 'number'
    ) s where char_length(k) between 1 and 32
    group by k order by k limit 200
  ) m
$$;

-- Objeto {slot: id} de strings cortos, máximo 12 entradas (cosméticos equipados).
create function public._sg_str_obj(a jsonb)
returns jsonb language sql immutable set search_path = public, pg_temp as $$
  select coalesce(jsonb_object_agg(key, value), '{}'::jsonb) from (
    select key, value from jsonb_each(case when jsonb_typeof(a) = 'object' then a else '{}'::jsonb end)
    where jsonb_typeof(value) = 'string' and char_length(key) between 1 and 32
      and char_length(value #>> '{}') between 1 and 64
    order by key limit 12
  ) s
$$;

-- Nivel según la curva de game/meta/profile.js (levelFromXp): pasar de L a L+1 cuesta 100 + 100·L.
create function public._sg_level(xp numeric)
returns integer language plpgsql immutable set search_path = public, pg_temp as $$
declare lvl integer := 1; rest numeric := greatest(xp, 0);
begin
  while rest >= 100 + lvl * 100 and lvl < 10000 loop
    rest := rest - (100 + lvl * 100);
    lvl := lvl + 1;
  end loop;
  return lvl;
end $$;

create function public._sg_friend_code()
returns text language plpgsql volatile set search_path = public, pg_temp as $$
declare letters constant text := 'ABCDEFGHJKLMNPQRSTUVWXYZ'; code text; i int;
begin
  loop
    code := '';
    for i in 1..4 loop code := code || substr(letters, 1 + floor(random() * 24)::int, 1); end loop;
    code := code || '-' || lpad(floor(random() * 10000)::int::text, 4, '0');
    exit when not exists (select 1 from public.player_profiles where friend_code = code);
  end loop;
  return code;
end $$;

create function public._sg_uid()
returns uuid language plpgsql stable set search_path = public, pg_temp as $$
begin
  if auth.uid() is null then raise exception 'Iniciá sesión primero' using errcode = '28000'; end if;
  return auth.uid();
end $$;

-- Candado de transacción por par de usuarios: send/respond/remove sobre el mismo par se serializan.
create function public._sg_pair_lock(a uuid, b uuid)
returns void language sql volatile set search_path = public, pg_temp as $$
  select pg_advisory_xact_lock(hashtextextended(least(a, b)::text || greatest(a, b)::text, 0))
$$;

-- ------------------------------------------------------------------ perfil
-- Crea el perfil si no existe y actualiza nombre/avatar. Devuelve el código de amigo.
create function public.ensure_profile(p_name text, p_avatar text)
returns text language plpgsql security definer set search_path = public, pg_temp as $$
declare uid uuid := public._sg_uid(); nm text; code text;
begin
  nm := nullif(left(btrim(coalesce(p_name, '')), 24), '');
  update public.player_profiles
     set display_name = coalesce(nm, display_name),
         avatar_url = coalesce(left(nullif(p_avatar, ''), 500), avatar_url),
         last_seen = now()
   where user_id = uid
  returning friend_code into code;
  if code is null then
    loop
      begin
        insert into public.player_profiles (user_id, friend_code, display_name, avatar_url, last_seen)
        values (uid, public._sg_friend_code(), coalesce(nm, 'Comandante'), left(nullif(p_avatar, ''), 500), now())
        returning friend_code into code;
        exit;
      exception when unique_violation then
        -- carrera con otra pestaña (mismo user_id) o código repetido: reintentar / leer
        select friend_code into code from public.player_profiles where user_id = uid;
        exit when code is not null;
      end;
    end loop;
  end if;
  return code;
end $$;

-- Fusiona el perfil local con el de la nube (decisión de Luis: se queda lo mejor de cada uno).
-- Máximo en contadores, unión en desbloqueos, máximo por clave en récords; los cosméticos
-- equipados los decide el cliente (el último cambio gana). Nunca guarda Cristales.
create function public.merge_profile(p jsonb)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare uid uuid := public._sg_uid(); cloud jsonb; merged jsonb; cos_p jsonb; cos_c jsonb;
begin
  if p is null or jsonb_typeof(p) <> 'object' then raise exception 'Perfil inválido'; end if;
  if octet_length(p::text) > 65536 then raise exception 'Perfil demasiado grande'; end if;

  select data into cloud from public.player_profiles where user_id = uid for update;
  if not found then raise exception 'Perfil no creado (llamá a ensure_profile)'; end if;

  cos_p := case when jsonb_typeof(p -> 'cosmetics') = 'object' then p -> 'cosmetics' else '{}'::jsonb end;
  cos_c := case when jsonb_typeof(cloud -> 'cosmetics') = 'object' then cloud -> 'cosmetics' else '{}'::jsonb end;

  merged := jsonb_build_object(
    'v', 1,
    'xp',            greatest(public._sg_num(p, 'xp', 100000000),     public._sg_num(cloud, 'xp', 100000000)),
    'scrap',         greatest(public._sg_num(p, 'scrap', 100000000),  public._sg_num(cloud, 'scrap', 100000000)),
    'sectorUnlocked', greatest(1, public._sg_num(p, 'sectorUnlocked', 50), public._sg_num(cloud, 'sectorUnlocked', 50)),
    'maxSectorWon',  greatest(public._sg_num(p, 'maxSectorWon', 50),  public._sg_num(cloud, 'maxSectorWon', 50)),
    'research',      public._sg_union(p -> 'research', cloud -> 'research'),
    'arsenal',       public._sg_union(p -> 'arsenal', cloud -> 'arsenal'),
    'bestWave',      public._sg_max_obj(p -> 'bestWave', cloud -> 'bestWave', 1000),
    'stats',         public._sg_max_obj(p -> 'stats', cloud -> 'stats', 1000000000000),
    'cosmetics', jsonb_build_object(
      'owned', public._sg_union(cos_p -> 'owned', cos_c -> 'owned'),
      'equipped', case when cos_p ? 'equipped' then public._sg_str_obj(cos_p -> 'equipped')
                       else public._sg_str_obj(cos_c -> 'equipped') end
    )
  );

  update public.player_profiles
     set data = merged,
         level = public._sg_level((merged ->> 'xp')::numeric),
         stats = merged -> 'stats',
         updated_at = now(),
         last_seen = now()
   where user_id = uid;
  return merged;
end $$;

create function public.touch_presence()
returns void language sql security definer set search_path = public, pg_temp as $$
  update public.player_profiles set last_seen = now() where user_id = public._sg_uid()
$$;

-- ------------------------------------------------------------------ amigos
-- Devuelve 'pending' (solicitud enviada), 'accepted' (el otro ya me había pedido → quedamos
-- amigos) o 'already' (ya éramos amigos o ya había una solicitud mía).
create function public.send_friend_request(p_code text)
returns text language plpgsql security definer set search_path = public, pg_temp as $$
declare uid uuid := public._sg_uid(); target uuid; st text; win timestamptz; cnt int;
begin
  select user_id into target from public.player_profiles where friend_code = upper(btrim(coalesce(p_code, '')));
  if target is null then raise exception 'Código no encontrado'; end if;
  if target = uid then raise exception 'Ese es tu propio código'; end if;

  -- Serializa solicitudes del mismo par: dos pedidos recíprocos simultáneos quedan amigos.
  perform public._sg_pair_lock(uid, target);

  select status into st from public.friendships where requester = target and addressee = uid;
  if st = 'pending' then
    update public.friendships set status = 'accepted'
     where requester = target and addressee = uid and status = 'pending';
    if found then return 'accepted'; end if;
  elsif st = 'accepted' then
    return 'already';
  end if;
  if exists (select 1 from public.friendships where requester = uid and addressee = target) then
    return 'already';
  end if;

  -- Anti-spam (códigos adivinables): máximo 20 intentos por hora. El contador vive en el perfil
  -- propio y no baja al cancelar, así que borrar y reenviar no lo evade.
  select req_window, req_count into win, cnt from public.player_profiles where user_id = uid for update;
  if win is null then raise exception 'Perfil no creado (llamá a ensure_profile)'; end if;
  if win < now() - interval '1 hour' then win := now(); cnt := 0; end if;
  if cnt >= 20 then raise exception 'Demasiadas solicitudes: probá más tarde'; end if;
  update public.player_profiles set req_window = win, req_count = cnt + 1 where user_id = uid;

  insert into public.friendships (requester, addressee) values (uid, target);
  return 'pending';
end $$;

create function public.respond_friend_request(p_other uuid, p_accept boolean)
returns void language plpgsql security definer set search_path = public, pg_temp as $$
declare uid uuid := public._sg_uid();
begin
  perform public._sg_pair_lock(uid, p_other);
  if p_accept then
    update public.friendships set status = 'accepted'
     where requester = p_other and addressee = uid and status = 'pending';
  else
    delete from public.friendships
     where requester = p_other and addressee = uid and status = 'pending';
  end if;
end $$;

create function public.remove_friend(p_other uuid)
returns void language plpgsql security definer set search_path = public, pg_temp as $$
declare uid uuid := public._sg_uid();
begin
  perform public._sg_pair_lock(uid, p_other);
  delete from public.friendships
   where (requester = uid and addressee = p_other) or (requester = p_other and addressee = uid);
end $$;

-- Mis vínculos: amigos aceptados (con nivel, estadísticas y en línea) y solicitudes pendientes
-- (entrantes/salientes: solo nombre, avatar y código).
create function public.list_friends()
returns table (
  user_id uuid, display_name text, avatar_url text, friend_code text, level integer,
  stats jsonb, online boolean, status text, direction text
) language sql stable security definer set search_path = public, pg_temp as $$
  select pp.user_id, pp.display_name,
         case when f.status = 'accepted' or f.requester <> public._sg_uid() then pp.avatar_url end,
         pp.friend_code,
         case when f.status = 'accepted' then pp.level end,
         case when f.status = 'accepted' then pp.stats end,
         case when f.status = 'accepted' then coalesce(pp.last_seen > now() - interval '2 minutes', false) else false end,
         f.status,
         case when f.requester = public._sg_uid() then 'out' else 'in' end
    from public.friendships f
    join public.player_profiles pp
      on pp.user_id = case when f.requester = public._sg_uid() then f.addressee else f.requester end
   where public._sg_uid() in (f.requester, f.addressee)
   order by f.status, pp.last_seen desc nulls last
$$;

-- Invita a un amigo aceptado a mi sala multijugador (máximo 1 por amigo cada 30 s).
create function public.invite_to_room(p_friend uuid, p_room text)
returns void language plpgsql security definer set search_path = public, pg_temp as $$
declare uid uuid := public._sg_uid(); code text := upper(btrim(coalesce(p_room, '')));
begin
  if code !~ '^[A-Z0-9]{4,8}$' then raise exception 'Código de sala inválido'; end if;
  if not exists (
    select 1 from public.friendships
     where status = 'accepted'
       and ((requester = uid and addressee = p_friend) or (requester = p_friend and addressee = uid))
  ) then
    raise exception 'Solo podés invitar a tus amigos';
  end if;
  -- Serializa las invitaciones del mismo emisor (bloquea su fila de perfil) para que el
  -- límite de 30 s no se evada con llamadas simultáneas.
  perform 1 from public.player_profiles where user_id = uid for update;
  if exists (select 1 from public.room_invites
              where from_user = uid and to_user = p_friend and created_at > now() - interval '30 seconds') then
    raise exception 'Esperá unos segundos antes de volver a invitar';
  end if;
  insert into public.room_invites (from_user, to_user, room_code) values (uid, p_friend, code);
end $$;

-- ------------------------------------------------------------------ permisos de funciones
revoke all on function
  public._sg_num(jsonb, text, numeric), public._sg_union(jsonb, jsonb), public._sg_max_obj(jsonb, jsonb, numeric),
  public._sg_str_obj(jsonb), public._sg_level(numeric), public._sg_friend_code(), public._sg_uid(),
  public._sg_pair_lock(uuid, uuid),
  public.ensure_profile(text, text), public.merge_profile(jsonb), public.touch_presence(),
  public.send_friend_request(text), public.respond_friend_request(uuid, boolean), public.remove_friend(uuid),
  public.list_friends(), public.invite_to_room(uuid, text)
from public, anon, authenticated;

grant execute on function
  public.ensure_profile(text, text), public.merge_profile(jsonb), public.touch_presence(),
  public.send_friend_request(text), public.respond_friend_request(uuid, boolean), public.remove_friend(uuid),
  public.list_friends(), public.invite_to_room(uuid, text)
to authenticated;
