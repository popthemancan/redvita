import { locale, t } from "./i18n";

function toDate(when: string | number | null): Date | null {
  if (when === null) return null;
  const d = new Date(when);
  return Number.isNaN(d.getTime()) ? null : d;
}

export function clock(when: string | number | null): string {
  const d = toDate(when);
  if (!d) return "—";
  const time = d.toLocaleTimeString(locale, { hour: "numeric", minute: "2-digit" });
  const today = new Date();
  const yesterday = new Date(today.getTime() - 86_400_000);
  if (d.toDateString() === today.toDateString()) return time;
  if (d.toDateString() === yesterday.toDateString()) return t.time.yesterday(time);
  return `${d.toLocaleDateString(locale, { day: "numeric", month: "short" })} ${time}`;
}

export function ago(when: string | number | null): string {
  const d = toDate(when);
  if (!d) return t.time.never;
  const min = Math.round((Date.now() - d.getTime()) / 60_000);
  if (min < 1) return t.time.justNow;
  if (min < 60) return t.time.minAgo(min);
  const h = Math.floor(min / 60);
  if (h < 24) return t.time.hoursAgo(h);
  return clock(when);
}

export function spacedCode(code: string): string {
  return code.length === 6 ? `${code.slice(0, 3)} ${code.slice(3)}` : code;
}

export function eventLabel(kind: string, by?: string | null): string {
  const label = t.events[kind] ?? kind;
  return by ? `${label} (${by})` : label;
}

export function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]!.toUpperCase())
    .join("");
}

export function longDate(when: number): string {
  const s = new Date(when).toLocaleDateString(locale, { weekday: "long", day: "numeric", month: "long" });
  return s.charAt(0).toUpperCase() + s.slice(1);
}
