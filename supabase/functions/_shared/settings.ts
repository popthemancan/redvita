import { GRACE_MS, MINUTE } from "./logic.ts";

export function graceMs(): number {
  const n = Number(Deno.env.get("GRACE_MINUTES"));
  return Number.isFinite(n) && n >= 1 && n <= 60 ? n * MINUTE : GRACE_MS;
}
