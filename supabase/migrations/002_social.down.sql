-- Revierte 002_social.sql (borra perfiles en la nube, amistades e invitaciones).
alter publication supabase_realtime drop table public.room_invites;

drop function if exists public.invite_to_room(uuid, text);
drop function if exists public.list_friends();
drop function if exists public.remove_friend(uuid);
drop function if exists public.respond_friend_request(uuid, boolean);
drop function if exists public.send_friend_request(text);
drop function if exists public.touch_presence();
drop function if exists public.merge_profile(jsonb);
drop function if exists public.ensure_profile(text, text);
drop function if exists public._sg_pair_lock(uuid, uuid);
drop function if exists public._sg_uid();
drop function if exists public._sg_friend_code();
drop function if exists public._sg_level(numeric);
drop function if exists public._sg_str_obj(jsonb);
drop function if exists public._sg_max_obj(jsonb, jsonb, numeric);
drop function if exists public._sg_union(jsonb, jsonb);
drop function if exists public._sg_num(jsonb, text, numeric);

drop table if exists public.room_invites;
drop table if exists public.friendships;
drop table if exists public.player_profiles;
