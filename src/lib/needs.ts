import type { IconName } from "@/ui/components";
import { t } from "./i18n";
import { MINUTE } from "./rules";

export type Need = "oxygen" | "breathing" | "dialysis" | "fridge" | "bed" | "other";

type NeedInfo = { title: string; label: string; icon: IconName; repeatMs: number; every: string };

const base: Record<Need, { icon: IconName; repeatMs: number }> = {
  oxygen: { icon: "fitness", repeatMs: 60 * MINUTE },
  breathing: { icon: "pulse", repeatMs: 60 * MINUTE },
  dialysis: { icon: "water", repeatMs: 120 * MINUTE },
  fridge: { icon: "snow", repeatMs: 240 * MINUTE },
  bed: { icon: "bed", repeatMs: 240 * MINUTE },
  other: { icon: "flash", repeatMs: 120 * MINUTE },
};

export const NEEDS = Object.fromEntries(
  (Object.keys(base) as Need[]).map((k) => [k, { ...base[k], ...t.needs[k] }]),
) as Record<Need, NeedInfo>;

export const needOf = (v: unknown): Need => (typeof v === "string" && v in NEEDS ? (v as Need) : "other");
