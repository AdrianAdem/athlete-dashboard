import { Preferences } from "@capacitor/preferences";

// Supabase session storage for the iOS shell. WKWebView may clear localStorage
// under storage pressure, which would silently sign the user out; Preferences
// lives in native UserDefaults and survives that. Note: UserDefaults is not the
// Keychain, so the session is stored unencrypted and is part of device backups.
// Moving it to a Keychain-backed plugin is a known follow-up.
export const preferencesStorage = {
  async getItem(key: string): Promise<string | null> {
    const { value } = await Preferences.get({ key });
    return value;
  },
  async setItem(key: string, value: string): Promise<void> {
    await Preferences.set({ key, value });
  },
  async removeItem(key: string): Promise<void> {
    await Preferences.remove({ key });
  },
};

// supabase-js keeps the PKCE verifier under "<storageKey>-code-verifier" and the
// default storage key is "sb-<project ref>-auth-token".
export async function hasPendingCodeVerifier(): Promise<boolean> {
  const ref = new URL(import.meta.env.VITE_SUPABASE_URL as string).hostname.split(".")[0];
  return (await preferencesStorage.getItem(`sb-${ref}-auth-token-code-verifier`)) !== null;
}
