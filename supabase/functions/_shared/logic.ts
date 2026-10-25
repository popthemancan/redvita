export const MINUTE = 60_000;

export const GRACE_MS = 10 * MINUTE;
export const REPEAT_MS = 2 * 60 * MINUTE;
export const STALE_MS = 45 * MINUTE;

export type Power = "plugged" | "unplugged" | "unknown";

export type Need = "oxygen" | "breathing" | "dialysis" | "fridge" | "bed" | "other";

export const NEEDS: Record<Need, { label: Record<Lang, string>; repeatMs: number }> = {
  oxygen: { label: { es: "usa oxígeno", en: "uses oxygen" }, repeatMs: 60 * MINUTE },
  breathing: { label: { es: "usa máquina para respirar", en: "uses a breathing machine" }, repeatMs: 60 * MINUTE },
  dialysis: { label: { es: "hace diálisis en casa", en: "does dialysis at home" }, repeatMs: 120 * MINUTE },
  fridge: { label: { es: "tiene medicina en la nevera", en: "keeps medicine in the fridge" }, repeatMs: 240 * MINUTE },
  bed: { label: { es: "usa cama eléctrica", en: "uses an electric bed" }, repeatMs: 240 * MINUTE },
  other: { label: { es: "", en: "" }, repeatMs: REPEAT_MS },
};

export type Lang = "es" | "en";
export const langOf = (v: unknown): Lang => (v === "en" ? "en" : "es");

export const needOf = (v: unknown): Need => (typeof v === "string" && v in NEEDS ? (v as Need) : "other");

export type PatientState = {
  power: Power;
  outageStartedAt: number | null;
  nextCheckinAt: number | null;
  lastCheckinAt: number | null;
  lastHeartbeatAt: number | null;
  promptedAt: number | null;
  alertedAt: number | null;
  signalAlertedAt: number | null;
};

export type AlertKind =
  | "no_response"
  | "no_signal"
  | "ok_after_alert"
  | "signal_back"
  | "power_back"
  | "power_back_no_answer"
  | "outage_reported"
  | "responding"
  | "seen_ok";

export type Outcome = {
  patch: Partial<PatientState>;
  alerts: AlertKind[];
  promptPatient: boolean;
};

const none = (): Outcome => ({ patch: {}, alerts: [], promptPatient: false });

export function isWaiting(p: PatientState, now: number): boolean {
  const due = p.nextCheckinAt;
  return due !== null && due <= now && (p.lastCheckinAt ?? 0) < due;
}

function familyWorried(p: PatientState): boolean {
  const lastAlert = Math.max(p.alertedAt ?? 0, p.signalAlertedAt ?? 0);
  return lastAlert > 0 && lastAlert > (p.lastCheckinAt ?? 0);
}

export function onHeartbeat(p: PatientState, power: Power, now: number): Outcome {
  const out = none();
  out.patch.lastHeartbeatAt = now;
  out.patch.power = power;

  if (p.signalAlertedAt !== null) {
    out.patch.signalAlertedAt = null;
    out.alerts.push("signal_back");
  }

  const wasOut = p.outageStartedAt !== null;
  const waiting = isWaiting(p, now);

  if (power === "unplugged" && !wasOut) {
    out.patch.outageStartedAt = now;
    if (!waiting) {
      out.patch.nextCheckinAt = now;
      out.patch.alertedAt = null;
    }
    out.patch.promptedAt = now;
    out.promptPatient = true;
  } else if (power === "plugged" && wasOut) {
    out.patch.outageStartedAt = null;
    if (waiting) {
      if ((p.alertedAt ?? 0) >= (p.nextCheckinAt ?? 0)) out.alerts.push("power_back_no_answer");
    } else {
      if (familyWorried(p)) out.alerts.push("power_back");
      out.patch.nextCheckinAt = null;
      out.patch.alertedAt = null;
    }
  }
  return out;
}

export function onCheckin(p: PatientState, pressedAt: number, now: number, repeatMs = REPEAT_MS): Outcome {
  const out = none();
  const at = Math.min(pressedAt, now);
  out.patch.lastHeartbeatAt = now;
  if (at <= (p.lastCheckinAt ?? 0)) return out;

  out.patch.lastCheckinAt = at;
  const due = p.nextCheckinAt;
  const answersCurrent = due === null || at >= due;
  if (!answersCurrent) return out;

  const next = p.outageStartedAt !== null ? at + repeatMs : null;
  out.patch.nextCheckinAt = next;
  out.patch.alertedAt = null;
  out.patch.signalAlertedAt = null;
  if (familyWorried(p) && (next === null || next > now)) out.alerts.push("ok_after_alert");
  return out;
}

export function onOutageReported(p: PatientState, now: number): Outcome {
  const out = none();
  if (p.outageStartedAt !== null) return out;
  out.patch.outageStartedAt = now;
  if (!isWaiting(p, now)) {
    out.patch.nextCheckinAt = now;
    out.patch.alertedAt = null;
  }
  out.patch.promptedAt = now;
  out.promptPatient = true;
  out.alerts.push("outage_reported");
  return out;
}

export function onPowerBackReported(p: PatientState, now: number): Outcome {
  if (p.outageStartedAt === null) return none();
  if (p.power === "unplugged") return none();
  const out = onHeartbeat({ ...p, power: "unplugged" }, "plugged", now);
  delete out.patch.lastHeartbeatAt;
  out.patch.power = p.power;
  return out;
}

export function onSeenInPerson(p: PatientState, now: number, repeatMs = REPEAT_MS): Outcome {
  const out = onCheckin(p, now, now, repeatMs);
  out.alerts = ["seen_ok"];
  return out;
}

export function onFamilyRequest(p: PatientState, now: number): Outcome {
  const out = none();
  if (!isWaiting(p, now)) {
    out.patch.nextCheckinAt = now;
    out.patch.alertedAt = null;
  }
  out.patch.promptedAt = now;
  out.promptPatient = true;
  return out;
}

export function evaluate(p: PatientState, now: number, graceMs = GRACE_MS): Outcome {
  const out = none();
  const due = p.nextCheckinAt ?? 0;
  const waiting = isWaiting(p, now);

  if (waiting && (p.promptedAt ?? 0) < due) {
    out.promptPatient = true;
    out.patch.promptedAt = now;
  }

  if (waiting && now >= due + graceMs && (p.alertedAt ?? 0) < due) {
    out.alerts.push("no_response");
    out.patch.alertedAt = now;
  }

  if (p.outageStartedAt !== null && p.signalAlertedAt === null) {
    const lastSeen = Math.max(p.lastHeartbeatAt ?? 0, p.lastCheckinAt ?? 0, p.outageStartedAt);
    if (now - lastSeen >= STALE_MS) {
      out.alerts.push("no_signal");
      out.patch.signalAlertedAt = now;
    }
  }
  return out;
}

export function alertText(
  kind: AlertKind,
  name: string,
  graceMin = GRACE_MS / MINUTE,
  by?: string,
  lang: Lang = "es",
): string {
  if (lang === "en") {
    const who = by ?? "Someone";
    switch (kind) {
      case "no_response":
        return `RedVita: ${name} hasn't answered the check-in in ${graceMin} ${graceMin === 1 ? "minute" : "minutes"}. Call or go check on them.`;
      case "no_signal":
        return `RedVita: we lost contact with ${name} during the outage (phone battery or signal). Call or go check on them.`;
      case "ok_after_alert":
        return `RedVita: ${name} answered. They're okay.`;
      case "signal_back":
        return `RedVita: ${name}'s phone has signal again.`;
      case "power_back":
        return `RedVita: the power is back at ${name}'s house.`;
      case "power_back_no_answer":
        return `RedVita: the power is back, but ${name} still hasn't answered. Call or go check on them.`;
      case "outage_reported":
        return `RedVita: ${who} reported the power went out near ${name}. We're asking if they're okay.`;
      case "responding":
        return `RedVita: ${who} is on the way to check on ${name}.`;
      case "seen_ok":
        return `RedVita: ${who} checked on ${name} in person. They're okay.`;
    }
  }
  const who = by ?? "Alguien";
  switch (kind) {
    case "no_response":
      return `RedVita: ${name} no ha respondido al check-in en ${graceMin} ${graceMin === 1 ? "minuto" : "minutos"}. Llama o pasa a verle.`;
    case "no_signal":
      return `RedVita: perdimos señal del teléfono de ${name} durante el apagón (batería o señal). Llama o pasa a verle.`;
    case "ok_after_alert":
      return `RedVita: ${name} respondió. Está bien.`;
    case "signal_back":
      return `RedVita: el teléfono de ${name} tiene señal otra vez.`;
    case "power_back":
      return `RedVita: volvió la luz en casa de ${name}.`;
    case "power_back_no_answer":
      return `RedVita: volvió la luz en casa de ${name}, pero todavía no ha respondido. Llama o pasa a verle.`;
    case "outage_reported":
      return `RedVita: ${who} reportó que se fue la luz cerca de ${name}. Le estamos preguntando si está bien.`;
    case "responding":
      return `RedVita: ${who} va en camino a ver a ${name}.`;
    case "seen_ok":
      return `RedVita: ${who} pasó a ver a ${name}. Está bien.`;
  }
}

export function isUrgent(kind: AlertKind): boolean {
  return kind === "no_response" || kind === "no_signal" || kind === "power_back_no_answer";
}

export function alertField(kind: AlertKind): "alertedAt" | "signalAlertedAt" | null {
  if (kind === "no_response") return "alertedAt";
  if (kind === "no_signal") return "signalAlertedAt";
  return null;
}
