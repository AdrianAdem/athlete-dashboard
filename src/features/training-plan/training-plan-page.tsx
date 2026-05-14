import { useState, useEffect, useCallback } from "react";
import { Plus, Trash2, X } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { USER_ID } from "@/lib/constants";
import { Input } from "@/components/ui/input";
import type { TrainingPlan, TrainingExercise } from "@/types/database";

interface ExerciseInput {
  name: string;
  muscle_group: string;
  sets: number;
  reps: number;
  day_label: string;
}

export function TrainingPlanPage() {
  const [activePlan, setActivePlan] = useState<TrainingPlan | null>(null);
  const [exercises, setExercises] = useState<TrainingExercise[]>([]);
  const [loading, setLoading] = useState(true);

  // New plan form
  const [showNewPlan, setShowNewPlan] = useState(false);
  const [planName, setPlanName] = useState("");
  const [planExercises, setPlanExercises] = useState<ExerciseInput[]>([
    { name: "", muscle_group: "", sets: 3, reps: 10, day_label: "Tag A" },
  ]);

  // Add exercise to existing plan
  const [showAddExercise, setShowAddExercise] = useState(false);
  const [newEx, setNewEx] = useState<ExerciseInput>({ name: "", muscle_group: "", sets: 3, reps: 10, day_label: "Tag A" });

  const fetchPlan = useCallback(async () => {
    const { data: plan } = await supabase
      .from("training_plans").select("*").eq("user_id", USER_ID).eq("is_active", true).single();
    if (plan) {
      setActivePlan(plan as TrainingPlan);
      const { data: exs } = await supabase
        .from("training_exercises").select("*").eq("plan_id", plan.id).order("order_index");
      if (exs) setExercises(exs as TrainingExercise[]);
    }
    setLoading(false);
  }, []);

  useEffect(() => { fetchPlan(); }, [fetchPlan]);

  const createPlan = async () => {
    if (!planName.trim()) return;
    const validExs = planExercises.filter((e) => e.name.trim());
    if (validExs.length === 0) return;

    await supabase.from("training_plans").update({ is_active: false }).eq("user_id", USER_ID);

    const { data: plan, error: planError } = await supabase
      .from("training_plans")
      .insert({ user_id: USER_ID, name: planName.trim(), is_active: true })
      .select().single();

    if (planError) {
      console.error("Plan creation failed:", planError);
      alert(`Fehler beim Erstellen: ${planError.message}`);
      return;
    }

    if (plan) {
      const { error: exError } = await supabase.from("training_exercises").insert(
        validExs.map((ex, idx) => ({
          plan_id: plan.id,
          name: ex.name.trim(),
          muscle_group: ex.muscle_group.trim(),
          sets: ex.sets,
          reps: ex.reps,
          day_label: ex.day_label.trim() || "Tag A",
          order_index: idx,
        }))
      );
      if (exError) {
        console.error("Exercise insert failed:", exError);
        alert(`Plan erstellt, aber Übungen fehlgeschlagen: ${exError.message}`);
      }
      setShowNewPlan(false);
      setPlanName("");
      setPlanExercises([{ name: "", muscle_group: "", sets: 3, reps: 10, day_label: "Tag A" }]);
      fetchPlan();
    }
  };

  const addExercise = async () => {
    if (!activePlan || !newEx.name.trim()) return;
    const { data } = await supabase
      .from("training_exercises")
      .insert({
        plan_id: activePlan.id,
        name: newEx.name.trim(),
        muscle_group: newEx.muscle_group.trim(),
        sets: newEx.sets,
        reps: newEx.reps,
        day_label: newEx.day_label.trim() || "Tag A",
        order_index: exercises.length,
      })
      .select().single();
    if (data) {
      setExercises((prev) => [...prev, data as TrainingExercise]);
      setNewEx({ name: "", muscle_group: "", sets: 3, reps: 10, day_label: "Tag A" });
      setShowAddExercise(false);
    }
  };

  const deleteExercise = async (id: string) => {
    setExercises((prev) => prev.filter((e) => e.id !== id));
    await supabase.from("training_exercises").delete().eq("id", id);
  };

  const deletePlan = async () => {
    if (!activePlan) return;
    await supabase.from("training_plans").delete().eq("id", activePlan.id);
    setActivePlan(null);
    setExercises([]);
  };

  // Available day labels from current exercises
  const dayLabels = [...new Set(exercises.map((e) => e.day_label))];
  const groupedByDay = exercises.reduce<Record<string, TrainingExercise[]>>((acc, ex) => {
    const day = ex.day_label || "Ohne Tag";
    if (!acc[day]) acc[day] = [];
    acc[day].push(ex);
    return acc;
  }, {});

  if (loading) return <div className="flex min-h-screen items-center justify-center text-neutral-500">Laden...</div>;

  return (
    <div className="space-y-4 p-4 pb-24">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Trainingsplan</h1>
        {!showNewPlan && (
          <button onClick={() => setShowNewPlan(true)}
            className="flex items-center gap-1 rounded-lg bg-neutral-800 px-3 py-2 text-xs font-medium active:scale-[0.97]">
            <Plus className="h-3 w-3" /> Neuer Plan
          </button>
        )}
      </div>

      {/* New Plan Form */}
      {showNewPlan && (
        <div className="rounded-xl bg-card p-4 space-y-4">
          <div className="flex items-center justify-between">
            <p className="font-semibold">Neuer Trainingsplan</p>
            <button onClick={() => setShowNewPlan(false)}><X className="h-4 w-4 text-neutral-500" /></button>
          </div>

          <Input value={planName} onChange={(e) => setPlanName(e.target.value)}
            placeholder="Plan-Name (z.B. Push/Pull/Legs)" className="bg-neutral-800 border-none" />

          <p className="text-xs text-neutral-500">Übungen:</p>
          {planExercises.map((ex, idx) => (
            <div key={idx} className="space-y-2 rounded-lg bg-neutral-800/50 p-3">
              <div className="flex gap-2">
                <Input value={ex.name} onChange={(e) => {
                  const u = [...planExercises]; u[idx] = { ...u[idx], name: e.target.value }; setPlanExercises(u);
                }} placeholder="Übung (z.B. Bankdrücken)" className="bg-neutral-800 border-none flex-1" />
                {planExercises.length > 1 && (
                  <button onClick={() => setPlanExercises(planExercises.filter((_, i) => i !== idx))}>
                    <X className="h-4 w-4 text-neutral-600" />
                  </button>
                )}
              </div>
              <div className="grid grid-cols-4 gap-2">
                <div className="space-y-1">
                  <label className="text-[10px] text-neutral-500">Muskel</label>
                  <Input value={ex.muscle_group} onChange={(e) => {
                    const u = [...planExercises]; u[idx] = { ...u[idx], muscle_group: e.target.value }; setPlanExercises(u);
                  }} placeholder="Brust" className="bg-neutral-800 border-none" />
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] text-neutral-500">Sätze</label>
                  <Input type="number" value={ex.sets} onChange={(e) => {
                    const u = [...planExercises]; u[idx] = { ...u[idx], sets: Number(e.target.value) }; setPlanExercises(u);
                  }} className="bg-neutral-800 border-none" />
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] text-neutral-500">Wdh.</label>
                  <Input type="number" value={ex.reps} onChange={(e) => {
                    const u = [...planExercises]; u[idx] = { ...u[idx], reps: Number(e.target.value) }; setPlanExercises(u);
                  }} className="bg-neutral-800 border-none" />
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] text-neutral-500">Tag</label>
                  <Input value={ex.day_label} onChange={(e) => {
                    const u = [...planExercises]; u[idx] = { ...u[idx], day_label: e.target.value }; setPlanExercises(u);
                  }} placeholder="Tag A" className="bg-neutral-800 border-none" />
                </div>
              </div>
            </div>
          ))}

          <button onClick={() => setPlanExercises([...planExercises, { name: "", muscle_group: "", sets: 3, reps: 10, day_label: planExercises[planExercises.length - 1]?.day_label || "Tag A" }])}
            className="flex items-center gap-1 text-xs text-neutral-400">
            <Plus className="h-3 w-3" /> Übung hinzufügen
          </button>

          <button onClick={createPlan} disabled={!planName.trim() || !planExercises.some((e) => e.name.trim())}
            className="w-full rounded-xl bg-white py-3 text-sm font-semibold text-black disabled:opacity-30 active:scale-[0.98]">
            Plan erstellen & aktivieren
          </button>
        </div>
      )}

      {/* Active Plan */}
      {activePlan && !showNewPlan && (
        <>
          <div className="rounded-xl bg-card p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="font-semibold">{activePlan.name}</p>
                <p className="text-xs text-neutral-500">{exercises.length} Übungen · {dayLabels.length} Tage</p>
              </div>
              <button onClick={deletePlan} className="text-xs text-neutral-600 hover:text-red-500">
                <Trash2 className="h-4 w-4" />
              </button>
            </div>
          </div>

          {/* Exercises grouped by day */}
          {Object.entries(groupedByDay).map(([day, exs]) => (
            <div key={day} className="space-y-2">
              <p className="text-xs font-semibold uppercase tracking-wider text-neutral-500">{day}</p>
              {exs.map((ex) => (
                <div key={ex.id} className="flex items-center gap-3 rounded-xl bg-card p-3">
                  <div className="flex-1">
                    <p className="text-sm font-medium">{ex.name}</p>
                    <p className="text-xs text-neutral-500">{ex.muscle_group} · {ex.sets}×{ex.reps}</p>
                  </div>
                  <button onClick={() => deleteExercise(ex.id)} className="text-neutral-600 hover:text-red-500">
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              ))}
            </div>
          ))}

          {/* Add exercise to existing plan */}
          {showAddExercise ? (
            <div className="rounded-xl bg-card p-4 space-y-3">
              <div className="flex items-center justify-between">
                <p className="text-sm font-medium">Übung hinzufügen</p>
                <button onClick={() => setShowAddExercise(false)}><X className="h-4 w-4 text-neutral-500" /></button>
              </div>
              <Input value={newEx.name} onChange={(e) => setNewEx({ ...newEx, name: e.target.value })}
                placeholder="Übungsname" className="bg-neutral-800 border-none" />
              <div className="grid grid-cols-4 gap-2">
                <div className="space-y-1">
                  <label className="text-[10px] text-neutral-500">Muskel</label>
                  <Input value={newEx.muscle_group} onChange={(e) => setNewEx({ ...newEx, muscle_group: e.target.value })}
                    placeholder="Brust" className="bg-neutral-800 border-none" />
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] text-neutral-500">Sätze</label>
                  <Input type="number" value={newEx.sets} onChange={(e) => setNewEx({ ...newEx, sets: Number(e.target.value) })}
                    className="bg-neutral-800 border-none" />
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] text-neutral-500">Wdh.</label>
                  <Input type="number" value={newEx.reps} onChange={(e) => setNewEx({ ...newEx, reps: Number(e.target.value) })}
                    className="bg-neutral-800 border-none" />
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] text-neutral-500">Tag</label>
                  <Input value={newEx.day_label} onChange={(e) => setNewEx({ ...newEx, day_label: e.target.value })}
                    placeholder="Tag A" className="bg-neutral-800 border-none" />
                </div>
              </div>
              <button onClick={addExercise} disabled={!newEx.name.trim()}
                className="w-full rounded-xl bg-white py-2.5 text-sm font-semibold text-black disabled:opacity-30 active:scale-[0.98]">
                Hinzufügen
              </button>
            </div>
          ) : (
            <button onClick={() => setShowAddExercise(true)}
              className="flex w-full items-center justify-center gap-2 rounded-xl bg-card p-3 text-sm text-neutral-400 active:scale-[0.98]">
              <Plus className="h-4 w-4" /> Übung hinzufügen
            </button>
          )}
        </>
      )}

      {/* No plan */}
      {!activePlan && !showNewPlan && (
        <div className="rounded-xl bg-card py-8 text-center text-neutral-500">
          Kein aktiver Trainingsplan. Erstelle einen neuen Plan.
        </div>
      )}
    </div>
  );
}
