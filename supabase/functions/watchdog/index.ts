import { applyOutcome } from "../_shared/apply.ts";
import { admin, type PatientRow, toState } from "../_shared/db.ts";
import { evaluate } from "../_shared/logic.ts";
import { graceMs } from "../_shared/settings.ts";

const db = admin();

Deno.serve(async (req) => {
  const expected = Deno.env.get("WATCHDOG_SECRET");
  if (!expected || req.headers.get("x-watchdog-secret") !== expected) {
    return new Response("unauthorized", { status: 401 });
  }

  const { data, error } = await db
    .from("patients")
    .select("*")
    .or("next_checkin_at.not.is.null,outage_started_at.not.is.null");
  if (error) return new Response(error.message, { status: 500 });

  const now = Date.now();
  let acted = 0;
  for (const row of (data ?? []) as PatientRow[]) {
    const out = evaluate(toState(row), now, graceMs());
    if (out.promptPatient || out.alerts.length > 0) {
      try {
        if (await applyOutcome(db, row, out)) acted++;
      } catch (e) {
        console.error("watchdog failed for", row.id, e);
      }
    }
  }
  return Response.json({ checked: data?.length ?? 0, acted });
});
