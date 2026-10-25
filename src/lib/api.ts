const API_URL = process.env.EXPO_PUBLIC_API_URL ?? "";

export class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

export async function call<T>(action: string, body: Record<string, unknown> = {}): Promise<T> {
  if (!API_URL) throw new ApiError(0, "EXPO_PUBLIC_API_URL is not set");
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 15_000);
  try {
    const res = await fetch(API_URL, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ action, ...body }),
      signal: controller.signal,
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new ApiError(res.status, data.error ?? `HTTP ${res.status}`);
    return data as T;
  } catch (e) {
    if (e instanceof ApiError) throw e;
    throw new ApiError(0, "offline");
  } finally {
    clearTimeout(timer);
  }
}

export type PatientSummary = {
  contactId: string;
  error?: string;
  name: string;
  power: "plugged" | "unplugged" | "unknown";
  battery: number | null;
  outageStartedAt: string | null;
  lastCheckinAt: string | null;
  lastHeartbeatAt: string | null;
  nextCheckinAt: string | null;
  waiting: boolean;
  alert: "no_response" | "no_signal" | null;
  events: { kind: string; created_at: string; detail?: { by?: string } | null }[];
  phone: string | null;
  need: string;
  home: { lat: number; lng: number } | null;
  people: { name: string; me: boolean; home: { lat: number; lng: number } | null; responding: boolean }[];
};
