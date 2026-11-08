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

-- 4) Geschützte Zeilen für Personen-Daten ------------------------------------
-- 'zeit:<JJJJ-MM>' (Einchecken/Stunden) und 'unterweisung:<id>' (Bestätigungen)
-- liegen als eigene Zeilen in app_state, Inhalt {entries:[{id, person, …}]}.
-- Die Tabellen-Regeln aus security.sql erlauben Clients KEINEN direkten Zugriff
-- auf diese Schlüssel; gelesen/geschrieben wird nur über diese Funktionen:
--   Chef: alles. Alle anderen: nur eigene Einträge + die ihrer Kolonne
--   (employees[].kolonne = Namen), keine Korrekturen ('korr'), und Ein-/Auscheck-
--   Zeiten setzt der Server (now()), nicht das Handy.
-- Kolonnen liegen in der eigenen Zeile 'kolonnen' = {"<Kolonnenführer>": ["Name", …]}
-- (NICHT im großen Datensatz – den dürfen alle mit Rolle ändern, sonst könnte sich
-- jemand selbst zum Kolonnenführer machen und fremde Stunden lesen). Ändern nur Chef.
create or replace function public.prot_team(me text) returns jsonb
language sql stable security definer set search_path = public as $$
  select coalesce((select value -> me from public.app_state where key = 'kolonnen'), '[]'::jsonb)
$$;
revoke all on function public.prot_team(text) from public;

create or replace function public.kolonne_get() returns jsonb
language sql stable security definer set search_path = public as $$
  select case when not public.jwt_has_role() then '{}'::jsonb
              when public.jwt_is_chef() then coalesce((select value from public.app_state where key = 'kolonnen'), '{}'::jsonb)
              else coalesce((select jsonb_build_object(public.jwt_name(), value -> public.jwt_name()) from public.app_state
                             where key = 'kolonnen' and value ? public.jwt_name()), '{}'::jsonb) end
$$;
revoke all on function public.kolonne_get() from public;
grant execute on function public.kolonne_get() to authenticated;

create or replace function public.kolonne_set(p_name text, p_members jsonb) returns boolean
language plpgsql security definer set search_path = public as $$
begin
  if not public.jwt_is_chef() or coalesce(p_name, '') = '' or jsonb_typeof(p_members) <> 'array' then return false; end if;
  insert into public.app_state(key, value) values ('kolonnen', '{}'::jsonb) on conflict (key) do nothing;
  update public.app_state set value = case when jsonb_array_length(p_members) = 0 then value - p_name
                                           else jsonb_set(value, array[p_name], p_members) end
   where key = 'kolonnen';
  return true;
end $$;
revoke all on function public.kolonne_set(text, jsonb) from public;
grant execute on function public.kolonne_set(text, jsonb) to authenticated;

create or replace function public.prot_read(p_prefix text) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare me text := public.jwt_name(); chef boolean := public.jwt_is_chef(); team jsonb := public.prot_team(public.jwt_name());
begin
  if not public.jwt_has_role() or p_prefix !~ '^(zeit|unterweisung):' then return '[]'::jsonb; end if;
  return coalesce((select jsonb_agg(jsonb_build_object('key', a.key, 'entries',
      coalesce((select jsonb_agg(x) from jsonb_array_elements(coalesce(a.value -> 'entries', '[]'::jsonb)) x
                where chef or x ->> 'person' = me or team ? (x ->> 'person')), '[]'::jsonb)))
    from public.app_state a where a.key like p_prefix || '%' and a.key ~ '^(zeit|unterweisung):'), '[]'::jsonb);
end $$;
revoke all on function public.prot_read(text) from public;
grant execute on function public.prot_read(text) to authenticated;

create or replace function public.prot_upsert(p_key text, p_entry jsonb) returns boolean
language plpgsql security definer set search_path = public as $$
declare me text := public.jwt_name(); chef boolean := public.jwt_is_chef(); team jsonb := public.prot_team(public.jwt_name());
        cur jsonb; idx int; old jsonb;
        stamp text := to_char(now() at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS"Z"');
begin
  if not public.jwt_has_role() then return false; end if;
  if p_key !~ '^(zeit:[0-9]{4}-[0-9]{2}|unterweisung:[0-9]+)$' or p_entry ->> 'id' is null or p_entry ->> 'person' is null then return false; end if;
  if not chef then
    if not (p_entry ->> 'person' = me or team ? (p_entry ->> 'person')) or p_entry ? 'korr' then return false; end if;
    if p_entry ? 'in'  then p_entry := jsonb_set(p_entry, '{in}',  to_jsonb(stamp)); end if;
    if p_entry ? 'out' then p_entry := jsonb_set(p_entry, '{out}', to_jsonb(stamp)); end if;
    if p_entry ? 'ts'  then p_entry := jsonb_set(p_entry, '{ts}',  to_jsonb(stamp)); end if;
  end if;
  insert into public.app_state(key, value) values (p_key, '{"entries":[]}'::jsonb) on conflict (key) do nothing;
  select value into cur from public.app_state where key = p_key for update;
  select t.i - 1, t.x into idx, old from jsonb_array_elements(coalesce(cur -> 'entries', '[]'::jsonb)) with ordinality t(x, i)
    where t.x ->> 'id' = p_entry ->> 'id' limit 1;
  if idx is not null then
    if not chef and not (old ->> 'person' = me or team ? (old ->> 'person')) then return false; end if;
    cur := jsonb_set(cur, array['entries', idx::text], old || p_entry);
  else
    cur := jsonb_set(cur, '{entries}', coalesce(cur -> 'entries', '[]'::jsonb) || jsonb_build_array(p_entry));
  end if;
  update public.app_state set value = cur where key = p_key;
  return true;
end $$;
revoke all on function public.prot_upsert(text, jsonb) from public;
grant execute on function public.prot_upsert(text, jsonb) to authenticated;

-- 5) Speicherdauer: Einchecken-Daten 12 Monate nach Abrechnung des BV löschen
-- (BV-Feld abgerechnetAm, ISO-Datum). Täglich per pg_cron, wie backup.sql:
--   select cron.schedule('zeit-cleanup', '30 2 * * *', 'select public.zeit_cleanup()');
create or replace function public.zeit_cleanup() returns integer
language plpgsql security definer set search_path = public as $$
declare n int := 0; r record; kept jsonb;
begin
  for r in select key, value from public.app_state where key like 'zeit:%' for update loop
    select coalesce(jsonb_agg(x), '[]'::jsonb) into kept from jsonb_array_elements(coalesce(r.value -> 'entries', '[]'::jsonb)) x
      where not exists (select 1 from public.app_state s, jsonb_array_elements(coalesce(s.value -> 'projects', '[]'::jsonb)) p
        where s.key = 'shopfloor-data-v2' and (p ->> 'id') = (x ->> 'projekt')
          and coalesce(p ->> 'abgerechnetAm', '') <> '' and (p ->> 'abgerechnetAm')::date + interval '12 months' < now());
    n := n + jsonb_array_length(coalesce(r.value -> 'entries', '[]'::jsonb)) - jsonb_array_length(kept);
    update public.app_state set value = jsonb_set(value, '{entries}', kept) where key = r.key;
  end loop;
  return n;
end $$;
revoke all on function public.zeit_cleanup() from public;
