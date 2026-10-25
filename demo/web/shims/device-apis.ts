import { phoneName } from "../phone";

export const AFTER_FIRST_UNLOCK = "AFTER_FIRST_UNLOCK";
export type SecureStoreOptions = Record<string, unknown>;
const k = (key: string) => `rv_${phoneName}_${key}`;
export async function getItemAsync(key: string, _o?: unknown) {
  return localStorage.getItem(k(key));
}
export async function setItemAsync(key: string, value: string, _o?: unknown) {
  localStorage.setItem(k(key), value);
}
export async function deleteItemAsync(key: string, _o?: unknown) {
  localStorage.removeItem(k(key));
}

export const HOMES: Record<string, { lat: number; lng: number }> = {
  patient: { lat: 18.4102, lng: -66.0612 },
  family: { lat: 18.3835, lng: -66.1047 },
};
(window as unknown as { __demoHome: unknown }).__demoHome = HOMES[phoneName] ?? HOMES.family;

export const Accuracy = { Lowest: 1, Low: 2, Balanced: 3, High: 4, Highest: 5 };
export async function requestForegroundPermissionsAsync() {
  return { granted: true, status: "granted" };
}
export async function getCurrentPositionAsync(_o?: unknown) {
  await new Promise((ok) => setTimeout(ok, 900));
  const h = HOMES[phoneName] ?? HOMES.family;
  return { coords: { latitude: h.lat, longitude: h.lng, accuracy: 12 }, timestamp: Date.now() };
}

export enum BatteryState { UNKNOWN = 0, UNPLUGGED = 1, CHARGING = 2, FULL = 3, NOT_CHARGING = 4 }
export async function getPowerStateAsync() {
  return { batteryState: BatteryState.FULL, batteryLevel: 1, lowPowerMode: false };
}
export function addBatteryStateListener(_fn: unknown) {
  return { remove: () => {} };
}

export function defineTask(_name: string, _fn: unknown) {}
export async function isTaskRegisteredAsync(_name: string) {
  return true;
}
export enum BackgroundTaskResult { Success = 1, Failed = 2 }
export enum BackgroundTaskStatus { Restricted = 1, Available = 2 }
export async function getStatusAsync() {
  return BackgroundTaskStatus.Restricted;
}
export async function registerTaskAsync(_name: string, _o?: unknown) {}

export const isDevice = true;

export function useKeepAwake(_tag?: string) {}
export async function activateKeepAwakeAsync(_tag?: string) {}
export async function deactivateKeepAwake(_tag?: string) {}
