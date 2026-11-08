-- Neue Funktionen (Plan docs/plan-neue-funktionen.md) – Server-Teil.
-- NICHT automatisch ausgeführt. Bei der Übernahme ins Original einmal im
-- Supabase SQL Editor ausführen (nach supabase/security.sql). Wiederholbar.

-- 1) Anmeldung ohne öffentliche Namensliste ----------------------------------
-- Liefert zur eingetippten Person NUR die id (für die Anmelde-Adresse
-- ma<id>@mitarbeiter.sg-muc.de), keine Liste. Groß-/Kleinschreibung und
-- Leerzeichen am Rand egal. Unbekannter Name -> null.
create or replace function public.login_lookup(p_name text) returns integer
language sql stable security definer set search_path = public as $$
  select (e ->> 'id')::integer
  from public.app_state s, jsonb_array_elements(coalesce(s.value -> 'employees', '[]'::jsonb)) e
  where s.key = 'shopfloor-data-v2'
    and lower(trim(e ->> 'name')) = lower(trim(p_name))
  limit 1
$$;
revoke all on function public.login_lookup(text) from public;
grant execute on function public.login_lookup(text) to anon, authenticated;

-- 2) Ohne Anmeldung nichts Persönliches mehr (keine Namen, Kalender, Adressen)
create or replace function public.public_info() returns jsonb
language sql stable security definer set search_path = public as $$
  select '{}'::jsonb
$$;
revoke all on function public.public_info() from public;
grant execute on function public.public_info() to anon, authenticated;
