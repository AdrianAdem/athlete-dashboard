import { HeartPulse } from "lucide-react";

export function AusdauerPage() {
  return (
    <div className="p-4">
      <h1 className="mb-4 text-2xl font-bold">Ausdauer</h1>
      <div className="flex flex-col items-center gap-4 rounded-xl bg-card py-12 text-center">
        <HeartPulse className="h-12 w-12 text-neutral-600" />
        <p className="text-sm text-neutral-500">Ausdauer-Tracking kommt bald.</p>
      </div>
    </div>
  );
}
