import * as SecureStore from "expo-secure-store";
import type { LatLng } from "./location";
import { emptyLocal, type Local } from "./rules";

const opts: SecureStore.SecureStoreOptions = {
  keychainAccessible: SecureStore.AFTER_FIRST_UNLOCK,
};

async function read<T>(key: string): Promise<T | null> {
  const raw = await SecureStore.getItemAsync(key, opts);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

async function write(key: string, value: unknown): Promise<void> {
  if (value === null) await SecureStore.deleteItemAsync(key, opts);
  else await SecureStore.setItemAsync(key, JSON.stringify(value), opts);
}

export type Role = "patient" | "family";

export type PatientIdentity = {
  patientId: string;
  secret: string;
  name: string;
  linkCode: string;
  need?: string;
};

export type FamilyLink = {
  contactId: string;
  secret: string;
  patientName: string;
};

export type FamilyMe = { name: string; phone: string; home?: LatLng | null };

export const store = {
  getRole: () => read<Role>("role"),
  setRole: (r: Role | null) => write("role", r),

  getPatient: () => read<PatientIdentity>("patient"),
  setPatient: (p: PatientIdentity | null) => write("patient", p),

  getChargerDetection: async () => (await read<boolean>("charger_detection")) === true,
  setChargerDetection: (on: boolean) => write("charger_detection", on),

  getLocal: async () => (await read<Local>("patient_local")) ?? { ...emptyLocal },
  setLocal: (l: Local) => write("patient_local", l),

  getLinks: async () => (await read<FamilyLink[]>("family_links")) ?? [],
  setLinks: (l: FamilyLink[]) => write("family_links", l),

  getFamilyPhone: () => read<FamilyMe>("family_me"),
  setFamilyPhone: (v: FamilyMe) => write("family_me", v),
};
