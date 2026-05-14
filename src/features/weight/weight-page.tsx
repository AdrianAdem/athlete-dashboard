import { useState, useEffect, useCallback } from "react";
import { Plus } from "lucide-react";
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend,
} from "recharts";
import { supabase } from "@/lib/supabase";
import { USER_ID } from "@/lib/constants";
import { todayString } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import type { WeightLog } from "@/types/database";

type TimeRange = "7" | "30" | "90" | "365";

export function WeightPage() {
  const [logs, setLogs] = useState<WeightLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [range, setRange] = useState<TimeRange>("30");

  const [weight, setWeight] = useState<number>(0);
  const [bodyFat, setBodyFat] = useState<string>("");
  const [muscleMass, setMuscleMass] = useState<string>("");
  const [waist, setWaist] = useState<string>("");
  const [notes, setNotes] = useState("");

  const [showWeight, setShowWeight] = useState(true);
  const [showFat, setShowFat] = useState(false);
  const [showMuscle, setShowMuscle] = useState(false);

  const fetchLogs = useCallback(async () => {
    const daysBack = Number(range);
    const since = new Date();
    since.setDate(since.getDate() - daysBack);

    const { data } = await supabase
      .from("weight_log")
      .select("*")
      .eq("user_id", USER_ID)
      .gte("date", since.toISOString().split("T")[0])
      .order("date", { ascending: true });
    if (data) setLogs(data as WeightLog[]);
    setLoading(false);
  }, [range]);

  useEffect(() => {
    fetchLogs();
  }, [fetchLogs]);

  const addEntry = async () => {
    if (weight <= 0) return;
    const { data } = await supabase
      .from("weight_log")
      .insert({
        user_id: USER_ID,
        date: todayString(),
        weight_kg: weight,
        body_fat_percent: bodyFat ? Number(bodyFat) : null,
        muscle_mass_kg: muscleMass ? Number(muscleMass) : null,
        waist_cm: waist ? Number(waist) : null,
        notes: notes.trim() || null,
      })
      .select()
      .single();
    if (data) {
      setLogs((prev) => [...prev, data as WeightLog].sort((a, b) => a.date.localeCompare(b.date)));
      setDialogOpen(false);
      setWeight(0);
      setBodyFat("");
      setMuscleMass("");
      setWaist("");
      setNotes("");
    }
  };

  const chartData = logs.map((l) => ({
    date: new Date(l.date).toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit" }),
    Gewicht: l.weight_kg,
    "Körperfett %": l.body_fat_percent,
    "Muskelmasse": l.muscle_mass_kg,
  }));

  if (loading) {
    return <div className="flex items-center justify-center p-8 text-muted-foreground">Laden...</div>;
  }

  return (
    <div className="space-y-4 p-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold">Gewicht</h1>
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogTrigger asChild>
            <Button size="sm"><Plus className="mr-1 h-4 w-4" /> Eintrag</Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Gewicht eintragen</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <div className="space-y-2">
                <Label>Gewicht (kg) *</Label>
                <Input type="number" step="0.1" value={weight || ""} onChange={(e) => setWeight(Number(e.target.value))} />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1">
                  <Label className="text-xs">Körperfett %</Label>
                  <Input type="number" step="0.1" value={bodyFat} onChange={(e) => setBodyFat(e.target.value)} />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Muskelmasse kg</Label>
                  <Input type="number" step="0.1" value={muscleMass} onChange={(e) => setMuscleMass(e.target.value)} />
                </div>
              </div>
              <div className="space-y-2">
                <Label>Bauchumfang (cm)</Label>
                <Input type="number" step="0.1" value={waist} onChange={(e) => setWaist(e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label>Notizen</Label>
                <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} />
              </div>
              <Button onClick={addEntry} className="w-full" disabled={weight <= 0}>Speichern</Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      {/* Time range */}
      <div className="flex gap-2">
        {(["7", "30", "90", "365"] as TimeRange[]).map((r) => (
          <Button key={r} variant={range === r ? "default" : "outline"} size="sm" onClick={() => setRange(r)}>
            {r === "365" ? "1J" : `${r}T`}
          </Button>
        ))}
      </div>

      {/* Toggle lines */}
      <div className="flex gap-2 text-xs">
        <button onClick={() => setShowWeight(!showWeight)} className={showWeight ? "text-blue-500 font-semibold" : "text-muted-foreground"}>
          Gewicht
        </button>
        <button onClick={() => setShowFat(!showFat)} className={showFat ? "text-orange-500 font-semibold" : "text-muted-foreground"}>
          Körperfett
        </button>
        <button onClick={() => setShowMuscle(!showMuscle)} className={showMuscle ? "text-green-500 font-semibold" : "text-muted-foreground"}>
          Muskelmasse
        </button>
      </div>

      {/* Chart */}
      <Card>
        <CardContent className="p-2">
          {chartData.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">Keine Daten im gewählten Zeitraum</p>
          ) : (
            <ResponsiveContainer width="100%" height={250}>
              <LineChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                <XAxis dataKey="date" tick={{ fontSize: 10 }} />
                <YAxis tick={{ fontSize: 10 }} />
                <Tooltip />
                <Legend />
                {showWeight && <Line type="monotone" dataKey="Gewicht" stroke="#3b82f6" strokeWidth={2} dot={false} />}
                {showFat && <Line type="monotone" dataKey="Körperfett %" stroke="#f97316" strokeWidth={2} dot={false} />}
                {showMuscle && <Line type="monotone" dataKey="Muskelmasse" stroke="#22c55e" strokeWidth={2} dot={false} />}
              </LineChart>
            </ResponsiveContainer>
          )}
        </CardContent>
      </Card>

      {/* Latest entry */}
      {logs.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">Letzter Eintrag</CardTitle>
          </CardHeader>
          <CardContent className="text-sm">
            {(() => {
              const last = logs[logs.length - 1];
              return (
                <div className="grid grid-cols-2 gap-2">
                  <div>Gewicht: <strong>{last.weight_kg} kg</strong></div>
                  {last.body_fat_percent && <div>Körperfett: <strong>{last.body_fat_percent}%</strong></div>}
                  {last.muscle_mass_kg && <div>Muskelmasse: <strong>{last.muscle_mass_kg} kg</strong></div>}
                  {last.waist_cm && <div>Bauchumfang: <strong>{last.waist_cm} cm</strong></div>}
                </div>
              );
            })()}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
