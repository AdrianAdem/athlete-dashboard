// Garmin Connect service — browser-based SSO login + edge function for API calls

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string;
const GARMIN_API = `${SUPABASE_URL}/functions/v1/garmin-sync`;

const GARMIN_SSO_EMBED = "https://sso.garmin.com/sso/embed";
const GARMIN_SERVICE_URL = "https://connect.garmin.com/modern";

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

/**
 * Opens Garmin SSO in a popup window.
 * User logs in directly at Garmin (browser TLS = no 429).
 * After login, Garmin redirects with a service ticket in the URL.
 * We extract the ticket and send it to our edge function for token exchange.
 */
export function openGarminLogin(): Promise<{ success: boolean; expiresIn: number }> {
  return new Promise((resolve, reject) => {
    const params = new URLSearchParams({
      clientId: "GarminConnect",
      locale: "en",
      service: GARMIN_SERVICE_URL,
      gauthHost: "https://sso.garmin.com/sso",
    });

    const loginUrl = `${GARMIN_SSO_EMBED}?${params}`;
    const width = 450;
    const height = 600;
    const left = window.screenX + (window.innerWidth - width) / 2;
    const top = window.screenY + (window.innerHeight - height) / 2;

    const popup = window.open(
      loginUrl,
      "garmin_login",
      `width=${width},height=${height},left=${left},top=${top},toolbar=no,menubar=no`,
    );

    if (!popup) {
      reject(new Error("Popup blocked. Bitte Popups erlauben."));
      return;
    }

    // Poll popup URL for ticket parameter
    const interval = setInterval(() => {
      try {
        if (popup.closed) {
          clearInterval(interval);
          reject(new Error("Login abgebrochen"));
          return;
        }

        const url = popup.location.href;

        // After successful login, Garmin redirects to service URL with ticket
        if (url.includes("connect.garmin.com") || url.includes("ticket=")) {
          clearInterval(interval);
          popup.close();

          const ticketMatch = url.match(/[?&]ticket=([^&]+)/);
          if (ticketMatch) {
            // Exchange ticket via edge function
            garminFetch("exchange-ticket", { ticket: ticketMatch[1] })
              .then(resolve)
              .catch(reject);
          } else {
            reject(new Error("Kein Ticket in Garmin-Redirect gefunden"));
          }
        }
      } catch {
        // Cross-origin — popup still on garmin.com, keep polling
      }
    }, 500);

    // Timeout after 5 min
    setTimeout(() => {
      clearInterval(interval);
      if (!popup.closed) popup.close();
      reject(new Error("Login Timeout (5 Minuten)"));
    }, 5 * 60 * 1000);
  });
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
