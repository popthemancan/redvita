import * as Battery from "expo-battery";
import * as BackgroundTask from "expo-background-task";
import * as Notifications from "expo-notifications";
import * as TaskManager from "expo-task-manager";
import { call } from "./api";
import { NEEDS, needOf } from "./needs";
import { ACTION_OK, cancelRings, scheduleRings } from "./notifications";
import {
  type AlarmPlan,
  isPending,
  type Local,
  onCheckin,
  onPower,
  onAreaPowerBack,
  onResolved,
  onServerPrompt,
  type Power,
} from "./rules";
import { store } from "./storage";

export const POWER_TASK = "redvita-power-check";
export const PUSH_TASK = "redvita-push";

let queue: Promise<unknown> = Promise.resolve();
function serial<T>(fn: () => Promise<T>): Promise<T> {
  const run = queue.then(fn, fn);
  queue = run.catch(() => undefined);
  return run;
}

function toPower(state: Battery.BatteryState): Power {
  switch (state) {
    case Battery.BatteryState.CHARGING:
    case Battery.BatteryState.FULL:
    case Battery.BatteryState.NOT_CHARGING:
      return "plugged";
    case Battery.BatteryState.UNPLUGGED:
      return "unplugged";
    default:
      return "unknown";
  }
}

export async function readPower(): Promise<{ power: Power; battery: number | null }> {
  const s = await Battery.getPowerStateAsync();
  return {
    power: toPower(s.batteryState),
    battery: s.batteryLevel >= 0 ? Math.round(s.batteryLevel * 100) : null,
  };
}

async function applyAlarms(plan: AlarmPlan): Promise<void> {
  if (!plan) return;
  if ("cancel" in plan) await cancelRings();
  else await scheduleRings(plan.ringAt);
}

async function flushUnsent(): Promise<Local> {
  const me = await store.getPatient();
  const before = await store.getLocal();
  const pressedAt = before.unsentCheckinAt;
  if (!me || pressedAt === null) return before;
  try {
    await call("checkin", { patientId: me.patientId, secret: me.secret, pressedAt });
  } catch {
    return before;
  }
  return serial(async () => {
    const l = await store.getLocal();
    if (l.unsentCheckinAt !== pressedAt) return l;
    const next = { ...l, unsentCheckinAt: null };
    await store.setLocal(next);
    return next;
  });
}

export async function syncPower(given?: Power): Promise<Local> {
  const me = await store.getPatient();
  if (!me) return store.getLocal();
  const reading = await readPower();
  const useCharger = await store.getChargerDetection();
  const power: Power = useCharger ? (given ?? reading.power) : "unknown";

  if (useCharger) {
    await serial(async () => {
      const { next, alarms } = onPower(await store.getLocal(), power, Date.now());
      await store.setLocal(next);
      await applyAlarms(alarms);
    });
  }

  try {
    await call("heartbeat", { patientId: me.patientId, secret: me.secret, power, battery: reading.battery });
  } catch {
    return store.getLocal();
  }
  return flushUnsent();
}

async function repeatMs(): Promise<number> {
  const me = await store.getPatient();
  return NEEDS[needOf(me?.need)].repeatMs;
}

export async function checkIn(): Promise<Local> {
  const every = await repeatMs();
  await serial(async () => {
    const { next, alarms } = onCheckin(await store.getLocal(), Date.now(), every);
    await store.setLocal(next);
    await applyAlarms(alarms);
  });
  return flushUnsent();
}

export async function handleServerPrompt(dueAt: number, outageSince: number | null = null): Promise<Local> {
  await serial(async () => {
    const { next, alarms } = onServerPrompt(await store.getLocal(), dueAt, Date.now(), outageSince);
    await store.setLocal(next);
    await applyAlarms(alarms);
  });
  return flushUnsent();
}

export async function getLocalState(): Promise<{ local: Local; pending: boolean }> {
  const local = await store.getLocal();
  return { local, pending: isPending(local, Date.now()) };
}

export async function handleResolved(): Promise<Local> {
  const every = await repeatMs();
  return serial(async () => {
    const { next, alarms } = onResolved(await store.getLocal(), Date.now(), every);
    await store.setLocal(next);
    await applyAlarms(alarms);
    return next;
  });
}

export type PushMessage =
  | { type: "checkin"; dueAt: number; outageSince: number | null }
  | { type: "resolved" }
  | { type: "power_back" };

export async function handleAreaPowerBack(): Promise<Local> {
  return serial(async () => {
    const { next, alarms } = onAreaPowerBack(await store.getLocal(), Date.now());
    await store.setLocal(next);
    await applyAlarms(alarms);
    return next;
  });
}

export function parsePush(raw: unknown): PushMessage | null {
  if (!raw || typeof raw !== "object") return null;
  let data = raw as Record<string, unknown>;
  if (typeof data.dataString === "string") {
    try {
      data = JSON.parse(data.dataString);
    } catch {
      return null;
    }
  }
  if (data.type === "resolved") return { type: "resolved" };
  if (data.type === "power_back") return { type: "power_back" };
  if (data.type === "checkin") {
    return {
      type: "checkin",
      dueAt: typeof data.dueAt === "number" ? data.dueAt : Date.now(),
      outageSince: typeof data.outageSince === "number" ? data.outageSince : null,
    };
  }
  return null;
}

export async function handlePush(raw: unknown, actionId?: string): Promise<Local | null> {
  if (!(await store.getPatient())) return null;
  if (actionId === ACTION_OK) return checkIn();
  const msg = parsePush(raw);
  if (msg?.type === "checkin") return handleServerPrompt(msg.dueAt, msg.outageSince);
  if (msg?.type === "resolved") return handleResolved();
  if (msg?.type === "power_back") return handleAreaPowerBack();
  return null;
}

TaskManager.defineTask(POWER_TASK, async () => {
  try {
    await syncPower();
    return BackgroundTask.BackgroundTaskResult.Success;
  } catch {
    return BackgroundTask.BackgroundTaskResult.Failed;
  }
});

TaskManager.defineTask<Notifications.NotificationTaskPayload>(PUSH_TASK, async ({ data }) => {
  if (data && "actionIdentifier" in data) {
    await handlePush(data.notification.request.content.data, data.actionIdentifier);
  } else {
    await handlePush(data?.data);
  }
});

export async function startBackgroundChecks(): Promise<void> {
  try {
    if (!(await TaskManager.isTaskRegisteredAsync(PUSH_TASK))) await Notifications.registerTaskAsync(PUSH_TASK);
  } catch (e) {
    console.warn("push task not registered", e);
  }
  const status = await BackgroundTask.getStatusAsync();
  if (status !== BackgroundTask.BackgroundTaskStatus.Available) return;
  if (!(await TaskManager.isTaskRegisteredAsync(POWER_TASK))) {
    await BackgroundTask.registerTaskAsync(POWER_TASK, { minimumInterval: 15 });
  }
}

export function watchCharger(onChange: (l: Local) => void): () => void {
  const sub = Battery.addBatteryStateListener(async ({ batteryState }) => {
    const p = toPower(batteryState);
    if (p !== "unknown" && (await store.getChargerDetection())) syncPower(p).then(onChange);
  });
  return () => sub.remove();
}
