export const MINUTE = 60_000;
export const GRACE_MS = 10 * MINUTE;
export const REPEAT_MS = 2 * 60 * MINUTE;

export const RERING_OFFSETS_MS = [0, 2 * MINUTE, 5 * MINUTE, 8 * MINUTE];

export type Power = "plugged" | "unplugged" | "unknown";

export type Local = {
  power: Power;
  outageSince: number | null;
  nextDueAt: number | null;
  lastCheckinAt: number | null;
  unsentCheckinAt: number | null;
};

export const emptyLocal: Local = {
  power: "unknown",
  outageSince: null,
  nextDueAt: null,
  lastCheckinAt: null,
  unsentCheckinAt: null,
};

export type AlarmPlan = { ringAt: number } | { cancel: true } | null;

export function isPending(l: Local, now: number): boolean {
  return l.nextDueAt !== null && now >= l.nextDueAt && (l.lastCheckinAt ?? 0) < l.nextDueAt;
}

export function onPower(l: Local, power: Power, now: number): { next: Local; alarms: AlarmPlan } {
  if (power === "unplugged" && l.outageSince === null) {
    return { next: { ...l, power, outageSince: now, nextDueAt: now }, alarms: { ringAt: now } };
  }
  if (power === "plugged" && l.outageSince !== null) {
    if (isPending(l, now)) return { next: { ...l, power, outageSince: null }, alarms: null };
    return { next: { ...l, power, outageSince: null, nextDueAt: null }, alarms: { cancel: true } };
  }
  return { next: { ...l, power }, alarms: null };
}

export function onCheckin(l: Local, now: number, repeatMs = REPEAT_MS): { next: Local; alarms: AlarmPlan } {
  const nextDueAt = l.outageSince !== null ? now + repeatMs : null;
  return {
    next: { ...l, lastCheckinAt: now, nextDueAt, unsentCheckinAt: now },
    alarms: nextDueAt !== null ? { ringAt: nextDueAt } : { cancel: true },
  };
}

export function onServerPrompt(
  l: Local,
  dueAt: number,
  now: number,
  outageSince: number | null = null,
): { next: Local; alarms: AlarmPlan } {
  const base = outageSince !== null && l.outageSince === null ? { ...l, outageSince } : l;
  if (isPending(base, now)) return { next: base, alarms: null };
  if ((base.lastCheckinAt ?? 0) >= dueAt) return { next: base, alarms: null };
  return { next: { ...base, nextDueAt: dueAt }, alarms: { ringAt: dueAt } };
}

export function onAreaPowerBack(l: Local, now: number): { next: Local; alarms: AlarmPlan } {
  if (l.outageSince === null) return { next: l, alarms: null };
  if (isPending(l, now)) return { next: { ...l, outageSince: null }, alarms: null };
  return { next: { ...l, outageSince: null, nextDueAt: null }, alarms: { cancel: true } };
}

export function onResolved(l: Local, now: number, repeatMs = REPEAT_MS): { next: Local; alarms: AlarmPlan } {
  const nextDueAt = l.outageSince !== null ? now + repeatMs : null;
  return {
    next: { ...l, lastCheckinAt: now, nextDueAt },
    alarms: nextDueAt !== null ? { ringAt: nextDueAt } : { cancel: true },
  };
}
