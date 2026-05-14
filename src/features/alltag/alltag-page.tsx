import { useNavigate } from "react-router-dom";
import { CheckSquare, BarChart3 } from "lucide-react";
import { cn } from "@/lib/utils";

const sections = [
  { path: "/alltag/todos", label: "Tages-Todos", icon: CheckSquare, color: "text-blue-400" },
  { path: "/alltag/berichte", label: "Wochenberichte", icon: BarChart3, color: "text-pink-400" },
] as const;

export function AlltagPage() {
  const navigate = useNavigate();

  return (
    <div className="p-4">
      <h1 className="mb-4 text-2xl font-bold">Alltag</h1>
      <div className="grid grid-cols-2 gap-3">
        {sections.map((s) => {
          const Icon = s.icon;
          return (
            <button
              key={s.path}
              className="flex flex-col items-center gap-3 rounded-xl bg-card p-5 transition-all active:scale-[0.97]"
              onClick={() => navigate(s.path)}
            >
              <Icon className={cn("h-7 w-7", s.color)} />
              <span className="text-xs font-medium text-neutral-300">{s.label}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
