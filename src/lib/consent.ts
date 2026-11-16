import { supabase } from "./supabase";
import { uid } from "./auth";

// Bump a version when its consent text changes materially; everyone is asked again.
export const CONSENTS = {
  health_data: "2026-11",
  ai_processing: "2026-11",
} as const;
export type ConsentKind = keyof typeof CONSENTS;

/** True when this user has accepted the current version of this consent. */
export async function hasConsent(kind: ConsentKind): Promise<boolean> {
  const { data, error } = await supabase
    .from("user_consents")
    .select("version")
    .eq("user_id", uid())
    .eq("kind", kind)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data?.version === CONSENTS[kind];
}

// accepted_at is stamped by the database (trigger), never by the client.
export async function saveConsent(kind: ConsentKind): Promise<void> {
  const { error } = await supabase
    .from("user_consents")
    .upsert({ user_id: uid(), kind, version: CONSENTS[kind] }, { onConflict: "user_id,kind" });
  if (error) throw new Error(error.message);
}

export async function withdrawConsent(kind: ConsentKind): Promise<void> {
  const { error } = await supabase
    .from("user_consents")
    .delete()
    .eq("user_id", uid())
    .eq("kind", kind);
  if (error) throw new Error(error.message);
}
