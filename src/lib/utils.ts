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

export function todayString(): string {
  return new Date().toISOString().split("T")[0];
}

export function isRoutineActiveToday(startDate: string | null, endDate: string | null): boolean {
  const today = todayString();
  if (startDate && today < startDate) return false;
  if (endDate && today > endDate) return false;
  return true;
}
