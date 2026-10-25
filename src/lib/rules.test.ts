import { test } from "node:test";
import assert from "node:assert/strict";
import {
  emptyLocal,
  isPending,
  MINUTE,
  onAreaPowerBack,
  onCheckin,
  onPower,
  onResolved,
  onServerPrompt,
  REPEAT_MS,
} from "./rules.ts";

const T0 = Date.UTC(2026, 9, 22, 18, 0);

test("unplugging rings right away and makes the check-in pending", () => {
  const { next, alarms } = onPower(emptyLocal, "unplugged", T0);
  assert.deepEqual(alarms, { ringAt: T0 });
  assert.equal(isPending(next, T0), true);
});

test("pressing clears pending and books the next ring 2 hours out", () => {
  const out = onPower(emptyLocal, "unplugged", T0).next;
  const { next, alarms } = onCheckin(out, T0 + MINUTE);
  assert.equal(isPending(next, T0 + MINUTE), false);
  assert.deepEqual(alarms, { ringAt: T0 + MINUTE + REPEAT_MS });
  assert.equal(next.unsentCheckinAt, T0 + MINUTE);
  assert.equal(isPending(next, T0 + MINUTE + REPEAT_MS), true);
});

test("plugging back in after answering cancels the alarms", () => {
  const out = onPower(emptyLocal, "unplugged", T0).next;
  const answered = onCheckin(out, T0 + MINUTE).next;
  const { next, alarms } = onPower(answered, "plugged", T0 + 20 * MINUTE);
  assert.deepEqual(alarms, { cancel: true });
  assert.equal(next.nextDueAt, null);
});

test("repeated unplugged readings don't re-ring", () => {
  const out = onPower(emptyLocal, "unplugged", T0).next;
  assert.equal(onPower(out, "unplugged", T0 + 15 * MINUTE).alarms, null);
});

test("pressing with the power on doesn't schedule anything", () => {
  assert.deepEqual(onCheckin(emptyLocal, T0).alarms, { cancel: true });
});

test("a family request rings unless something is already ringing", () => {
  const asked = onServerPrompt(emptyLocal, T0, T0);
  assert.deepEqual(asked.alarms, { ringAt: T0 });
  assert.equal(onServerPrompt(asked.next, T0 + MINUTE, T0 + MINUTE).alarms, null);
});

test("a stale request that was already answered is ignored", () => {
  const answered = onCheckin(emptyLocal, T0 + MINUTE).next;
  assert.equal(onServerPrompt(answered, T0, T0 + 2 * MINUTE).alarms, null);
});

test("power back during an unanswered check-in keeps it ringing", () => {
  const out = onPower(emptyLocal, "unplugged", T0).next;
  const { next, alarms } = onPower(out, "plugged", T0 + 3 * MINUTE);
  assert.equal(alarms, null);
  assert.equal(isPending(next, T0 + 3 * MINUTE), true);
  assert.equal(next.outageSince, null);
  assert.deepEqual(onCheckin(next, T0 + 4 * MINUTE).alarms, { cancel: true });
});

test("a family visit stops the ringing without sending a check-in", () => {
  const out = onPower(emptyLocal, "unplugged", T0).next;
  const { next, alarms } = onResolved(out, T0 + 12 * MINUTE);
  assert.equal(isPending(next, T0 + 12 * MINUTE), false);
  assert.deepEqual(alarms, { ringAt: T0 + 12 * MINUTE + REPEAT_MS });
  assert.equal(next.unsentCheckinAt, null);
});

test("an outage reported nearby rings, and keeps asking every 2 hours", () => {
  const asked = onServerPrompt(emptyLocal, T0, T0, T0);
  assert.deepEqual(asked.alarms, { ringAt: T0 });
  assert.equal(asked.next.outageSince, T0);
  const { alarms } = onCheckin(asked.next, T0 + MINUTE);
  assert.deepEqual(alarms, { ringAt: T0 + MINUTE + REPEAT_MS });
});

test("power back in the area stops the repeats, but not an unanswered ring", () => {
  const out = onServerPrompt(emptyLocal, T0, T0, T0).next;
  assert.equal(onAreaPowerBack(out, T0 + MINUTE).alarms, null);
  const answered = onCheckin(out, T0 + MINUTE).next;
  assert.deepEqual(onAreaPowerBack(answered, T0 + 30 * MINUTE).alarms, { cancel: true });
});
