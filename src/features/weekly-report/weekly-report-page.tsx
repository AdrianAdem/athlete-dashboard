import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/lib/supabase";
import { USER_ID } from "@/lib/constants";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { WeeklyReport } from "@/types/database";

interface ReportData {
  week_start: string;
  training: { sessions: number; total_sets: number };
  nutrition: { avg_calories: number };
  weight: { start: number | null; end: number | null };
  todos: {
    daily_completed: number;
    daily_total: number;
    sport_completed: number;
    sport_total: number;
  };
}

export function WeeklyReportPage() {
  const [reports, setReports] = useState<WeeklyReport[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchReports = useCallback(async () => {
    const { data } = await supabase
      .from("weekly_reports")
      .select("*")
      .eq("user_id", USER_ID)
      .order("week_start", { ascending: false })
      .limit(12);
    if (data) setReports(data as WeeklyReport[]);
    setLoading(false);
  }, []);

  useEffect(() => { fetchReports(); }, [fetchReports]);

  if (loading) return <div className="flex items-center justify-center p-8 text-muted-foreground">Laden...</div>;

  return (
    <div className="space-y-4 p-4">
      <h1 className="text-xl font-bold">Wochenberichte</h1>

      {reports.length === 0 ? (
        <Card>
          <CardContent className="py-8 text-center text-muted-foreground">
            Noch keine Berichte. Frag deinen AI-Trainer einen Wochenbericht zu generieren.
          </CardContent>
        </Card>
      ) : (
        reports.map((report) => {
          const data = report.report_json as unknown as ReportData;
          const weekStart = new Date(report.week_start).toLocaleDateString("de-DE");
          return (
            <Card key={report.id}>
              <CardHeader>
                <CardTitle className="text-sm">Woche ab {weekStart}</CardTitle>
                <p className="text-xs text-muted-foreground">
                  Erstellt: {new Date(report.generated_at).toLocaleDateString("de-DE")}
                </p>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div>
                    <p className="text-muted-foreground">Training</p>
                    <p className="font-medium">{data.training?.sessions ?? 0} Sessions</p>
                    <p className="text-xs">{data.training?.total_sets ?? 0} Sätze gesamt</p>
                  </div>
                  <div>
                    <p className="text-muted-foreground">Ernährung</p>
                    <p className="font-medium">Ø {data.nutrition?.avg_calories ?? 0} kcal/Tag</p>
                  </div>
                  <div>
                    <p className="text-muted-foreground">Gewicht</p>
                    <p className="font-medium">
                      {data.weight?.start != null && data.weight?.end != null
                        ? `${data.weight.start} → ${data.weight.end} kg`
                        : "Keine Daten"}
                    </p>
                  </div>
                  <div>
                    <p className="text-muted-foreground">Todos</p>
                    <p className="font-medium">
                      {data.todos?.daily_completed ?? 0}/{data.todos?.daily_total ?? 0} Daily
                    </p>
                    <p className="text-xs">
                      {data.todos?.sport_completed ?? 0}/{data.todos?.sport_total ?? 0} Sport
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>
          );
        })
      )}
    </div>
  );
}
