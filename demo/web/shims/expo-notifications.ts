import { deliver, type Incoming, onIncoming, pushToken } from "../phone";

export enum AndroidImportance { MIN = 1, LOW = 2, DEFAULT = 3, HIGH = 4, MAX = 5 }
export enum AndroidNotificationVisibility { PRIVATE = 0, PUBLIC = 1, SECRET = -1 }
export enum AndroidAudioUsage { ALARM = 4, NOTIFICATION = 5 }
export enum AndroidAudioContentType { SONIFICATION = 4 }
export enum AndroidNotificationPriority { MIN = "min", LOW = "low", DEFAULT = "default", HIGH = "high", MAX = "max" }
export enum SchedulableTriggerInputTypes { DATE = "date", TIME_INTERVAL = "timeInterval" }
export type NotificationTaskPayload = Record<string, unknown>;

type Content = { title?: string; body?: string; sound?: string; data?: Record<string, unknown> };
type Notification = { request: { identifier: string; content: Content } };
type Response = { notification: Notification; actionIdentifier: string };

const toNotification = (id: string, n: Incoming): Notification => ({
  request: { identifier: id, content: { title: n.title, body: n.body, data: n.data, sound: n.sound } },
});

const receivedFns = new Set<(n: Notification) => void>();
let counter = 0;
onIncoming((n) => {
  const note = toNotification(`remote-${counter++}`, n);
  for (const fn of receivedFns) fn(note);
});

export function setNotificationHandler(_h: unknown) {}
export async function setNotificationCategoryAsync(..._a: unknown[]) {
  return null;
}
export async function setNotificationChannelAsync(..._a: unknown[]) {
  return null;
}
export async function getPermissionsAsync() {
  return { granted: true, status: "granted" };
}
export const requestPermissionsAsync = getPermissionsAsync;
export const getExactAlarmPermissionsAsync = getPermissionsAsync;
export const requestExactAlarmPermissionsAsync = getPermissionsAsync;
export async function getExpoPushTokenAsync(_o?: unknown) {
  return { type: "expo", data: pushToken };
}
export async function registerTaskAsync(_name: string) {}
export function getLastNotificationResponse(): Response | null {
  return null;
}

export function addNotificationReceivedListener(fn: (n: Notification) => void) {
  receivedFns.add(fn);
  return { remove: () => receivedFns.delete(fn) };
}
export function addNotificationResponseReceivedListener(_fn: (r: Response) => void) {
  return { remove: () => {} };
}

type Scheduled = { identifier: string; content: Content; trigger: { date: number }; timer: ReturnType<typeof setTimeout> };
const scheduled = new Map<string, Scheduled>();

export async function scheduleNotificationAsync(req: {
  identifier?: string;
  content: Content;
  trigger: { date: number | Date };
}) {
  const id = req.identifier ?? `local-${counter++}`;
  scheduled.get(id) && clearTimeout(scheduled.get(id)!.timer);
  const at = +req.trigger.date;
  const timer = setTimeout(() => {
    scheduled.delete(id);
    deliver(
      { title: req.content.title ?? "", body: req.content.body ?? "", data: req.content.data ?? {}, sound: req.content.sound },
      { show: false },
    );
  }, Math.max(0, at - Date.now()));
  scheduled.set(id, { identifier: id, content: req.content, trigger: { date: at }, timer });
  return id;
}

export async function getAllScheduledNotificationsAsync() {
  return [...scheduled.values()].map(({ identifier, content, trigger }) => ({ identifier, content, trigger }));
}

export async function cancelScheduledNotificationAsync(id: string) {
  const s = scheduled.get(id);
  if (s) clearTimeout(s.timer);
  scheduled.delete(id);
}

export async function dismissAllNotificationsAsync() {}
