import { Outlet, useLocation, useNavigate } from "react-router-dom";
import {
  Home,
  Dumbbell,
  CalendarCheck,
  CalendarDays,
  Settings,
} from "lucide-react";
import { cn } from "@/lib/utils";

const tabs = [
  { path: "/", label: "Home", icon: Home },
  { path: "/alltag", label: "Alltag", icon: CalendarCheck },
  { path: "/kalender", label: "Kalender", icon: CalendarDays },
  { path: "/sport", label: "Sport", icon: Dumbbell },
  { path: "/einstellungen", label: "Settings", icon: Settings },
] as const;

export function Layout() {
  const location = useLocation();
  const navigate = useNavigate();

  const activeTab = (() => {
    for (const tab of tabs) {
      if (tab.path === "/" && location.pathname === "/") return "/";
      if (tab.path !== "/" && location.pathname.startsWith(tab.path)) return tab.path;
    }
    return "/";
  })();

  return (
    <div className="flex min-h-screen flex-col bg-background">
      <main className="flex-1 overflow-y-auto pb-28">
        <Outlet />
      </main>

      <nav className="fixed inset-x-0 bottom-0 z-50 border-t border-border bg-background/95 backdrop-blur pb-[env(safe-area-inset-bottom,8px)]">
        <div className="flex h-20 items-center justify-around">
          {tabs.map((tab) => {
            const Icon = tab.icon;
            const active = activeTab === tab.path;
            return (
              <button
                key={tab.path}
                className={cn(
                  "flex h-full flex-1 flex-col items-center justify-center gap-1.5 transition-colors",
                  active ? "text-white" : "text-neutral-500"
                )}
                onClick={() => navigate(tab.path)}
              >
                <Icon className="h-6 w-6" strokeWidth={active ? 2.5 : 1.5} />
                <span className="text-xs font-medium">{tab.label}</span>
              </button>
            );
          })}
        </div>
      </nav>
    </div>
  );
}
