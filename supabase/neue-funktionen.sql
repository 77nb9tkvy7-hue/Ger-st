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

-- 3) Beweis-Fotos: privater Bucket 'fotos' ---------------------------------
-- Hochladen: jeder Angemeldete mit Rolle. Ändern: niemand (kein update).
-- Löschen: nur wer es hochgeladen hat und nur in den ersten 5 Minuten.
-- Lesen: Angemeldete mit Rolle (App holt zeitlich begrenzte Links).
insert into storage.buckets (id, name, public, file_size_limit)
values ('fotos', 'fotos', false, 5242880)
on conflict (id) do update set public = false, file_size_limit = 5242880;
drop policy if exists "fotos lesen" on storage.objects;
drop policy if exists "fotos hochladen" on storage.objects;
drop policy if exists "fotos loeschen 5 min" on storage.objects;
create policy "fotos lesen" on storage.objects for select to authenticated
  using (bucket_id = 'fotos' and public.jwt_has_role());
create policy "fotos hochladen" on storage.objects for insert to authenticated
  with check (bucket_id = 'fotos' and public.jwt_has_role());
create policy "fotos loeschen 5 min" on storage.objects for delete to authenticated
  using (bucket_id = 'fotos' and owner = auth.uid() and created_at > now() - interval '5 minutes');
