import { supabase, functionHeaders } from "./supabase";
import { uid } from "./auth";
import { clearUserStorage } from "./user-storage";

const FUNCTIONS_URL = import.meta.env.VITE_SUPABASE_URL + "/functions/v1";

/** Deletes the signed-in account and all its data, then signs out locally. */
export async function deleteAccount(): Promise<void> {
  const userId = uid();
  const res = await fetch(`${FUNCTIONS_URL}/delete-account`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...(await functionHeaders()) },
    body: JSON.stringify({ confirm: "DELETE" }),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.error ?? `Löschen fehlgeschlagen (${res.status})`);
  // The account is gone: drop its caches from this device too.
  clearUserStorage(userId);
  // The server already removed the user; this only clears the local session.
  await supabase.auth.signOut({ scope: "local" });
}
