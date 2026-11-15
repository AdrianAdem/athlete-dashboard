import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatDate(date: Date | string): string {
  const d = typeof date === "string" ? new Date(date) : date;
  return d.toLocaleDateString("de-DE", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

/**
 * YYYY-MM-DD in the device's local time zone.
 *
 * Never use `toISOString()` for calendar dates: it is UTC, so in Germany
 * everything logged between midnight and 1 am (2 am in summer) landed on the
 * previous day, and a Monday routine tick at 00:30 went into Sunday's log.
 */
export function toLocalDateString(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function todayString(): string {
  return toLocalDateString(new Date());
}

/** Local date `days` days from today (negative = past). */
export function daysFromToday(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return toLocalDateString(d);
}

export function isRoutineActiveToday(startDate: string | null, endDate: string | null): boolean {
  const today = todayString();
  if (startDate && today < startDate) return false;
  if (endDate && today > endDate) return false;
  return true;
}
