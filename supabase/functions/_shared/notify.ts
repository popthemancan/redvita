import type { SupabaseClient } from "npm:@supabase/supabase-js@2";
import type { ContactRow, PatientRow } from "./db.ts";
import { type AlertKind, alertText, isUrgent, type Lang, langOf, NEEDS, needOf } from "./logic.ts";
import { graceMs } from "./settings.ts";

type PushMessage = {
  to: string;
  title: string;
  body: string;
  sound: string;
  channelId: string;
  priority: "high" | "normal";
  data: Record<string, unknown>;
  categoryId?: string;
};

async function sendPush(messages: PushMessage[]): Promise<number> {
  if (messages.length === 0) return 0;
  try {
    const res = await fetch("https://exp.host/--/api/v2/push/send", {
      method: "POST",
      headers: { "content-type": "application/json", accept: "application/json" },
      body: JSON.stringify(messages),
    });
    if (!res.ok) {
      console.error("push failed", res.status, await res.text());
      return 0;
    }
    const body = await res.json();
    const tickets: { status: string }[] = Array.isArray(body?.data) ? body.data : [];
    return tickets.filter((t) => t.status === "ok").length;
  } catch (e) {
    console.error("push error", e);
    return 0;
  }
}

async function sendSms(to: string, body: string): Promise<boolean> {
  const sid = Deno.env.get("TWILIO_ACCOUNT_SID");
  const token = Deno.env.get("TWILIO_AUTH_TOKEN");
  const from = Deno.env.get("TWILIO_FROM");
  if (!sid || !token || !from) return false;
  try {
    const res = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`, {
      method: "POST",
      headers: {
        authorization: "Basic " + btoa(`${sid}:${token}`),
        "content-type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({ To: to, From: from, Body: body }),
    });
    if (!res.ok) console.error("sms failed", res.status, await res.text());
    return res.ok;
  } catch (e) {
    console.error("sms error", e);
    return false;
  }
}

const PATIENT_TEXT: Record<Lang, { outage: string; ask: string; powerBack: string; resolved: string }> = {
  es: {
    outage: "Se fue la luz en tu área",
    ask: "¿Estás bien? Toca “Estoy bien”.",
    powerBack: "Volvió la luz en tu área.",
    resolved: "Tu familia ya sabe que estás bien.",
  },
  en: {
    outage: "The power went out in your area",
    ask: "Are you okay? Tap “I'm okay”.",
    powerBack: "The power is back in your area.",
    resolved: "Your family knows you're okay.",
  },
};

export async function promptPatient(p: PatientRow, dueAt: number): Promise<void> {
  if (!p.push_token) return;
  const outage = p.outage_started_at !== null;
  const t = PATIENT_TEXT[langOf(p.lang)];
  await sendPush([{
    to: p.push_token,
    title: outage ? t.outage : "RedVita",
    body: t.ask,
    sound: "alarm.wav",
    channelId: "checkin",
    priority: "high",
    data: { type: "checkin", dueAt, outageSince: outage ? Date.parse(p.outage_started_at!) : null },
    categoryId: "checkin",
  }]);
}

export type Delivery = { reachable: number; delivered: number };

export type AlertCtx = { by?: string; exceptContactId?: string };

export async function tellPatientPowerBack(p: PatientRow): Promise<void> {
  if (!p.push_token) return;
  await sendPush([{
    to: p.push_token,
    title: "RedVita",
    body: PATIENT_TEXT[langOf(p.lang)].powerBack,
    sound: "default",
    channelId: "info",
    priority: "normal",
    data: { type: "power_back" },
  }]);
}

export async function tellPatientResolved(p: PatientRow): Promise<void> {
  if (!p.push_token) return;
  await sendPush([{
    to: p.push_token,
    title: "RedVita",
    body: PATIENT_TEXT[langOf(p.lang)].resolved,
    sound: "default",
    channelId: "info",
    priority: "high",
    data: { type: "resolved" },
  }]);
}

export async function alertContacts(
  db: SupabaseClient,
  p: PatientRow,
  kind: AlertKind,
  ctx: AlertCtx = {},
): Promise<Delivery> {
  const { data } = await db.from("contacts").select("*").eq("patient_id", p.id);
  const contacts = ((data ?? []) as ContactRow[]).filter((c) => c.id !== ctx.exceptContactId);
  const urgent = isUrgent(kind);
  const bodyFor = (lang: Lang) => {
    const label = NEEDS[needOf(p.need)].label[lang];
    const who = urgent && label ? `${p.name} (${label})` : p.name;
    return alertText(kind, who, graceMs() / 60_000, ctx.by, lang);
  };

  const pushes = contacts.filter((c) => c.push_token).map((c) => ({
    to: c.push_token!,
    title: urgent ? `⚠️ ${p.name}` : p.name,
    body: bodyFor(langOf(c.lang)),
    sound: urgent ? "alarm.wav" : "default",
    channelId: urgent ? "alert" : "info",
    priority: urgent ? ("high" as const) : ("normal" as const),
    data: { type: "alert", kind, patientId: p.id },
  }));
  const pushed = await sendPush(pushes);

  let texted = 0;
  if (urgent) {
    for (const c of contacts) {
      if (c.phone && (await sendSms(c.phone, bodyFor(langOf(c.lang))))) texted++;
    }
  }

  const reachable = contacts.filter((c) => c.push_token || c.phone).length;
  await db.from("events").insert({
    patient_id: p.id,
    kind,
    detail: { contacts: contacts.length, pushed, texted },
  });
  return { reachable, delivered: pushed + texted };
}
