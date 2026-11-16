import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import { LEGAL } from "./legal-config";

export function LegalLayout({ title, children }: { title: string; children: ReactNode }) {
  return (
    <main className="mx-auto min-h-screen max-w-2xl px-5 py-8 pb-16">
      <Link to="/" className="mb-6 inline-flex items-center gap-1 text-xs text-neutral-400">
        <ArrowLeft className="h-3.5 w-3.5" /> Zurück
      </Link>
      <h1 className="mb-1 text-xl font-bold">{title}</h1>
      <p className="mb-6 text-xs text-neutral-500">Stand: {LEGAL.updated}</p>
      <div className="space-y-5 text-sm leading-relaxed text-neutral-300">{children}</div>
      <nav className="mt-10 flex flex-wrap gap-x-4 gap-y-1 text-xs text-neutral-500">
        <Link to="/datenschutz">Datenschutz</Link>
        <Link to="/impressum">Impressum</Link>
        <Link to="/gesundheitshinweis">Gesundheitshinweis</Link>
      </nav>
    </main>
  );
}

export function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="space-y-2">
      <h2 className="text-sm font-semibold text-neutral-100">{title}</h2>
      {children}
    </section>
  );
}

export function LegalLinks({ className }: { className?: string }) {
  return (
    <p className={className}>
      <Link to="/datenschutz" className="underline">
        Datenschutz
      </Link>
      {" · "}
      <Link to="/impressum" className="underline">
        Impressum
      </Link>
      {" · "}
      <Link to="/gesundheitshinweis" className="underline">
        Gesundheitshinweis
      </Link>
    </p>
  );
}
