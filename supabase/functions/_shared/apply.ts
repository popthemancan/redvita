import type { SupabaseClient } from "npm:@supabase/supabase-js@2";
import { type PatientRow, toRow, toState } from "./db.ts";
import { alertField, isUrgent, type Outcome, type PatientState } from "./logic.ts";
import { type AlertCtx, alertContacts, promptPatient } from "./notify.ts";

export async function applyOutcome(
  db: SupabaseClient,
  row: PatientRow,
  out: Outcome,
  ctx: AlertCtx = {},
): Promise<PatientRow | null> {
  const update = toRow(out.patch);
  const { data, error } = await db
    .from("patients")
    .update({ ...update, version: row.version + 1 })
    .eq("id", row.id)
    .eq("version", row.version)
    .select("*")
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  const next = data as PatientRow;

  if (out.promptPatient) {
    const due = next.next_checkin_at ? Date.parse(next.next_checkin_at) : Date.now();
    try {
      await promptPatient(next, due);
    } catch (e) {
      console.error("prompt failed", e);
    }
  }

  for (const kind of out.alerts) {
    let delivery = { reachable: 0, delivered: 0 };
    try {
      delivery = await alertContacts(db, next, kind, ctx);
    } catch (e) {
      console.error("alert failed", kind, e);
      delivery = { reachable: 1, delivered: 0 };
    }
    const field = alertField(kind);
    if (isUrgent(kind) && field && delivery.reachable > 0 && delivery.delivered === 0) {
      const undo: Partial<PatientState> = { [field]: toState(row)[field] };
      await db.from("patients").update(toRow(undo)).eq("id", row.id).eq("version", next.version);
    }
  }
  return next;
}
