import { lazy, Suspense } from "react";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { Layout } from "@/components/layout";
import { WorkoutProvider } from "@/lib/workout-context";

const DashboardPage = lazy(() => import("@/features/dashboard/dashboard-page").then((m) => ({ default: m.DashboardPage })));
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
const AusdauerPage = lazy(() => import("@/features/ausdauer/ausdauer-page").then((m) => ({ default: m.AusdauerPage })));

function Loading() {
  return <div className="flex min-h-screen items-center justify-center text-neutral-500">Laden...</div>;
}

export default function App() {
  return (
    <BrowserRouter basename="/life-manager">
      <WorkoutProvider>
      <Suspense fallback={<Loading />}>
        <Routes>
          <Route element={<Layout />}>
            {/* Dashboard */}
            <Route path="/" element={<DashboardPage />} />

            {/* Legacy redirects */}
            <Route path="/alltag/*" element={<Navigate to="/sport/todos" replace />} />
            <Route path="/kalender" element={<Navigate to="/" replace />} />
            {/* Settings */}
            <Route path="/einstellungen" element={<SettingsPage />} />

            {/* Sport */}
            <Route path="/sport" element={<SportPage />} />
            <Route path="/sport/todos" element={<SportTodosPage />} />
            <Route path="/sport/plan" element={<TrainingPlanPage />} />
            <Route path="/sport/loggen" element={<TrainingLogPage />} />
            <Route path="/sport/gewicht" element={<WeightPage />} />

            {/* Ernährung */}
            <Route path="/ernaehrung" element={<NutritionWaterPage />} />
            <Route path="/ernaehrung/mikro" element={<MicronutrientsPage />} />
            {/* Legacy redirect */}
            <Route path="/sport/ernaehrung" element={<Navigate to="/ernaehrung" replace />} />
            <Route path="/sport/mikro" element={<Navigate to="/ernaehrung/mikro" replace />} />
            {/* Ausdauer */}
            <Route path="/ausdauer" element={<AusdauerPage />} />

            <Route path="/sport/statistiken" element={<SportStatsPage />} />
            <Route path="/sport/berichte" element={<WeeklyReportPage />} />

            {/* Fallback */}
            <Route path="*" element={<Navigate to="/" replace />} />
          </Route>
        </Routes>
      </Suspense>
      </WorkoutProvider>
    </BrowserRouter>
  );
}
