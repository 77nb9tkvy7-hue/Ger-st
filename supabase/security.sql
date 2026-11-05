-- Sicherheit der Gerüst-App: Zugriff nur noch für angemeldete Mitarbeiter
-- -------------------------------------------------------------------------
-- Einmalig im Supabase SQL Editor ausführen -- ERST NACHDEM die echte
-- Anmeldung eingerichtet ist (Funktion manage-users deployt, Konten über
-- "bootstrap" angelegt und die neue App-Version online). Danach gilt:
--  * Ohne Anmeldung (öffentlicher Anon-Key) gibt die Datenbank NICHTS mehr
--    heraus und lässt nichts mehr ändern. Ausnahme: public_info() unten
--    (Namensliste für die Anmeldung + die frei einsehbaren Kalender).
--  * Angemeldete Mitarbeiter lesen/ändern den gemeinsamen Datensatz.
--  * LKW-Standorte (Zeilen shopfloor-pos:<Name>): jeder Fahrer nur seine
--    eigene Zeile, LESEN darf alle nur der Chef.
--  * Baupläne: Dateien nur noch für angemeldete Mitarbeiter (die App holt
--    sich zeitlich begrenzte Links).
-- Wer Chef ist und wie jemand heißt, steht im Anmelde-Token
-- (app_metadata, nur vom Server über manage-users änderbar).
-- Mehrfaches Ausführen schadet nicht.

-- 1) Haupt-Tabelle ----------------------------------------------------------
alter table public.app_state enable row level security;

do $$ declare r record; begin
  for r in select policyname from pg_policies where schemaname = 'public' and tablename = 'app_state' loop
    execute format('drop policy %I on public.app_state', r.policyname);
  end loop;
end $$;

revoke all on public.app_state from anon;
grant select, insert, update on public.app_state to authenticated;

create or replace function public.jwt_name() returns text
language sql stable as $$ select coalesce(auth.jwt() -> 'app_metadata' ->> 'name', '') $$;
create or replace function public.jwt_is_chef() returns boolean
language sql stable as $$ select coalesce((auth.jwt() -> 'app_metadata' -> 'roles') ? 'chef', false) $$;
-- Mindestens eine Rolle (wer keine mehr hat, kommt an nichts mehr heran)
create or replace function public.jwt_has_role() returns boolean
language sql stable as $$
  select coalesce(jsonb_typeof(auth.jwt() -> 'app_metadata' -> 'roles') = 'array'
                  and jsonb_array_length(auth.jwt() -> 'app_metadata' -> 'roles') > 0, false) $$;

create policy "app lesen" on public.app_state for select to authenticated
  using (public.jwt_has_role() and (key = 'shopfloor-data-v2'
         or (key like 'shopfloor-pos:%' and (public.jwt_is_chef() or key = 'shopfloor-pos:' || public.jwt_name()))));
create policy "app aendern" on public.app_state for update to authenticated
  using      (public.jwt_has_role() and (key = 'shopfloor-data-v2' or key = 'shopfloor-pos:' || public.jwt_name()))
  with check (public.jwt_has_role() and (key = 'shopfloor-data-v2' or key = 'shopfloor-pos:' || public.jwt_name()));
create policy "app anlegen" on public.app_state for insert to authenticated
  with check (public.jwt_has_role() and key = 'shopfloor-pos:' || public.jwt_name());

-- 2) Öffentlich: Namen für die Anmeldung + Kalender (ohne Passwörter usw.) --
create or replace function public.public_info() returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'names', coalesce((select jsonb_agg(jsonb_build_object('id', e -> 'id', 'name', e -> 'name') order by e ->> 'name')
                       from jsonb_array_elements(coalesce(s.value -> 'employees', '[]'::jsonb)) e), '[]'::jsonb),
    'calendarEntries', coalesce(s.value -> 'calendarEntries', '[]'::jsonb),
    'lkwEntries',      coalesce(s.value -> 'lkwEntries', '[]'::jsonb),
    'projects', coalesce((select jsonb_agg(jsonb_build_object('id', p -> 'id', 'name', p -> 'name', 'adresse', p -> 'adresse',
                                                              'farbe', p -> 'farbe', 'aktiv', p -> 'aktiv'))
                          from jsonb_array_elements(coalesce(s.value -> 'projects', '[]'::jsonb)) p), '[]'::jsonb))
  from public.app_state s where s.key = 'shopfloor-data-v2'
$$;
revoke all on function public.public_info() from public;
grant execute on function public.public_info() to anon, authenticated;

-- 3) Baupläne: nur noch für Angemeldete ------------------------------------
update storage.buckets set public = false where id = 'bauplaene';
drop policy if exists "bauplaene lesen" on storage.objects;
drop policy if exists "bauplaene hochladen" on storage.objects;
drop policy if exists "bauplaene loeschen" on storage.objects;
create policy "bauplaene lesen" on storage.objects for select to authenticated using (bucket_id = 'bauplaene' and public.jwt_has_role());
create policy "bauplaene hochladen" on storage.objects for insert to authenticated with check (bucket_id = 'bauplaene' and public.jwt_has_role());
create policy "bauplaene loeschen" on storage.objects for delete to authenticated using (bucket_id = 'bauplaene' and public.jwt_has_role());
