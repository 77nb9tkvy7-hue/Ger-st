-- Tägliche Sicherung der Gerüst-App (einmalig im Supabase SQL Editor ausführen)
-- --------------------------------------------------------------------------
-- Jede Nacht um 02:00 UTC (03:00/04:00 deutscher Zeit) wird der komplette
-- Datensatz (app_state, key 'shopfloor-data-v2') in die Tabelle
-- app_state_backup kopiert. Sicherungen älter als 30 Tage werden gelöscht.
-- Die Tabelle ist für die App NICHT lesbar (Zugriffsschutz an, keine Regeln),
-- nur im Supabase-Dashboard (Table Editor) sichtbar.
-- Nicht gesichert: LKW-Standorte (absichtlich kein Verlauf) und Baupläne-
-- Dateien (liegen im Storage, nur die Liste der Pläne ist im Datensatz).

create extension if not exists pg_cron with schema pg_catalog;

create table if not exists public.app_state_backup (
  id         bigserial primary key,
  created_at timestamptz not null default now(),
  key        text  not null,
  value      jsonb not null
);
alter table public.app_state_backup enable row level security;

create or replace function public.backup_app_state() returns void
language sql security definer set search_path = public as $$
  insert into public.app_state_backup (key, value)
    select key, value from public.app_state where key = 'shopfloor-data-v2';
  delete from public.app_state_backup where created_at < now() - interval '30 days';
$$;
revoke execute on function public.backup_app_state() from public, anon, authenticated;

select cron.schedule('app-state-backup', '0 2 * * *', 'select public.backup_app_state()');

-- erste Sicherung sofort
select public.backup_app_state();

-- ---------------------------------------------------------------------------
-- WIEDERHERSTELLEN (nur im Notfall, Datum anpassen):
--   Sicherungen ansehen:
--     select id, created_at from public.app_state_backup order by created_at desc;
--   Stand einer Sicherung zurückspielen (id aus der Liste oben):
--     update public.app_state
--        set value = (select value from public.app_state_backup where id = 123)
--                    || jsonb_build_object('rev', coalesce((value->>'rev')::int, 0) + 1)
--      where key = 'shopfloor-data-v2';
--   (rev wird hochgezählt, damit offene Apps den neuen Stand sauber übernehmen)
