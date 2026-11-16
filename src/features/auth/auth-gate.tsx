import { Fragment } from "react";
import type { ReactNode } from "react";
import { useAuth } from "@/lib/auth";
import { LoginPage, NewPasswordPage } from "./login-page";

export function AuthGate({ children }: { children: ReactNode }) {
  const { session, loading, recovering } = useAuth();
  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center text-neutral-500">Laden...</div>
    );
  }
  if (recovering) return <NewPasswordPage />;
  if (!session) return <LoginPage />;
  // Keyed by user: if another tab signs in as someone else, every provider and
  // page remounts instead of carrying the previous user's in-memory state over.
  return <Fragment key={session.user.id}>{children}</Fragment>;
}
