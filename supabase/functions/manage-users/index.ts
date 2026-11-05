// Supabase Edge Function "manage-users" -- Mitarbeiter-Konten der
// Gerüst-Bestell-App verwalten (echte Anmeldung über Supabase Auth).
//
// EINRICHTUNG (einmalig, im Supabase-Dashboard):
//   Edge Functions -> "Deploy a new function" -> "Via Editor",
//   Name: manage-users, diesen Dateiinhalt einfügen, "Deploy".
//   Keine Secrets nötig (SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY stellt
//   Supabase automatisch bereit). "Verify JWT" bleibt an.
//
// Jeder Mitarbeiter hat ein Supabase-Konto mit der Adresse
// ma<ID>@<DOMAIN> (wird nie angeschrieben) und dem Passwort PW_PREFIX +
// eigenes Passwort (Supabase verlangt mind. 6 Zeichen, so bleiben auch
// 4-stellige PINs gültig). app_metadata = {emp_id, name, roles} -- nur
// der Server kann das ändern; die Tabellen-Regeln (RLS) lesen daraus,
// wer Chef ist und welche Standort-Zeile einem Fahrer gehört.
// Die Mitarbeiterliste ohne Passwörter steht weiter im Datensatz
// (app_state / shopfloor-data-v2, Feld employees) und wird hier
// mitgepflegt.
//
// Aktionen (POST {action, ...}):
//   bootstrap  {chefPw}  -- EINMALIG: legt für alle Mitarbeiter im
//                          Datensatz Konten mit ihren bisherigen
//                          Passwörtern an, löscht die Passwörter aus dem
//                          Datensatz und speichert das Chef-Passwort
//                          verschlüsselt. Geht nur, solange es noch kein
//                          einziges Mitarbeiter-Konto gibt.
//   create     {name, pw, roles}   -- nur Chef
//   set-roles  {id, roles}         -- nur Chef
//   set-pw     {id, pw}            -- nur Chef
//   remove     {id}                -- nur Chef
// Antwort: {ok:true, ...} oder {error, code} (code z. B. last_chef,
// duplicate, pw_short, not_chef, already_done).

import { createClient, type SupabaseClient } from "npm:@supabase/supabase-js@2";

const STORAGE_KEY = "shopfloor-data-v2";
const DOMAIN = "mitarbeiter.sg-muc.de"; // muss zu AUTH_DOMAIN in der App passen
const PW_PREFIX = "sgm#"; // muss zu PW_PREFIX in der App passen
const ROLES = ["baustelle", "lager", "fahrer", "chef"];
const MIN_PW = 4;

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });

class Fail extends Error {
  constructor(public code: string, msg: string, public status = 400) { super(msg); }
}

type Emp = { id: number; name: string; roles: string[]; uid?: string; pw?: string };
const emailFor = (id: number) => `ma${id}@${DOMAIN}`;
const cleanRoles = (r: unknown) => ROLES.filter((x) => Array.isArray(r) && r.includes(x));

async function sha256hex(s: string) {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}
export async function makeChefPw(pw: string) {
  const salt = crypto.randomUUID().replace(/-/g, "").slice(0, 16);
  return { salt, hash: await sha256hex(salt + ":" + pw) };
}

// Datensatz lesen, ändern, nur schreiben wenn unverändert (value.rev) --
// sonst neu versuchen. fn darf KEINE Nebenwirkungen haben (läuft evtl. mehrfach).
async function updateBlob<T>(admin: SupabaseClient, fn: (v: Record<string, any>) => T | Promise<T>): Promise<T> {
  for (let i = 0; i < 6; i++) {
    const { data, error } = await admin.from("app_state").select("value").eq("key", STORAGE_KEY).maybeSingle();
    if (error) throw error;
    const value = (data?.value ?? {}) as Record<string, any>;
    const rev = value.rev ?? null;
    const next = structuredClone(value);
    const result = await fn(next);
    next.rev = (Number(rev) || 0) + 1;
    if (!data) {
      const { error: e } = await admin.from("app_state").insert({ key: STORAGE_KEY, value: next });
      if (!e) return result;
      continue;
    }
    const base = admin.from("app_state").update({ value: next }).eq("key", STORAGE_KEY);
    const q = rev == null ? base.is("value->>rev", null) : base.eq("value->>rev", String(rev));
    const { data: upd, error: e2 } = await q.select("key");
    if (e2) throw e2;
    if (upd && upd.length) return result;
  }
  throw new Fail("busy", "Daten gerade in Benutzung – bitte nochmal versuchen", 409);
}
async function readEmployees(admin: SupabaseClient): Promise<Emp[]> {
  const { data, error } = await admin.from("app_state").select("value").eq("key", STORAGE_KEY).maybeSingle();
  if (error) throw error;
  return (data?.value?.employees ?? []) as Emp[];
}
async function allAppUsers(admin: SupabaseClient) {
  const out: { id: string; email?: string }[] = [];
  for (let page = 1; page < 50; page++) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 1000 });
    if (error) throw error;
    out.push(...data.users);
    if (data.users.length < 1000) break;
  }
  return out.filter((u) => (u.email ?? "").endsWith("@" + DOMAIN));
}
async function uidFor(admin: SupabaseClient, emp: Emp) {
  if (emp.uid) return emp.uid;
  const u = (await allAppUsers(admin)).find((x) => x.email === emailFor(emp.id));
  return u?.id ?? null;
}
const meta = (e: Emp) => ({ emp_id: e.id, name: e.name, roles: cleanRoles(e.roles) });

async function callerOf(req: Request, admin: SupabaseClient) {
  const token = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "");
  if (!token) return null;
  const { data, error } = await admin.auth.getUser(token);
  if (error || !data?.user) return null;
  const m = (data.user.app_metadata ?? {}) as { name?: string; roles?: string[] };
  return { name: m.name ?? "", roles: m.roles ?? [] };
}

async function bootstrap(admin: SupabaseClient, body: { chefPw?: string }) {
  if ((await allAppUsers(admin)).length) throw new Fail("already_done", "Konten sind schon eingerichtet", 409);
  const emps = await readEmployees(admin);
  if (!emps.length) throw new Fail("no_employees", "Keine Mitarbeiter im Datensatz");
  const created: { id: number; uid: string }[] = [];
  const skipped: string[] = [];
  for (const e of emps) {
    const pw = String(e.pw ?? "").trim();
    if (pw.length < 1) { skipped.push(e.name); continue; }
    const { data, error } = await admin.auth.admin.createUser({
      email: emailFor(e.id), password: PW_PREFIX + pw, email_confirm: true, app_metadata: meta(e),
    });
    if (error) throw new Fail("create_failed", `Konto für ${e.name}: ${error.message}`);
    created.push({ id: e.id, uid: data.user.id });
  }
  const chefPw = body.chefPw ? await makeChefPw(body.chefPw) : null;
  await updateBlob(admin, (v) => {
    v.employees = ((v.employees ?? []) as Emp[]).map(({ pw: _pw, ...e }) => ({
      ...e, uid: created.find((c) => c.id === e.id)?.uid ?? e.uid,
    }));
    if (chefPw && !v.chefPw) v.chefPw = chefPw;
  });
  return { ok: true, created: created.length, skipped };
}

async function createEmp(admin: SupabaseClient, body: { name?: string; pw?: string; roles?: string[] }) {
  const name = String(body.name ?? "").trim(), pw = String(body.pw ?? "").trim();
  if (!name) throw new Fail("fields", "Name fehlt");
  if (pw.length < MIN_PW) throw new Fail("pw_short", `Passwort mindestens ${MIN_PW} Zeichen`);
  const roles = cleanRoles(body.roles);
  // 1) Platz im Datensatz reservieren (Nummer vergeben)
  const emp = await updateBlob(admin, (v) => {
    const emps = (v.employees ?? []) as Emp[];
    if (emps.some((e) => e.name.toLowerCase() === name.toLowerCase())) throw new Fail("duplicate", "Name gibt es schon");
    const id = Math.max(Number(v.empCounter) || 1, ...emps.map((e) => e.id + 1));
    const e: Emp = { id, name, roles };
    v.employees = [...emps, e];
    v.empCounter = id + 1;
    return e;
  });
  // 2) Konto anlegen -- klappt das nicht, Eintrag wieder entfernen
  const { data, error } = await admin.auth.admin.createUser({
    email: emailFor(emp.id), password: PW_PREFIX + pw, email_confirm: true, app_metadata: meta(emp),
  });
  if (error) {
    await updateBlob(admin, (v) => { v.employees = ((v.employees ?? []) as Emp[]).filter((e) => e.id !== emp.id); });
    throw new Fail("create_failed", error.message);
  }
  await updateBlob(admin, (v) => {
    v.employees = ((v.employees ?? []) as Emp[]).map((e) => (e.id === emp.id ? { ...e, uid: data.user.id } : e));
  });
  return { ok: true, id: emp.id };
}

async function setRoles(admin: SupabaseClient, body: { id?: number; roles?: string[] }) {
  const roles = cleanRoles(body.roles);
  const emp = await updateBlob(admin, (v) => {
    const emps = (v.employees ?? []) as Emp[];
    const e = emps.find((x) => x.id === Number(body.id));
    if (!e) throw new Fail("not_found", "Mitarbeiter nicht gefunden");
    const chefsAfter = emps.filter((x) => (x.id === e.id ? roles : x.roles).includes("chef")).length;
    if (!chefsAfter) throw new Fail("last_chef", "Der letzte Chef kann nicht entfernt werden");
    e.roles = roles;
    return { ...e };
  });
  const uid = await uidFor(admin, emp);
  if (uid) {
    const { error } = await admin.auth.admin.updateUserById(uid, { app_metadata: meta(emp) });
    if (error) throw new Fail("update_failed", error.message);
  }
  return { ok: true };
}

async function setPw(admin: SupabaseClient, body: { id?: number; pw?: string }) {
  const pw = String(body.pw ?? "").trim();
  if (pw.length < MIN_PW) throw new Fail("pw_short", `Passwort mindestens ${MIN_PW} Zeichen`);
  const emp = (await readEmployees(admin)).find((x) => x.id === Number(body.id));
  if (!emp) throw new Fail("not_found", "Mitarbeiter nicht gefunden");
  const uid = await uidFor(admin, emp);
  if (uid) {
    const { error } = await admin.auth.admin.updateUserById(uid, { password: PW_PREFIX + pw, app_metadata: meta(emp) });
    if (error) throw new Fail("update_failed", error.message);
  } else {
    const { data, error } = await admin.auth.admin.createUser({
      email: emailFor(emp.id), password: PW_PREFIX + pw, email_confirm: true, app_metadata: meta(emp),
    });
    if (error) throw new Fail("create_failed", error.message);
    await updateBlob(admin, (v) => {
      v.employees = ((v.employees ?? []) as Emp[]).map((e) => (e.id === emp.id ? { ...e, uid: data.user.id } : e));
    });
  }
  return { ok: true };
}

async function removeEmp(admin: SupabaseClient, body: { id?: number }) {
  const emps = await readEmployees(admin);
  const emp = emps.find((x) => x.id === Number(body.id));
  if (!emp) throw new Fail("not_found", "Mitarbeiter nicht gefunden");
  const lastChef = (list: Emp[]) =>
    emp.roles.includes("chef") && list.filter((x) => x.roles.includes("chef")).length <= 1;
  if (lastChef(emps)) throw new Fail("last_chef", "Der letzte Chef kann nicht entfernt werden");
  // Erst das Konto löschen (klappt das nicht, bleibt alles wie es war) ...
  const uid = await uidFor(admin, emp);
  if (uid) {
    const { error } = await admin.auth.admin.deleteUser(uid);
    if (error && !/not.?found/i.test(error.message)) throw new Fail("delete_failed", error.message);
  }
  // ... dann den Eintrag aus der Liste
  await updateBlob(admin, (v) => {
    v.employees = ((v.employees ?? []) as Emp[]).filter((x) => x.id !== emp.id);
  });
  return { ok: true };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "POST only" }, 405);
  const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  try {
    const body = await req.json().catch(() => ({}));
    if (body.action === "bootstrap") return json(await bootstrap(admin, body));
    const caller = await callerOf(req, admin);
    if (!caller || !caller.roles.includes("chef")) throw new Fail("not_chef", "Nur der Chef darf Mitarbeiter verwalten", 403);
    switch (body.action) {
      case "create": return json(await createEmp(admin, body));
      case "set-roles": return json(await setRoles(admin, body));
      case "set-pw": return json(await setPw(admin, body));
      case "remove": return json(await removeEmp(admin, body));
      default: throw new Fail("unknown", "Unbekannte Aktion");
    }
  } catch (e) {
    if (e instanceof Fail) return json({ error: e.message, code: e.code }, e.status);
    console.error(e);
    return json({ error: String((e as Error)?.message ?? e), code: "error" }, 500);
  }
});
