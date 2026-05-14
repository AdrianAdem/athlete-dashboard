import { lazy, Suspense } from "react";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { Layout } from "@/components/layout";

const DashboardPage = lazy(() => import("@/features/dashboard/dashboard-page").then((m) => ({ default: m.DashboardPage })));
const AlltagPage = lazy(() => import("@/features/alltag/alltag-page").then((m) => ({ default: m.AlltagPage })));
const DailyTodosPage = lazy(() => import("@/features/daily-todos/daily-todos-page").then((m) => ({ default: m.DailyTodosPage })));
const CalendarPage = lazy(() => import("@/features/calendar/calendar-page").then((m) => ({ default: m.CalendarPage })));
const WeeklyReportPage = lazy(() => import("@/features/weekly-report/weekly-report-page").then((m) => ({ default: m.WeeklyReportPage })));
const SettingsPage = lazy(() => import("@/features/settings/settings-page").then((m) => ({ default: m.SettingsPage })));
const SportPage = lazy(() => import("@/features/sport/sport-page").then((m) => ({ default: m.SportPage })));
const SportTodosPage = lazy(() => import("@/features/sport-todos/sport-todos-page").then((m) => ({ default: m.SportTodosPage })));
const TrainingPlanPage = lazy(() => import("@/features/training-plan/training-plan-page").then((m) => ({ default: m.TrainingPlanPage })));
const TrainingLogPage = lazy(() => import("@/features/training-log/training-log-page").then((m) => ({ default: m.TrainingLogPage })));
const NutritionWaterPage = lazy(() => import("@/features/nutrition/nutrition-water-page").then((m) => ({ default: m.NutritionWaterPage })));
const MicronutrientsPage = lazy(() => import("@/features/nutrition/micronutrients-page").then((m) => ({ default: m.MicronutrientsPage })));
const WeightPage = lazy(() => import("@/features/weight/weight-page").then((m) => ({ default: m.WeightPage })));
const SportStatsPage = lazy(() => import("@/features/sport-stats/sport-stats-page").then((m) => ({ default: m.SportStatsPage })));

function Loading() {
  return <div className="flex min-h-screen items-center justify-center text-neutral-500">Laden...</div>;
}

export default function App() {
  return (
    <BrowserRouter basename="/life-manager">
      <Suspense fallback={<Loading />}>
        <Routes>
          <Route element={<Layout />}>
            {/* Dashboard */}
            <Route path="/" element={<DashboardPage />} />

            {/* Alltag */}
            <Route path="/alltag" element={<AlltagPage />} />
            <Route path="/alltag/todos" element={<DailyTodosPage />} />
            {/* Kalender */}
            <Route path="/kalender" element={<CalendarPage />} />
            <Route path="/alltag/berichte" element={<WeeklyReportPage />} />
            {/* Settings */}
            <Route path="/einstellungen" element={<SettingsPage />} />

            {/* Sport */}
            <Route path="/sport" element={<SportPage />} />
            <Route path="/sport/todos" element={<SportTodosPage />} />
            <Route path="/sport/plan" element={<TrainingPlanPage />} />
            <Route path="/sport/loggen" element={<TrainingLogPage />} />
            <Route path="/sport/ernaehrung" element={<NutritionWaterPage />} />
            <Route path="/sport/mikro" element={<MicronutrientsPage />} />
            <Route path="/sport/gewicht" element={<WeightPage />} />
            <Route path="/sport/statistiken" element={<SportStatsPage />} />

            {/* Fallback */}
            <Route path="*" element={<Navigate to="/" replace />} />
          </Route>
        </Routes>
      </Suspense>
    </BrowserRouter>
  );
}
