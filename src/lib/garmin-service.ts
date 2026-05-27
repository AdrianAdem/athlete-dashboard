// Garmin Connect service — talks to garmin-sync edge function

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string;
const GARMIN_API = `${SUPABASE_URL}/functions/v1/garmin-sync`;

async function garminFetch(endpoint: string, body: Record<string, unknown> = {}) {
  const res = await fetch(`${GARMIN_API}/${endpoint}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(err.error ?? `Garmin API error: ${res.status}`);
  }
  return res.json();
}

export async function getGarminStatus(): Promise<{
  connected: boolean;
  expires_at: number | null;
  expired: boolean;
}> {
  return garminFetch("status");
}

export async function loginGarmin(email: string, password: string): Promise<{ success: boolean; expiresIn: number }> {
  return garminFetch("login", { email, password });
}

export async function syncGarminHealth(date?: string): Promise<Record<string, unknown>> {
  return garminFetch("sync", date ? { date } : {});
}

export async function bulkSyncGarmin(days = 7): Promise<{ synced: number; results: unknown[] }> {
  return garminFetch("bulk-sync", { days });
}

export interface GarminHealthEntry {
  date: string;
  data: Record<string, unknown>;
}

export async function getGarminData(startDate: string, endDate: string): Promise<GarminHealthEntry[]> {
  return garminFetch("data", { start_date: startDate, end_date: endDate });
}
