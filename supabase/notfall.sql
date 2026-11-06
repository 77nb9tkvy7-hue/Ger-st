-- Notfall: Passwort vergessen, und in der App kann niemand helfen
-- ------------------------------------------------------------------
-- Normalfall (KEIN SQL nötig):
--   * Mitarbeiter vergisst sein Passwort -> der Chef öffnet in der App den
--     Reiter "Personal" und tippt bei der Person auf "Neues Passwort erzeugen".
--   * Jeder kann sein eigenes Passwort ändern: Menü ☰ -> "Mein Passwort ändern".
--
-- Nur wenn KEIN Chef mehr in die App kommt, im Supabase-Dashboard unter
-- "SQL Editor" den passenden Block ausführen (Name/Passwort anpassen).

-- A) Neues Passwort für eine Person setzen (z. B. die Chefin hat ihres vergessen).
--    'Chefin' = Name wie in der App, '1234' = neues Passwort (mind. 4 Zeichen).
--    Das 'sgm#' davor NICHT ändern (das hängt die App intern vor jedes Passwort).
update auth.users
   set encrypted_password = extensions.crypt('sgm#' || '1234', extensions.gen_salt('bf')),
       updated_at = now()
 where raw_app_meta_data->>'name' = 'Chefin';
-- Danach muss "UPDATE 1" erscheinen. "UPDATE 0" = Name falsch geschrieben.

-- B) Chef-Passwort vergessen (die zweite Abfrage beim Wechsel in die Rolle Chef).
--    Löscht es; das nächste Chef-Passwort, das in der App eingegeben wird,
--    gilt dann als neues. Danach gleich in die Chef-Rolle gehen und eins setzen.
-- update public.app_state
--    set value = (value - 'chefPw') || jsonb_build_object('rev', coalesce((value->>'rev')::int, 0) + 1)
--  where key = 'shopfloor-data-v2';
