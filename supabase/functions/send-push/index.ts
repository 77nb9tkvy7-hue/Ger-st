// Supabase Edge Function "send-push" -- verschickt Push-Nachrichten an die
// Handys der Gerüst-Bestell-App.
//
// EINRICHTUNG (einmalig, im Supabase-Dashboard):
//  1. Edge Functions -> "Deploy a new function" -> "Via Editor",
//     Name: send-push, diesen Dateiinhalt einfügen, "Deploy".
//  2. Edge Functions -> Secrets: drei Einträge anlegen
//       VAPID_PUBLIC_KEY  = (öffentlicher Schlüssel, steht auch in der App
//                            als VAPID_PUBLIC_KEY)
//       VAPID_PRIVATE_KEY = (geheimer Schlüssel -- NIE ins Repo schreiben)
//       VAPID_SUBJECT     = mailto:<Firmen-E-Mail>
//  "Verify JWT" bleibt an: die App ruft die Funktion mit dem Anon-Key auf.
//
// Ablauf: Die App schickt {roles, names, exclude, msgs, url}. Die Funktion
// liest den gemeinsamen Datensatz (app_state / shopfloor-data-v2), sucht
// alle Push-Abos (pushSubs), deren Person eine der Rollen hat oder deren
// Name genannt ist (außer "exclude" = Absender), und schickt jedem den
// Text in der Sprache seines Handys (msgs[lang], Rückfall Deutsch).
// Antwort: {sent, gone} -- "gone" = abgelaufene Abos, die App löscht sie.

import webpush from "npm:web-push@3.6.7";
import { createClient } from "npm:@supabase/supabase-js@2";

const STORAGE_KEY = "shopfloor-data-v2";
const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });

type Sub = { endpoint: string; keys: { p256dh: string; auth: string }; name: string; lang?: string };
type Msg = { title: string; body: string };

// Secrets erst beim Aufruf prüfen (nicht beim Start), Leerzeichen/
// Zeilenumbrüche vom Einfügen im Dashboard entfernen und bei Fehlern
// genau sagen, welches Secret nicht stimmt -- sonst stürzt die Funktion
// nur mit "WORKER_ERROR" ab.
let vapidReady = false;
function setupVapid() {
  if (vapidReady) return;
  const clean = (n: string) => (Deno.env.get(n) ?? "").replace(/\s+/g, "");
  const pub = clean("VAPID_PUBLIC_KEY"), priv = clean("VAPID_PRIVATE_KEY");
  const subject = (Deno.env.get("VAPID_SUBJECT") ?? "").trim();
  if (!pub) throw new Error("Secret VAPID_PUBLIC_KEY fehlt");
  if (!priv) throw new Error("Secret VAPID_PRIVATE_KEY fehlt");
  if (!/^(mailto:\S+@\S+|https:\/\/\S+)$/.test(subject)) {
    throw new Error("Secret VAPID_SUBJECT muss so aussehen: mailto:name@firma.de");
  }
  try {
    webpush.setVapidDetails(subject, pub, priv);
  } catch (e) {
    throw new Error("VAPID-Schlüssel ungültig (Public/Private Key prüfen): " + String((e as Error).message ?? e));
  }
  vapidReady = true;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "POST only" }, 405);
  try {
    setupVapid();
    const { roles = [], names = [], exclude = null, msgs = {}, url = "./geruest-bestell-app.html" } = await req.json();

    const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const { data, error } = await sb.from("app_state").select("value").eq("key", STORAGE_KEY).maybeSingle();
    if (error) throw error;
    const value = data?.value ?? {};
    const employees: { name: string; roles: string[] }[] = value.employees ?? [];
    const subs: Sub[] = value.pushSubs ?? [];

    const rolesOf = (n: string) => employees.find((e) => e.name === n)?.roles ?? [];
    const seen = new Set<string>();
    const targets = subs.filter((s) => {
      if (!s?.endpoint || seen.has(s.endpoint) || s.name === exclude) return false;
      const hit = names.includes(s.name) || rolesOf(s.name).some((r) => roles.includes(r));
      if (hit) seen.add(s.endpoint);
      return hit;
    });

    const gone: string[] = [];
    let sent = 0;
    await Promise.all(targets.map(async (s) => {
      const m: Msg | undefined = msgs[s.lang ?? "de"] ?? msgs.de;
      if (!m) return;
      try {
        await webpush.sendNotification(
          { endpoint: s.endpoint, keys: s.keys },
          JSON.stringify({ title: m.title, body: m.body, url }),
          { TTL: 60 * 60 * 12 },
        );
        sent++;
      } catch (e) {
        const code = (e as { statusCode?: number }).statusCode;
        if (code === 404 || code === 410) gone.push(s.endpoint);
        else console.error("Push fehlgeschlagen", code, e);
      }
    }));
    return json({ sent, gone });
  } catch (e) {
    console.error(e);
    return json({ error: String(e) }, 500);
  }
});
