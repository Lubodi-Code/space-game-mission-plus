-- Revierte 003: vuelve a merge_profile(jsonb) de 002 (Chatarra con máximo siempre).
-- Para restaurarla, volvé a ejecutar el bloque "create function public.merge_profile(p jsonb)" y sus
-- permisos de 002_social.sql después de este drop.
drop function if exists public.merge_profile(jsonb, boolean);
