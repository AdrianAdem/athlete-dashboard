// localStorage keys that hold per-user data. Namespaced by user id so two
// accounts on one device never see each other's cache.
export type UserStorageKey = "active_workout_v1" | "food_recent";

export const userKey = (key: UserStorageKey, userId: string) => `${key}:${userId}`;
