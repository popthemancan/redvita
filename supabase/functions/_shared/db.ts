import { createClient, type SupabaseClient } from "npm:@supabase/supabase-js@2";
import type { PatientState, Power } from "./logic.ts";

export function admin(): SupabaseClient {
  return createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { auth: { persistSession: false } },
  );
}

export type PatientRow = {
  id: string;
  name: string;
  phone: string | null;
  need: string;
  home_lat: number | null;
  home_lng: number | null;
  link_code: string;
  secret_hash: string;
  push_token: string | null;
  lang: string;
  power: Power;
  battery: number | null;
  last_heartbeat_at: string | null;
  outage_started_at: string | null;
  next_checkin_at: string | null;
  last_checkin_at: string | null;
  prompted_at: string | null;
  alerted_at: string | null;
  signal_alerted_at: string | null;
  version: number;
};

export type ContactRow = {
  id: string;
  patient_id: string;
  name: string;
  phone: string | null;
  home_lat: number | null;
  home_lng: number | null;
  responding_at: string | null;
  last_report_at: string | null;
  secret_hash: string;
  push_token: string | null;
  lang: string;
};

const ms = (t: string | null) => (t === null ? null : Date.parse(t));
const iso = (n: number | null) => (n === null ? null : new Date(n).toISOString());

export function toState(r: PatientRow): PatientState {
  return {
    power: r.power,
    outageStartedAt: ms(r.outage_started_at),
    nextCheckinAt: ms(r.next_checkin_at),
    lastCheckinAt: ms(r.last_checkin_at),
    lastHeartbeatAt: ms(r.last_heartbeat_at),
    promptedAt: ms(r.prompted_at),
    alertedAt: ms(r.alerted_at),
    signalAlertedAt: ms(r.signal_alerted_at),
  };
}

const columns: Record<keyof PatientState, keyof PatientRow> = {
  power: "power",
  outageStartedAt: "outage_started_at",
  nextCheckinAt: "next_checkin_at",
  lastCheckinAt: "last_checkin_at",
  lastHeartbeatAt: "last_heartbeat_at",
  promptedAt: "prompted_at",
  alertedAt: "alerted_at",
  signalAlertedAt: "signal_alerted_at",
};

export function toRow(patch: Partial<PatientState>): Record<string, unknown> {
  const row: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(patch)) {
    const col = columns[key as keyof PatientState];
    row[col] = key === "power" ? value : iso(value as number | null);
  }
  return row;
}

export async function sha256(text: string): Promise<string> {
  const bytes = new TextEncoder().encode(text);
  const hash = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(hash), (b) => b.toString(16).padStart(2, "0")).join("");
}

export function newSecret(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(24));
  return btoa(String.fromCharCode(...bytes)).replace(/[+/=]/g, "");
}

export function newLinkCode(): string {
  const n = crypto.getRandomValues(new Uint32Array(1))[0] % 900_000;
  return String(100_000 + n);
}

export function distanceKm(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const R = 6371;
  const rad = (d: number) => (d * Math.PI) / 180;
  const dLat = rad(b.lat - a.lat);
  const dLng = rad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}
