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
  { path: "/alltag", label: "Alltag", icon: CalendarCheck },
  { path: "/sport", label: "Sport", icon: Dumbbell },
  { path: "/", label: "Home", icon: Home, center: true },
  { path: "/kalender", label: "Kalender", icon: CalendarDays },
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
    <div className="flex min-h-screen flex-col bg-background pt-[env(safe-area-inset-top,0px)]">
      <main className="flex-1 overflow-y-auto pb-24">
        <Outlet />
      </main>

      <nav className="fixed inset-x-0 bottom-0 z-50 bg-background/95 backdrop-blur pb-[env(safe-area-inset-bottom,8px)]">
        <div className="flex h-[4.5rem] items-end justify-around pb-1">
          {tabs.map((tab) => {
            const Icon = tab.icon;
            const active = activeTab === tab.path;
            const isCenter = "center" in tab && tab.center;
            return (
              <button
                key={tab.path}
                className={cn(
                  "flex flex-1 flex-col items-center transition-colors",
                  isCenter ? "-mt-6 gap-1" : "gap-1.5 justify-center",
                  active ? "text-white" : "text-neutral-500"
                )}
                onClick={() => navigate(tab.path)}
              >
                {isCenter ? (
                  <div className={cn(
                    "flex h-14 w-14 items-center justify-center rounded-full shadow-lg shadow-white/10 transition-all",
                    active ? "bg-white" : "bg-neutral-800"
                  )}>
                    <Icon className={cn("h-7 w-7", active ? "text-black" : "text-neutral-400")} strokeWidth={2} />
                  </div>
                ) : (
                  <Icon className="h-6 w-6" strokeWidth={active ? 2.5 : 1.5} />
                )}
                <span className={cn("text-xs font-medium", isCenter && active && "text-white")}>{tab.label}</span>
              </button>
            );
          })}
        </div>
      </nav>
    </div>
  );
}
