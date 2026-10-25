import { test } from "node:test";
import assert from "node:assert/strict";
import {
  alertText,
  evaluate,
  GRACE_MS,
  langOf,
  MINUTE,
  NEEDS,
  onCheckin,
  onFamilyRequest,
  onHeartbeat,
  onOutageReported,
  onPowerBackReported,
  onSeenInPerson,
  type Outcome,
  type PatientState,
  REPEAT_MS,
  STALE_MS,
} from "./logic.ts";

const T0 = Date.UTC(2026, 9, 22, 18, 0);

const fresh = (): PatientState => ({
  power: "plugged",
  outageStartedAt: null,
  nextCheckinAt: null,
  lastCheckinAt: null,
  lastHeartbeatAt: T0,
  promptedAt: null,
  alertedAt: null,
  signalAlertedAt: null,
});

const apply = (p: PatientState, o: Outcome): PatientState => ({ ...p, ...o.patch });
const press = (p: PatientState, t: number) => onCheckin(p, t, t);
const outageAt = (t: number) => apply(fresh(), onHeartbeat(fresh(), "unplugged", t));

test("power loss starts an outage and rings the patient", () => {
  const o = onHeartbeat(fresh(), "unplugged", T0);
  assert.equal(o.promptPatient, true);
  assert.equal(o.patch.outageStartedAt, T0);
  assert.equal(o.patch.nextCheckinAt, T0);
  assert.deepEqual(o.alerts, []);
});

test("a second unplugged heartbeat does not restart the outage", () => {
  const o = onHeartbeat(outageAt(T0), "unplugged", T0 + 15 * MINUTE);
  assert.equal(o.promptPatient, false);
  assert.equal(o.patch.outageStartedAt, undefined);
});

test("no press within the grace period alerts family exactly once", () => {
  const p = outageAt(T0);
  assert.deepEqual(evaluate(p, T0 + GRACE_MS - 1).alerts, []);
  const o = evaluate(p, T0 + GRACE_MS);
  assert.deepEqual(o.alerts, ["no_response"]);
  assert.deepEqual(evaluate(apply(p, o), T0 + GRACE_MS + MINUTE).alerts, []);
});

test("pressing in time means no alert and schedules the next check-in", () => {
  let p = outageAt(T0);
  const c = press(p, T0 + 3 * MINUTE);
  assert.deepEqual(c.alerts, []);
  assert.equal(c.patch.nextCheckinAt, T0 + 3 * MINUTE + REPEAT_MS);
  p = apply(p, c);
  assert.deepEqual(evaluate(p, T0 + GRACE_MS + MINUTE).alerts, []);
});

test("repeat check-in rings the phone once when it comes due", () => {
  let p = outageAt(T0);
  p = apply(p, press(p, T0 + MINUTE));
  const due = T0 + MINUTE + REPEAT_MS;
  p = { ...p, lastHeartbeatAt: due - MINUTE };
  const first = evaluate(p, due);
  assert.equal(first.promptPatient, true);
  assert.equal(evaluate(apply(p, first), due + MINUTE).promptPatient, false);
});

test("pressing after family was alerted tells them it's fine", () => {
  let p = outageAt(T0);
  p = apply(p, evaluate(p, T0 + GRACE_MS));
  assert.deepEqual(press(p, T0 + GRACE_MS + 2 * MINUTE).alerts, ["ok_after_alert"]);
});

test("power back with nothing open clears the outage quietly", () => {
  const p = outageAt(T0);
  const answered = apply(p, press(p, T0 + MINUTE));
  const back = onHeartbeat(answered, "plugged", T0 + 30 * MINUTE);
  assert.deepEqual(back.alerts, []);
  assert.equal(back.patch.outageStartedAt, null);
  assert.equal(back.patch.nextCheckinAt, null);
});

test("power back after a no-signal alert tells family", () => {
  let p = outageAt(T0);
  p = apply(p, press(p, T0 + MINUTE));
  p = { ...p, signalAlertedAt: T0 + MINUTE + STALE_MS };
  const back = onHeartbeat(p, "plugged", T0 + 2 * STALE_MS);
  assert.deepEqual(back.alerts, ["signal_back", "power_back"]);
});

test("power back does NOT clear an unanswered check-in", () => {
  let p = outageAt(T0);
  p = apply(p, evaluate(p, T0 + GRACE_MS));
  const back = onHeartbeat(p, "plugged", T0 + 20 * MINUTE);
  assert.deepEqual(back.alerts, ["power_back_no_answer"]);
  assert.equal(back.patch.nextCheckinAt, undefined);
  p = apply(p, back);
  assert.deepEqual(press(p, T0 + 25 * MINUTE).alerts, ["ok_after_alert"]);
});

test("power back before the alert keeps the clock running", () => {
  let p = outageAt(T0);
  p = apply(p, onHeartbeat(p, "plugged", T0 + 2 * MINUTE));
  assert.equal(p.outageStartedAt, null);
  assert.deepEqual(evaluate(p, T0 + GRACE_MS).alerts, ["no_response"]);
});

test("phone going silent during an outage alerts family once, and they hear when it's back", () => {
  let p = outageAt(T0);
  p = apply(p, press(p, T0 + MINUTE));
  const quietSince = T0 + MINUTE;
  assert.deepEqual(evaluate(p, quietSince + STALE_MS - 1).alerts, []);
  const o = evaluate(p, quietSince + STALE_MS);
  assert.deepEqual(o.alerts, ["no_signal"]);
  p = apply(p, o);
  assert.deepEqual(evaluate(p, quietSince + STALE_MS + 5 * MINUTE).alerts, []);
  const back = onHeartbeat(p, "unplugged", quietSince + STALE_MS + 6 * MINUTE);
  assert.deepEqual(back.alerts, ["signal_back"]);
  assert.equal(back.patch.signalAlertedAt, null);
});

test("no silence alerts when the power is on", () => {
  const p = { ...fresh(), lastHeartbeatAt: T0 - 10 * STALE_MS };
  assert.deepEqual(evaluate(p, T0).alerts, []);
});

test("a late offline check-in counts at its press time, not arrival time", () => {
  let p = outageAt(T0);
  p = { ...p, alertedAt: T0 + GRACE_MS };
  const arrive = T0 + 2 * MINUTE + REPEAT_MS + 5 * MINUTE;
  const c = onCheckin(p, T0 + 2 * MINUTE, arrive);
  assert.equal(c.patch.lastCheckinAt, T0 + 2 * MINUTE);
  assert.equal(c.patch.nextCheckinAt, T0 + 2 * MINUTE + REPEAT_MS);
  assert.deepEqual(c.alerts, []);
  p = apply(p, c);
  assert.deepEqual(evaluate(p, T0 + 2 * MINUTE + REPEAT_MS + GRACE_MS).alerts, ["no_response"]);
});

test("a press from before the current check-in doesn't answer it", () => {
  let p = apply(fresh(), onFamilyRequest(fresh(), T0));
  const c = onCheckin(p, T0 - MINUTE, T0 + MINUTE);
  assert.equal(c.patch.nextCheckinAt, undefined);
  p = apply(p, c);
  assert.deepEqual(evaluate(p, T0 + GRACE_MS).alerts, ["no_response"]);
});

test("the same check-in sent twice is only counted once", () => {
  let p = outageAt(T0);
  p = apply(p, evaluate(p, T0 + GRACE_MS));
  p = apply(p, onCheckin(p, T0 + 11 * MINUTE, T0 + 11 * MINUTE));
  assert.deepEqual(onCheckin(p, T0 + 11 * MINUTE, T0 + 12 * MINUTE).alerts, []);
});

test("family request rings the patient and alerts if unanswered", () => {
  const r = onFamilyRequest(fresh(), T0);
  assert.equal(r.promptPatient, true);
  assert.deepEqual(evaluate(apply(fresh(), r), T0 + GRACE_MS).alerts, ["no_response"]);
});

test("a second family request rings again without resetting the clock", () => {
  let p = apply(fresh(), onFamilyRequest(fresh(), T0));
  const again = onFamilyRequest(p, T0 + 5 * MINUTE);
  assert.equal(again.promptPatient, true);
  assert.equal(again.patch.nextCheckinAt, undefined);
  p = apply(p, again);
  assert.deepEqual(evaluate(p, T0 + GRACE_MS).alerts, ["no_response"]);
});

test("check-in after a family request with power on clears the schedule", () => {
  const p = apply(fresh(), onFamilyRequest(fresh(), T0));
  assert.equal(press(p, T0 + MINUTE).patch.nextCheckinAt, null);
});

test("demo mode alerts after a shorter grace period", () => {
  assert.deepEqual(evaluate(outageAt(T0), T0 + MINUTE, MINUTE).alerts, ["no_response"]);
});

test("alert text matches the grace period", () => {
  assert.match(alertText("no_response", "Carmen"), /10 minutos/);
  assert.match(alertText("no_response", "Carmen", 1), /en 1 minuto\./);
});

test("seeing the patient in person closes an open alert and tells everyone", () => {
  let p = outageAt(T0);
  p = apply(p, evaluate(p, T0 + GRACE_MS));
  const seen = onSeenInPerson(p, T0 + 20 * MINUTE);
  assert.deepEqual(seen.alerts, ["seen_ok"]);
  p = apply(p, seen);
  assert.equal(p.lastCheckinAt, T0 + 20 * MINUTE);
  assert.equal(p.nextCheckinAt, T0 + 20 * MINUTE + REPEAT_MS);
  assert.deepEqual(evaluate(p, T0 + 40 * MINUTE).alerts, []);
});

test("in-person text names who went", () => {
  assert.equal(alertText("seen_ok", "Carmen", 10, "Marta"), "RedVita: Marta pasó a ver a Carmen. Está bien.");
});

test("a neighbor's outage report rings the patient and tells family", () => {
  const o = onOutageReported(fresh(), T0);
  assert.equal(o.promptPatient, true);
  assert.deepEqual(o.alerts, ["outage_reported"]);
  const p = apply(fresh(), o);
  assert.equal(p.outageStartedAt, T0);
  assert.deepEqual(evaluate(p, T0 + GRACE_MS).alerts, ["no_response"]);
});

test("a second report of the same outage does nothing", () => {
  const p = apply(fresh(), onOutageReported(fresh(), T0));
  const again = onOutageReported(p, T0 + MINUTE);
  assert.equal(again.promptPatient, false);
  assert.deepEqual(again.alerts, []);
});

test("a power-back report ends the outage but keeps an unanswered check-in", () => {
  let p = apply(fresh(), onOutageReported(fresh(), T0));
  p = apply(p, evaluate(p, T0 + GRACE_MS));
  const back = onPowerBackReported(p, T0 + 20 * MINUTE);
  assert.equal(back.patch.outageStartedAt, null);
  assert.deepEqual(back.alerts, ["power_back_no_answer"]);
  assert.equal(back.patch.lastHeartbeatAt, undefined);
});

test("a power-back report after she answered closes everything", () => {
  let p = apply(fresh(), onOutageReported(fresh(), T0));
  p = apply(p, press(p, T0 + MINUTE));
  const back = onPowerBackReported(p, T0 + 30 * MINUTE);
  assert.equal(back.patch.nextCheckinAt, null);
  assert.deepEqual(back.alerts, []);
});

test("the charger beats a power-back report", () => {
  let p = outageAt(T0);
  p = apply(p, press(p, T0 + MINUTE));
  assert.deepEqual(onPowerBackReported(p, T0 + 30 * MINUTE).patch, {});
});

test("oxygen patients get asked every hour, fridge medicine every 4", () => {
  const p = outageAt(T0);
  assert.equal(onCheckin(p, T0 + MINUTE, T0 + MINUTE, NEEDS.oxygen.repeatMs).patch.nextCheckinAt, T0 + MINUTE + 60 * MINUTE);
  assert.equal(onCheckin(p, T0 + MINUTE, T0 + MINUTE, NEEDS.fridge.repeatMs).patch.nextCheckinAt, T0 + MINUTE + 240 * MINUTE);
});

test("alerts go out in each person's language, Spanish by default", () => {
  assert.equal(alertText("seen_ok", "Carmen", 10, "Marta", "en"), "RedVita: Marta checked on Carmen in person. They're okay.");
  assert.match(alertText("no_response", "Carmen", 1, undefined, "en"), /in 1 minute\./);
  assert.match(alertText("outage_reported", "Carmen", 10, undefined, "en"), /^RedVita: Someone reported/);
  assert.match(alertText("outage_reported", "Carmen"), /^RedVita: Alguien reportó/);
  assert.equal(langOf("en"), "en");
  assert.equal(langOf("fr"), "es");
  assert.equal(langOf(undefined), "es");
  assert.equal(NEEDS.oxygen.label.en, "uses oxygen");
});
