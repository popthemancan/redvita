import { call } from "./api";
import { lang } from "./i18n";
import { askPermission, getPushToken } from "./notifications";
import { store } from "./storage";

export async function registerPush(): Promise<string | null> {
  if (!(await askPermission())) return null;
  const token = await getPushToken();
  if (!token) return null;
  try {
    const me = await store.getPatient();
    if (me) await call("update_push_token", { patientId: me.patientId, secret: me.secret, pushToken: token, lang });
    for (const link of await store.getLinks()) {
      await call("update_push_token", { contactId: link.contactId, secret: link.secret, pushToken: token, lang });
    }
  } catch {
  }
  return token;
}
