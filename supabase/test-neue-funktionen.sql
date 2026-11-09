-- Test für supabase/neue-funktionen.sql gegen ein LOKALES Postgres (nicht Supabase!).
-- Aufruf: Abschnitt 3 (Storage) aus neue-funktionen.sql entfernen, Pfad unten anpassen, dann
--   psql -d <testdb> -f supabase/test-neue-funktionen.sql   (löscht das Schema public der Test-DB!)
\set ON_ERROR_STOP 1
drop schema if exists public cascade; create schema public;
do $$ begin create role authenticated; exception when others then null; end $$; do $$ begin create role anon; exception when others then null; end $$;
create table public.app_state(key text primary key, value jsonb);
create function public.jwt_name() returns text language sql stable as $$ select current_setting('t.name', true) $$;
create function public.jwt_is_chef() returns boolean language sql stable as $$ select current_setting('t.chef', true) = '1' $$;
create function public.jwt_has_role() returns boolean language sql stable as $$ select coalesce(current_setting('t.name', true),'') <> '' $$;
insert into public.app_state values ('shopfloor-data-v2', '{"employees":[{"id":1,"name":"Max","roles":["baustelle"]},{"id":2,"name":"Jochen","roles":["lager"]},{"id":3,"name":"Kemal","roles":["baustelle"]},{"id":4,"name":"Chefin","roles":["chef"]}],"projects":[{"id":101,"abgerechnetAm":"2024-01-01"},{"id":102,"name":"Geheim","freigabeToken":"abc123","pruefungen":[{"ergebnis":"gesperrt","datum":"2026-11-01","by":"Max"},{"ergebnis":"frei","datum":"2026-11-08","by":"Max"}]}]}');
-- wie Supabase: neue Funktionen bekommen automatisch execute für anon + authenticated
alter default privileges in schema public grant execute on functions to anon, authenticated;
\i neue-funktionen-ohne-storage.sql
-- C1: interne Funktionen für niemanden aufrufbar, geschützte nicht ohne Anmeldung
select 'rechte', has_function_privilege('anon','public.prot_team(text)','execute') as anon_team,
  has_function_privilege('authenticated','public.prot_team(text)','execute') as auth_team,
  has_function_privilege('anon','public.zeit_cleanup()','execute') as anon_clean,
  has_function_privilege('authenticated','public.zeit_cleanup()','execute') as auth_clean,
  has_function_privilege('anon','public.prot_read(text)','execute') as anon_read,
  has_function_privilege('anon','public.prot_upsert(text,jsonb)','execute') as anon_ups,
  has_function_privilege('anon','public.kolonne_set(text,jsonb)','execute') as anon_kset,
  has_function_privilege('anon','public.kolonne_get()','execute') as anon_kget;
do $$ begin
  if has_function_privilege('anon','public.prot_team(text)','execute') or has_function_privilege('authenticated','public.prot_team(text)','execute')
     or has_function_privilege('anon','public.zeit_cleanup()','execute') or has_function_privilege('authenticated','public.zeit_cleanup()','execute')
     or has_function_privilege('anon','public.prot_read(text)','execute') or has_function_privilege('anon','public.prot_upsert(text,jsonb)','execute')
     or has_function_privilege('anon','public.kolonne_set(text,jsonb)','execute') or has_function_privilege('anon','public.kolonne_get()','execute')
  then raise exception 'C1: Rechte zu weit'; end if;
end $$;
-- login_lookup
select 'lookup', public.login_lookup('  max '), public.login_lookup('Mox'), public.public_info();
-- Kolonnen: nur Chef setzt
select set_config('t.name','Max',false), set_config('t.chef','0',false);
select 'max kolonne_set', public.kolonne_set('Max', '["Kemal"]');
select set_config('t.name','Chefin',false), set_config('t.chef','1',false);
select 'chef kolonne_set', public.kolonne_set('Max', '["Kemal"]');
-- als Max
select set_config('t.name','Max',false), set_config('t.chef','0',false);
select 'max own', public.prot_upsert('zeit:2026-11', '{"id":"a","person":"Max","projekt":102,"in":"1999-01-01T00:00:00Z"}');
select 'max team', public.prot_upsert('zeit:2026-11', '{"id":"b","person":"Kemal","projekt":102,"in":"x"}');
select 'max foreign', public.prot_upsert('zeit:2026-11', '{"id":"c","person":"Jochen","projekt":102,"in":"x"}');
select 'max korr', public.prot_upsert('zeit:2026-11', '{"id":"a","person":"Max","korr":{"in":"x"}}');
select 'max out', public.prot_upsert('zeit:2026-11', '{"id":"a","person":"Max","out":"1999-01-01T00:00:00Z"}');
-- I8: eigene Einträge nachträglich nur auschecken (out/outPos), sonst nichts ändern
select 'max rewrite', public.prot_upsert('zeit:2026-11', '{"id":"a","person":"Max","projekt":999,"in":"2000-01-01T00:00:00Z","out":"x","outPos":{"lat":1}}');
do $$ declare e jsonb; begin
  select x into e from public.app_state a, jsonb_array_elements(a.value->'entries') x where a.key='zeit:2026-11' and x->>'id'='a';
  if (e->>'projekt')::int <> 102 or e->>'in' = '2000-01-01T00:00:00Z' or e->'outPos' is null then raise exception 'I8: Eintrag umgeschrieben: %', e; end if;
end $$;
do $$ begin if public.prot_upsert('zeit:2026-11', jsonb_build_object('id','big','person','Max','notiz', repeat('x', 5000))) then raise exception 'I8: zu großer Eintrag angenommen'; end if; end $$;
select 'server time', (value->'entries'->0->>'in') <> '1999-01-01T00:00:00Z', (value->'entries'->0->>'out') is not null from public.app_state where key='zeit:2026-11';
select 'bad key', public.prot_upsert('shopfloor-data-v2', '{"id":"z","person":"Max"}');
-- als Jochen: liest nur eigene (keine)
select set_config('t.name','Jochen',false);
select 'jochen read', public.prot_read('zeit:');
-- als Chef
select set_config('t.name','Chefin',false), set_config('t.chef','1',false);
select 'chef korr', public.prot_upsert('zeit:2026-11', '{"id":"a","person":"Max","korr":{"in":"2026-11-08T07:00:00Z","by":"Chefin"}}');
select 'chef write old project', public.prot_upsert('zeit:2023-06', '{"id":"o","person":"Max","projekt":101,"in":"2023-06-01T07:00:00Z"}');
select 'chef read', jsonb_array_length((public.prot_read('zeit:')->0)->'entries') + jsonb_array_length((public.prot_read('zeit:')->1)->'entries');
-- I1: Aufräumen aus der App nur für den Chef
select set_config('t.name','Max',false), set_config('t.chef','0',false);
do $$ begin if public.zeit_cleanup_now() is not null then raise exception 'I1: Nicht-Chef darf aufräumen'; end if; end $$;
select set_config('t.name','Chefin',false), set_config('t.chef','1',false);
do $$ begin if not has_function_privilege('authenticated','public.zeit_cleanup_now()','execute') or has_function_privilege('anon','public.zeit_cleanup_now()','execute') then raise exception 'I1: Rechte zeit_cleanup_now'; end if; end $$;
select 'cleanup', public.zeit_cleanup_now();
select 'after cleanup', key, jsonb_array_length(value->'entries') from public.app_state where key like 'zeit:%' order by key;
-- als Max: liest eigene + Kolonne
select set_config('t.name','Max',false), set_config('t.chef','0',false);
select 'max kolonne_get', public.kolonne_get();
select 'max read persons', (select string_agg(x->>'person', ',' order by x->>'person') from jsonb_array_elements(public.prot_read('zeit:2026')->0->'entries') x);

-- Freigabe öffentlich: nur bv/ergebnis/datum
select 'freigabe', public.freigabe_info('abc123'), public.freigabe_info('falsch'), public.freigabe_info('');
-- angezeigte Nummer (nr) statt interner id
update public.app_state set value = jsonb_set(value, '{projects,1,nr}', '"2026-17"') where key = 'shopfloor-data-v2';
do $$ begin if public.freigabe_info('abc123') ->> 'bv' <> '2026-17' then raise exception 'freigabe zeigt nicht nr: %', public.freigabe_info('abc123'); end if; end $$;
select 'freigabe nr', public.freigabe_info('abc123');
