import { useNavigate } from "react-router-dom";
import { CheckSquare, ClipboardList, Dumbbell, BarChart3, Flame, Scale } from "lucide-react";
import { cn } from "@/lib/utils";

const sections = [
  { path: "/sport/todos", label: "Aufgaben", icon: CheckSquare, color: "text-blue-400" },
  { path: "/sport/plan", label: "Trainingsplan", icon: ClipboardList, color: "text-green-500" },
  { path: "/sport/loggen", label: "Training loggen", icon: Dumbbell, color: "text-orange-500" },
  { path: "/sport/ernaehrung", label: "Ernährung & Wasser", icon: Flame, color: "text-yellow-500" },
  { path: "/sport/gewicht", label: "Gewicht", icon: Scale, color: "text-purple-400" },
  { path: "/sport/statistiken", label: "Statistiken", icon: BarChart3, color: "text-cyan-400" },
] as const;

export function SportPage() {
  const navigate = useNavigate();

  return (
    <div className="p-4">
      <h1 className="mb-4 text-2xl font-bold">Sport</h1>
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
