-- Fase 12 (fix): la Chatarra se GASTA, así que fusionarla siempre con el máximo la devolvía
-- después de cada compra (500 en la nube, gastás 300 → 200 local → max = 500 otra vez).
-- Ahora el máximo solo se usa en la primera fusión de la sesión (juntar progreso de invitado con
-- la cuenta); en las sincronizaciones siguientes manda el valor del dispositivo.
-- XP, sectores y estadísticas solo crecen: siguen con máximo. Desbloqueos: siguen con unión.

drop function if exists public.merge_profile(jsonb);

create function public.merge_profile(p jsonb, p_initial boolean default false)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare uid uuid := public._sg_uid(); cloud jsonb; merged jsonb; cos_p jsonb; cos_c jsonb; scrap numeric;
begin
  if p is null or jsonb_typeof(p) <> 'object' then raise exception 'Perfil inválido'; end if;
  if octet_length(p::text) > 65536 then raise exception 'Perfil demasiado grande'; end if;

  select data into cloud from public.player_profiles where user_id = uid for update;
  if not found then raise exception 'Perfil no creado (llamá a ensure_profile)'; end if;

  cos_p := case when jsonb_typeof(p -> 'cosmetics') = 'object' then p -> 'cosmetics' else '{}'::jsonb end;
  cos_c := case when jsonb_typeof(cloud -> 'cosmetics') = 'object' then cloud -> 'cosmetics' else '{}'::jsonb end;

  scrap := case when p_initial
                then greatest(public._sg_num(p, 'scrap', 100000000), public._sg_num(cloud, 'scrap', 100000000))
                else public._sg_num(p, 'scrap', 100000000) end;

  merged := jsonb_build_object(
    'v', 1,
    'xp',            greatest(public._sg_num(p, 'xp', 100000000),     public._sg_num(cloud, 'xp', 100000000)),
    'scrap',         scrap,
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

revoke all on function public.merge_profile(jsonb, boolean) from public, anon, authenticated;
grant execute on function public.merge_profile(jsonb, boolean) to authenticated;
