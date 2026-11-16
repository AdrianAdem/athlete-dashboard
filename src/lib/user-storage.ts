// localStorage keys that hold per-user data. Namespaced by user id so two
// accounts on one device never see each other's cache.
export type UserStorageKey = "active_workout_v1" | "food_recent";

export const userKey = (key: UserStorageKey, userId: string) => `${key}:${userId}`;

const ALL_KEYS: UserStorageKey[] = ["active_workout_v1", "food_recent"];

/** Removes every per-user cache of one account from this device. */
export function clearUserStorage(userId: string): void {
  try {
    for (const key of ALL_KEYS) localStorage.removeItem(userKey(key, userId));
  } catch {
    // Storage blocked (private mode): nothing cached, nothing to clear.
  }
}
