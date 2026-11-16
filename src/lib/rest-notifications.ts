import { LocalNotifications } from "@capacitor/local-notifications";
import { isNative } from "./platform";

// iOS stops a backgrounded web app, so the in-app rest timer cannot ring when
// the screen is locked. A local notification scheduled for the end time can.
// Everything here is a no-op in the browser.
const REST_NOTIFICATION_ID = 4101;

// Each call crosses the native bridge more than once. Run them one after the
// other, so "start rest" followed quickly by "skip" cannot be reordered into a
// notification that outlives the skip.
let queue: Promise<void> = Promise.resolve();
function enqueue(task: () => Promise<void>): Promise<void> {
  queue = queue.then(task).catch((err) => {
    // A missing reminder must never break the workout itself.
    console.error("Rest notification failed:", err);
  });
  return queue;
}

/** Asks for notification permission once; call at a calm moment (workout start). */
export async function ensureNotificationPermission(): Promise<boolean> {
  if (!isNative) return false;
  try {
    const current = await LocalNotifications.checkPermissions();
    if (current.display === "granted") return true;
    if (current.display === "denied") return false;
    return (await LocalNotifications.requestPermissions()).display === "granted";
  } catch {
    return false;
  }
}

function cancelNow(): Promise<void> {
  return (async () => {
    await LocalNotifications.cancel({ notifications: [{ id: REST_NOTIFICATION_ID }] });
    // Already-delivered banners stay in the Notification Center otherwise.
    await LocalNotifications.removeDeliveredNotifications({
      notifications: [{ id: REST_NOTIFICATION_ID, title: "", body: "" }],
    });
  })();
}

/** Schedules (or moves) the "rest is over" notification to `endsAtMs`. */
export function scheduleRestNotification(endsAtMs: number): Promise<void> {
  if (!isNative) return Promise.resolve();
  return enqueue(async () => {
    // An end time in the past means nothing should ring any more, including an
    // older notification that is still pending.
    if (endsAtMs <= Date.now()) return cancelNow();
    if ((await LocalNotifications.checkPermissions()).display !== "granted") return;
    // Same id replaces the pending one, so adjusting the timer just moves it.
    await LocalNotifications.schedule({
      notifications: [
        {
          id: REST_NOTIFICATION_ID,
          title: "Pause vorbei",
          body: "Nächster Satz.",
          // Without a sound iOS shows a silent banner, useless for a rest timer.
          sound: "default",
          schedule: { at: new Date(endsAtMs) },
        },
      ],
    });
  });
}

export function cancelRestNotification(): Promise<void> {
  if (!isNative) return Promise.resolve();
  return enqueue(cancelNow);
}
