import { applyOutcome } from "../_shared/apply.ts";
import { type AlertCtx, alertContacts, tellPatientPowerBack, tellPatientResolved } from "../_shared/notify.ts";
import {
  admin,
  type ContactRow,
  distanceKm,
  newLinkCode,
  newSecret,
  type PatientRow,
  sha256,
  toState,
} from "../_shared/db.ts";
import {
  isWaiting,
  langOf,
  NEEDS,
  needOf,
  onCheckin,
  onFamilyRequest,
  onHeartbeat,
  onOutageReported,
  onPowerBackReported,
  onSeenInPerson,
  type Outcome,
  type PatientState,
  type Power,
} from "../_shared/logic.ts";

const db = admin();

class HttpError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });

function text(v: unknown, field: string, max = 80): string {
  if (typeof v !== "string" || v.trim() === "") throw new HttpError(400, `missing ${field}`);
  return v.trim().slice(0, max);
}

function normalizePhone(v: unknown): string | null {
  if (typeof v !== "string" || v.trim() === "") return null;
  const digits = v.replace(/\D/g, "");
  if (digits.length === 10) return `+1${digits}`;
  if (digits.length === 11 && digits.startsWith("1")) return `+${digits}`;
  if (v.trim().startsWith("+") && digits.length >= 8 && digits.length <= 15) return `+${digits}`;
  throw new HttpError(400, "bad phone");
}

function coords(lat: unknown, lng: unknown): { lat: number; lng: number } | null {
  if (typeof lat !== "number" || typeof lng !== "number") return null;
  if (Math.abs(lat) > 90 || Math.abs(lng) > 180) throw new HttpError(400, "bad location");
  return { lat, lng };
}

async function authPatient(id: unknown, secret: unknown): Promise<PatientRow> {
  const { data } = await db.from("patients").select("*").eq("id", text(id, "patientId", 40)).maybeSingle();
  if (!data || data.secret_hash !== (await sha256(text(secret, "secret", 100)))) {
    throw new HttpError(401, "unauthorized");
  }
  return data as PatientRow;
}

async function authContact(id: unknown, secret: unknown): Promise<ContactRow> {
  const { data } = await db.from("contacts").select("*").eq("id", text(id, "contactId", 40)).maybeSingle();
  if (!data || data.secret_hash !== (await sha256(text(secret, "secret", 100)))) {
    throw new HttpError(401, "unauthorized");
  }
  return data as ContactRow;
}

async function patientById(id: string): Promise<PatientRow> {
  const { data, error } = await db.from("patients").select("*").eq("id", id).single();
  if (error) throw error;
  return data as PatientRow;
}

async function mutate(
  first: PatientRow,
  compute: (s: PatientState, now: number) => Outcome,
  ctx: AlertCtx = {},
): Promise<PatientRow> {
  let row = first;
  for (let attempt = 0; attempt < 4; attempt++) {
    const saved = await applyOutcome(db, row, compute(toState(row), Date.now()), ctx);
    if (saved) return saved;
    row = await patientById(row.id);
  }
  throw new HttpError(503, "busy, try again");
}

const logEvent = (patientId: string, kind: string, detail?: unknown) =>
  db.from("events").insert({ patient_id: patientId, kind, detail: detail ?? null });

async function summary(p: PatientRow, me: ContactRow) {
  const { data: people } = await db
    .from("contacts")
    .select("id, name, home_lat, home_lng, responding_at")
    .eq("patient_id", p.id);
  const fresh = (t: string | null) => t !== null && Date.now() - Date.parse(t) < 2 * 3600_000;
  const { data: events } = await db
    .from("events")
    .select("kind, created_at")
    .eq("patient_id", p.id)
    .order("created_at", { ascending: false })
    .limit(10);
  const s = toState(p);
  const waiting = isWaiting(s, Date.now());
  const noResponse = waiting && s.alertedAt !== null && s.alertedAt >= (s.nextCheckinAt ?? 0);
  return {
    name: p.name,
    power: p.power,
    battery: p.battery,
    outageStartedAt: p.outage_started_at,
    lastCheckinAt: p.last_checkin_at,
    lastHeartbeatAt: p.last_heartbeat_at,
    nextCheckinAt: p.next_checkin_at,
    waiting,
    alert: s.signalAlertedAt !== null ? "no_signal" : noResponse ? "no_response" : null,
    events: events ?? [],
    phone: p.phone,
    need: needOf(p.need),
    home: p.home_lat !== null && p.home_lng !== null ? { lat: p.home_lat, lng: p.home_lng } : null,
    people: (people ?? []).map((c) => ({
      name: c.name,
      me: c.id === me.id,
      home: c.home_lat !== null && c.home_lng !== null ? { lat: c.home_lat, lng: c.home_lng } : null,
      responding: fresh(c.responding_at),
    })),
  };
}

const REPORT_RADIUS_KM = 1.5;
const REPORT_COOLDOWN_MS = 10 * 60_000;

async function patientsNear(at: { lat: number; lng: number }): Promise<PatientRow[]> {
  const dLat = REPORT_RADIUS_KM / 111;
  const dLng = REPORT_RADIUS_KM / (111 * Math.cos((at.lat * Math.PI) / 180));
  const { data, error } = await db
    .from("patients")
    .select("*")
    .gte("home_lat", at.lat - dLat)
    .lte("home_lat", at.lat + dLat)
    .gte("home_lng", at.lng - dLng)
    .lte("home_lng", at.lng + dLng)
    .limit(200);
  if (error) throw error;
  return ((data ?? []) as PatientRow[]).filter(
    (p) => p.home_lat !== null && p.home_lng !== null && distanceKm(at, { lat: p.home_lat, lng: p.home_lng }) <= REPORT_RADIUS_KM,
  );
}

async function reportTargets(c: ContactRow): Promise<PatientRow[]> {
  const mine = await patientById(c.patient_id);
  if (mine.home_lat === null || mine.home_lng === null) return [mine];
  const near = await patientsNear({ lat: mine.home_lat, lng: mine.home_lng });
  return [mine, ...near.filter((p) => p.id !== mine.id)];
}

async function reportCooldown(c: ContactRow): Promise<void> {
  if (c.last_report_at && Date.now() - Date.parse(c.last_report_at) < REPORT_COOLDOWN_MS) {
    throw new HttpError(429, "too soon");
  }
  await db.from("contacts").update({ last_report_at: new Date().toISOString() }).eq("id", c.id);
}

const MAX_BAD_CODES = 10;

type Body = Record<string, unknown>;
type Ctx = { ip: string };
type Handler = (b: Body, ctx: Ctx) => Promise<unknown>;

const actions: Record<string, Handler> = {
  async register_patient(b) {
    const secret = newSecret();
    for (let tries = 0; tries < 5; tries++) {
      const home = coords(b.lat, b.lng);
      const { data, error } = await db.from("patients").insert({
        name: text(b.name, "name"),
        phone: normalizePhone(b.phone),
        need: needOf(b.need),
        home_lat: home?.lat ?? null,
        home_lng: home?.lng ?? null,
        link_code: newLinkCode(),
        secret_hash: await sha256(secret),
        push_token: typeof b.pushToken === "string" ? b.pushToken : null,
        lang: langOf(b.lang),
      }).select("id, link_code").single();
      if (!error) return { patientId: data.id, secret, linkCode: data.link_code };
      if (error.code !== "23505") throw error;
    }
    throw new HttpError(500, "could not create code");
  },

  async register_contact(b, ctx) {
    const since = new Date(Date.now() - 15 * 60_000).toISOString();
    const { count } = await db
      .from("code_attempts")
      .select("id", { count: "exact", head: true })
      .eq("ip", ctx.ip)
      .gte("created_at", since);
    if ((count ?? 0) >= MAX_BAD_CODES) throw new HttpError(429, "too many tries");

    const code = text(b.linkCode, "linkCode", 6);
    const { data: p } = await db.from("patients").select("id, name").eq("link_code", code).maybeSingle();
    if (!p) {
      await db.from("code_attempts").insert({ ip: ctx.ip });
      throw new HttpError(404, "code not found");
    }
    const secret = newSecret();
    const home = coords(b.lat, b.lng);
    const { data, error } = await db.from("contacts").insert({
      patient_id: p.id,
      name: text(b.name, "name"),
      phone: normalizePhone(b.phone),
      home_lat: home?.lat ?? null,
      home_lng: home?.lng ?? null,
      secret_hash: await sha256(secret),
      push_token: typeof b.pushToken === "string" ? b.pushToken : null,
      lang: langOf(b.lang),
    }).select("id").single();
    if (error) throw error;
    await logEvent(p.id, "contact_joined", { name: b.name });
    return { contactId: data.id, secret, patientName: p.name };
  },

  async heartbeat(b) {
    const p = await authPatient(b.patientId, b.secret);
    const power: Power = b.power === "plugged" || b.power === "unplugged" ? b.power : "unknown";
    if (typeof b.battery === "number") {
      await db.from("patients").update({ battery: b.battery }).eq("id", p.id);
    }
    const wasOut = p.outage_started_at !== null;
    const next = await mutate(p, (s, now) => onHeartbeat(s, power, now));
    const isOut = next.outage_started_at !== null;
    if (!wasOut && isOut) await logEvent(p.id, "outage_started");
    if (wasOut && !isOut) await logEvent(p.id, "outage_ended");
    return { nextCheckinAt: next.next_checkin_at };
  },

  async checkin(b) {
    const p = await authPatient(b.patientId, b.secret);
    const pressedAt = typeof b.pressedAt === "number" && b.pressedAt > 0 ? b.pressedAt : Date.now();
    const before = p.last_checkin_at;
    const repeat = NEEDS[needOf(p.need)].repeatMs;
    const next = await mutate(p, (s, now) => onCheckin(s, pressedAt, now, repeat));
    if (next.last_checkin_at !== before) await logEvent(p.id, "checkin");
    return { nextCheckinAt: next.next_checkin_at };
  },

  async patient_status(b) {
    const p = await authPatient(b.patientId, b.secret);
    const { data: contacts } = await db.from("contacts").select("name").eq("patient_id", p.id);
    return {
      name: p.name,
      linkCode: p.link_code,
      contacts: (contacts ?? []).map((c) => c.name),
      nextCheckinAt: p.next_checkin_at,
      lastCheckinAt: p.last_checkin_at,
    };
  },

  async update_push_token(b) {
    const token = text(b.pushToken, "pushToken", 200);
    const lang = langOf(b.lang);
    if (b.patientId) {
      const p = await authPatient(b.patientId, b.secret);
      await db.from("patients").update({ push_token: token, lang }).eq("id", p.id);
    } else {
      const c = await authContact(b.contactId, b.secret);
      await db.from("contacts").update({ push_token: token, lang }).eq("id", c.id);
    }
    return { ok: true };
  },

  async family_status(b) {
    const links = Array.isArray(b.links) ? b.links.slice(0, 10) : [];
    const results = [];
    for (const link of links as Body[]) {
      try {
        const c = await authContact(link.contactId, link.secret);
        results.push({ contactId: c.id, ...(await summary(await patientById(c.patient_id), c)) });
      } catch {
        results.push({ contactId: link.contactId, error: "unlinked" });
      }
    }
    return { patients: results };
  },

  async report_outage(b) {
    const c = await authContact(b.contactId, b.secret);
    await reportCooldown(c);
    for (const p of await reportTargets(c)) {
      const before = p.outage_started_at;
      const next = await mutate(p, (s, now) => onOutageReported(s, now), { by: c.name, exceptContactId: c.id });
      if (before === null && next.outage_started_at !== null) await logEvent(p.id, "outage_reported", { by: c.name });
    }
    return { ok: true };
  },

  async report_power_back(b) {
    const c = await authContact(b.contactId, b.secret);
    await reportCooldown(c);
    for (const p of await reportTargets(c)) {
      if (p.outage_started_at === null) continue;
      const next = await mutate(p, (s, now) => onPowerBackReported(s, now), { by: c.name });
      if (next.outage_started_at === null) {
        await logEvent(p.id, "power_back_reported", { by: c.name });
        await tellPatientPowerBack(next);
      }
    }
    return { ok: true };
  },

  async responding(b) {
    const c = await authContact(b.contactId, b.secret);
    const p = await patientById(c.patient_id);
    await db.from("contacts").update({ responding_at: new Date().toISOString() }).eq("id", c.id);
    await logEvent(p.id, "responding", { by: c.name });
    await alertContacts(db, p, "responding", { by: c.name, exceptContactId: c.id });
    return { ok: true };
  },

  async seen_in_person(b) {
    const c = await authContact(b.contactId, b.secret);
    const p = await patientById(c.patient_id);
    const ctx = { by: c.name, exceptContactId: c.id };
    const repeat = NEEDS[needOf(p.need)].repeatMs;
    const next = await mutate(p, (s, now) => onSeenInPerson(s, now, repeat), ctx);
    await db.from("contacts").update({ responding_at: null }).eq("patient_id", p.id);
    await logEvent(p.id, "seen_in_person", { by: c.name });
    await tellPatientResolved(next);
    return { ok: true };
  },

  async update_location(b) {
    const home = coords(b.lat, b.lng);
    if (!home) throw new HttpError(400, "missing location");
    if (b.patientId) {
      const p = await authPatient(b.patientId, b.secret);
      await db.from("patients").update({ home_lat: home.lat, home_lng: home.lng }).eq("id", p.id);
    } else {
      const c = await authContact(b.contactId, b.secret);
      await db.from("contacts").update({ home_lat: home.lat, home_lng: home.lng }).eq("id", c.id);
    }
    return { ok: true };
  },

  async request_checkin(b) {
    const c = await authContact(b.contactId, b.secret);
    const p = await patientById(c.patient_id);
    await mutate(p, (s, now) => onFamilyRequest(s, now));
    await logEvent(p.id, "checkin_requested", { by: c.name });
    return { ok: true };
  },
};

Deno.serve(async (req) => {
  if (req.method !== "POST") return json({ error: "POST only" }, 405);
  const ip = (req.headers.get("x-forwarded-for") ?? "unknown").split(",")[0].trim();
  try {
    const body = (await req.json()) as Body;
    const handler = actions[String(body.action)];
    if (!handler) return json({ error: "unknown action" }, 400);
    return json(await handler(body, { ip }));
  } catch (e) {
    if (e instanceof HttpError) return json({ error: e.message }, e.status);
    console.error(e);
    return json({ error: "server error" }, 500);
  }
});
