import { useState, useEffect, useCallback } from "react";
import { Droplets } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { USER_ID } from "@/lib/constants";
import { todayString } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import type { WaterLog } from "@/types/database";

export function WaterPage() {
  const [logs, setLogs] = useState<WaterLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [customAmount, setCustomAmount] = useState(300);

  const goal = 3000;

  const fetchLogs = useCallback(async () => {
    const { data } = await supabase
      .from("water_log")
      .select("*")
      .eq("user_id", USER_ID)
      .eq("date", todayString())
      .order("logged_at", { ascending: true });
    if (data) setLogs(data as WaterLog[]);
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchLogs();
  }, [fetchLogs]);

  const addWater = async (amount: number) => {
    const { data } = await supabase
      .from("water_log")
      .insert({
        user_id: USER_ID,
        date: todayString(),
        amount_ml: amount,
      })
      .select()
      .single();
    if (data) setLogs((prev) => [...prev, data as WaterLog]);
  };

  const total = logs.reduce((sum, l) => sum + l.amount_ml, 0);
  const pct = Math.min((total / goal) * 100, 100);

  if (loading) {
    return <div className="flex items-center justify-center p-8 text-muted-foreground">Laden...</div>;
  }

  return (
    <div className="space-y-4 p-4">
      <h1 className="text-xl font-bold">Wassertracker</h1>

      <Card>
        <CardContent className="flex flex-col items-center gap-4 p-6">
          <div className="relative flex h-40 w-40 items-center justify-center">
            <svg viewBox="0 0 100 100" className="h-full w-full -rotate-90">
              <circle cx="50" cy="50" r="42" fill="none" stroke="currentColor" className="text-muted" strokeWidth="8" />
              <circle
                cx="50" cy="50" r="42" fill="none" stroke="#3b82f6" strokeWidth="8"
                strokeDasharray={2 * Math.PI * 42}
                strokeDashoffset={2 * Math.PI * 42 * (1 - pct / 100)}
                strokeLinecap="round"
              />
            </svg>
            <div className="absolute flex flex-col items-center">
              <Droplets className="h-6 w-6 text-blue-500" />
              <span className="text-lg font-bold">{total} ml</span>
              <span className="text-xs text-muted-foreground">von {goal} ml</span>
            </div>
          </div>

          <div className="flex gap-2">
            <Button variant="outline" onClick={() => addWater(250)}>+250 ml</Button>
            <Button variant="outline" onClick={() => addWater(500)}>+500 ml</Button>
          </div>

          <div className="flex items-center gap-2">
            <Input
              type="number"
              value={customAmount}
              onChange={(e) => setCustomAmount(Number(e.target.value))}
              className="w-24"
            />
            <span className="text-sm text-muted-foreground">ml</span>
            <Button size="sm" onClick={() => addWater(customAmount)}>Hinzufügen</Button>
          </div>
        </CardContent>
      </Card>

      <div className="space-y-1">
        <h2 className="text-sm font-semibold text-muted-foreground">Heutige Einträge</h2>
        {logs.map((log) => (
          <div key={log.id} className="flex items-center justify-between rounded-md border p-2 text-sm">
            <span>{log.amount_ml} ml</span>
            <span className="text-xs text-muted-foreground">
              {new Date(log.logged_at).toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit" })}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
