import { useState, useEffect, useCallback } from "react";
import { Plus, Check, Trash2, ChevronDown, ChevronUp, X } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { USER_ID } from "@/lib/constants";
import { todayString, isRoutineActiveToday } from "@/lib/utils";
import { Input } from "@/components/ui/input";
import type { DailyTodo, Routine, RoutineItem, RoutineLog, TodoPriority, RoutineCategory } from "@/types/database";

const categoryColors: Record<RoutineCategory, string> = {
  kraft: "bg-green-500",
  cardio: "bg-orange-500",
  mobility: "bg-blue-500",
  sonstiges: "bg-neutral-500",
  gesundheit: "bg-emerald-500",
  morgenroutine: "bg-yellow-500",
  abendroutine: "bg-purple-500",
};

const categoryLabels: Record<RoutineCategory, string> = {
  kraft: "Kraft",
  cardio: "Cardio",
  mobility: "Mobility",
  sonstiges: "Sonstiges",
  gesundheit: "Gesundheit",
  morgenroutine: "Morgen",
  abendroutine: "Abend",
};

interface RoutineWithItems extends Routine {
  items: RoutineItem[];
  log: RoutineLog | null;
}

export function DailyTodosPage() {
  const [todos, setTodos] = useState<DailyTodo[]>([]);
  const [routines, setRoutines] = useState<RoutineWithItems[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<"routinen" | "todos">("routinen");
  const [expandedRoutine, setExpandedRoutine] = useState<string | null>(null);

  // Add routine state
  const [showAddRoutine, setShowAddRoutine] = useState(false);
  const [newRoutineName, setNewRoutineName] = useState("");
  const [newRoutineCategory, setNewRoutineCategory] = useState<RoutineCategory>("morgenroutine");
  const [newRoutineItems, setNewRoutineItems] = useState<{ name: string; notes?: string }[]>([{ name: "" }]);
  const [newRoutineWeekdays, setNewRoutineWeekdays] = useState<number[]>([]);
  const [newRoutineStartDate, setNewRoutineStartDate] = useState("");
  const [newRoutineEndDate, setNewRoutineEndDate] = useState("");

  // Add todo state
  const [showAddTodo, setShowAddTodo] = useState(false);
  const [newTodoTitle, setNewTodoTitle] = useState("");
  const [newTodoPriority, setNewTodoPriority] = useState<TodoPriority>("mittel");

  const fetchData = useCallback(async () => {
    const today = todayString();
    const [todoRes, routineRes] = await Promise.all([
      supabase.from("daily_todos").select("*").eq("user_id", USER_ID).eq("due_date", today).order("created_at", { ascending: false }),
      supabase.from("routines").select("*").eq("user_id", USER_ID).eq("is_active", true).eq("area", "alltag").order("created_at"),
    ]);

    if (todoRes.data) setTodos(todoRes.data as DailyTodo[]);

    if (routineRes.data) {
      const jsDay = new Date().getDay();
      const weekday = jsDay === 0 ? 6 : jsDay - 1; // Convert to Mo=0 .. So=6
      const routinesData = (routineRes.data as Routine[]).filter(
        (r) => (!r.weekdays || r.weekdays.length === 0 || r.weekdays.includes(weekday))
          && isRoutineActiveToday(r.start_date, r.end_date)
      );
      const withItems: RoutineWithItems[] = await Promise.all(
        routinesData.map(async (r) => {
          const [itemsRes, logRes] = await Promise.all([
            supabase.from("routine_items").select("*").eq("routine_id", r.id).order("order_index"),
            supabase.from("routine_logs").select("*").eq("routine_id", r.id).eq("user_id", USER_ID).eq("date", today).single(),
          ]);
          return {
            ...r,
            items: (itemsRes.data ?? []) as RoutineItem[],
            log: logRes.data as RoutineLog | null,
          };
        })
      );
      setRoutines(withItems);
    }
    setLoading(false);
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  // ── Routine handlers ──

  const toggleRoutineItem = async (routine: RoutineWithItems, itemId: string) => {
    const today = todayString();
    const currentCompleted = routine.log?.completed_items ?? [];
    const newCompleted = currentCompleted.includes(itemId)
      ? currentCompleted.filter((id) => id !== itemId)
      : [...currentCompleted, itemId];
    const allDone = newCompleted.length === routine.items.length;

    setRoutines((prev) =>
      prev.map((r) =>
        r.id === routine.id
          ? { ...r, log: { ...(r.log ?? { id: "", routine_id: r.id, user_id: USER_ID, date: today, created_at: "" }), completed_items: newCompleted, completed: allDone } }
          : r
      )
    );

    await supabase.from("routine_logs").upsert({
      routine_id: routine.id,
      user_id: USER_ID,
      date: today,
      completed_items: newCompleted,
      completed: allDone,
    }, { onConflict: "routine_id,user_id,date" });
  };

  const createRoutine = async () => {
    if (!newRoutineName.trim()) return;
    const validItems = newRoutineItems.filter((i) => i.name.trim());
    if (validItems.length === 0) return;

    const { data: routine } = await supabase
      .from("routines")
      .insert({
        user_id: USER_ID, name: newRoutineName.trim(), category: newRoutineCategory, area: "alltag",
        weekdays: newRoutineWeekdays.length > 0 ? newRoutineWeekdays : null,
        start_date: newRoutineStartDate || null,
        end_date: newRoutineEndDate || null,
      })
      .select().single();

    if (routine) {
      await supabase.from("routine_items").insert(
        validItems.map((item, idx) => ({
          routine_id: routine.id,
          name: item.name.trim(),
          notes: item.notes || null,
          order_index: idx,
        }))
      );
      setNewRoutineName("");
      setNewRoutineCategory("morgenroutine");
      setNewRoutineItems([{ name: "" }]);
      setNewRoutineWeekdays([]);
      setNewRoutineStartDate("");
      setNewRoutineEndDate("");
      setShowAddRoutine(false);
      fetchData();
    }
  };

  const deleteRoutine = async (id: string) => {
    setRoutines((prev) => prev.filter((r) => r.id !== id));
    await supabase.from("routines").update({ is_active: false }).eq("id", id);
  };

  // ── Todo handlers ──

  const toggleTodo = async (todo: DailyTodo) => {
    setTodos((prev) => prev.map((t) => t.id === todo.id ? { ...t, completed: !t.completed } : t));
    await supabase.from("daily_todos").update({ completed: !todo.completed }).eq("id", todo.id);
  };

  const addTodo = async () => {
    if (!newTodoTitle.trim()) return;
    const { data } = await supabase
      .from("daily_todos")
      .insert({ user_id: USER_ID, title: newTodoTitle.trim(), due_date: todayString(), priority: newTodoPriority, completed: false })
      .select().single();
    if (data) {
      setTodos((prev) => [data as DailyTodo, ...prev]);
      setNewTodoTitle("");
      setShowAddTodo(false);
    }
  };

  const deleteTodo = async (id: string) => {
    setTodos((prev) => prev.filter((t) => t.id !== id));
    await supabase.from("daily_todos").delete().eq("id", id);
  };

  // ── Stats ──
  const routinesDone = routines.filter((r) => r.log?.completed).length;
  const todosDone = todos.filter((t) => t.completed).length;
  const totalTasks = routines.length + todos.length;
  const totalDone = routinesDone + todosDone;
  const progress = totalTasks > 0 ? (totalDone / totalTasks) * 100 : 0;

  if (loading) return <div className="flex min-h-screen items-center justify-center text-neutral-500">Laden...</div>;

  return (
    <div className="space-y-4 p-4 pb-24">
      <h1 className="text-2xl font-bold">Tages-Aufgaben</h1>

      {/* Progress */}
      <div className="rounded-xl bg-card p-4">
        <div className="flex justify-between text-sm text-neutral-500 mb-2">
          <span>{totalDone} / {totalTasks} erledigt</span>
          <span>{Math.round(progress)}%</span>
        </div>
        <div className="h-2 rounded-full bg-neutral-800 overflow-hidden">
          <div className="h-full rounded-full bg-white transition-all duration-300" style={{ width: `${progress}%` }} />
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 rounded-xl bg-card p-1">
        <button onClick={() => setActiveTab("routinen")}
          className={`flex-1 rounded-lg py-2 text-sm font-medium transition-all ${activeTab === "routinen" ? "bg-white text-black" : "text-neutral-500"}`}>
          Routinen ({routines.length})
        </button>
        <button onClick={() => setActiveTab("todos")}
          className={`flex-1 rounded-lg py-2 text-sm font-medium transition-all ${activeTab === "todos" ? "bg-white text-black" : "text-neutral-500"}`}>
          Todos ({todos.length})
        </button>
      </div>

      {activeTab === "routinen" ? (
        <div className="space-y-3">
          {routines.map((routine) => {
            const completed = routine.log?.completed_items ?? [];
            const itemsDone = completed.length;
            const isExpanded = expandedRoutine === routine.id;
            const allDone = routine.log?.completed ?? false;

            return (
              <div key={routine.id} className={`rounded-xl bg-card overflow-hidden transition-opacity ${allDone ? "opacity-60" : ""}`}>
                <button onClick={() => setExpandedRoutine(isExpanded ? null : routine.id)}
                  className="flex w-full items-center gap-3 p-4">
                  <div className={`h-3 w-3 rounded-full ${categoryColors[routine.category]}`} />
                  <div className="flex-1 text-left">
                    <p className="text-sm font-semibold">{routine.name}</p>
                    <p className="text-xs text-neutral-500">
                      {itemsDone}/{routine.items.length} erledigt · {categoryLabels[routine.category]}
                    </p>
                  </div>
                  {allDone && <Check className="h-4 w-4 text-green-500" />}
                  {isExpanded ? <ChevronUp className="h-4 w-4 text-neutral-500" /> : <ChevronDown className="h-4 w-4 text-neutral-500" />}
                </button>

                <div className="mx-4 mb-2 h-1 rounded-full bg-neutral-800 overflow-hidden">
                  <div className="h-full rounded-full bg-green-500 transition-all duration-300"
                    style={{ width: `${routine.items.length > 0 ? (itemsDone / routine.items.length) * 100 : 0}%` }} />
                </div>

                {isExpanded && (
                  <div className="border-t border-neutral-800 px-4 pb-4 pt-3 space-y-2">
                    {routine.items.map((item) => {
                      const isDone = completed.includes(item.id);
                      return (
                        <div key={item.id} className="flex items-center gap-3">
                          <button onClick={() => toggleRoutineItem(routine, item.id)}
                            className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-md border-2 transition-all ${
                              isDone ? "border-green-500 bg-green-500" : "border-neutral-600"
                            }`}>
                            {isDone && <Check className="h-3.5 w-3.5 text-black" />}
                          </button>
                          <div className="flex-1">
                            <p className={`text-sm ${isDone ? "line-through text-neutral-600" : ""}`}>{item.name}</p>
                            {item.notes && <p className="text-xs text-neutral-600">{item.notes}</p>}
                          </div>
                        </div>
                      );
                    })}
                    <button onClick={() => deleteRoutine(routine.id)}
                      className="mt-2 flex items-center gap-1 text-xs text-neutral-600 hover:text-red-500">
                      <Trash2 className="h-3 w-3" /> Routine entfernen
                    </button>
                  </div>
                )}
              </div>
            );
          })}

          {showAddRoutine ? (
            <div className="rounded-xl bg-card p-4 space-y-3">
              <div className="flex items-center justify-between">
                <p className="text-sm font-medium">Neue Routine</p>
                <button onClick={() => setShowAddRoutine(false)}><X className="h-4 w-4 text-neutral-500" /></button>
              </div>
              <Input value={newRoutineName} onChange={(e) => setNewRoutineName(e.target.value)}
                placeholder="Name (z.B. Morgenroutine)" className="bg-neutral-800 border-none" />
              <div className="flex flex-wrap gap-1">
                {(["morgenroutine", "abendroutine", "gesundheit", "sonstiges"] as RoutineCategory[]).map((cat) => (
                  <button key={cat} onClick={() => setNewRoutineCategory(cat)}
                    className={`rounded-lg px-3 py-1.5 text-xs font-medium transition-all ${
                      newRoutineCategory === cat ? "bg-white text-black" : "bg-neutral-800 text-neutral-400"
                    }`}>
                    {categoryLabels[cat]}
                  </button>
                ))}
              </div>
              <div>
                <p className="text-xs text-neutral-500 mb-1">Wochentage (leer = täglich):</p>
                <div className="flex gap-1">
                  {["Mo", "Di", "Mi", "Do", "Fr", "Sa", "So"].map((d, i) => (
                    <button key={i} onClick={() => setNewRoutineWeekdays((prev) =>
                      prev.includes(i) ? prev.filter((x) => x !== i) : [...prev, i].sort()
                    )}
                      className={`flex-1 rounded-lg py-1.5 text-xs font-medium transition-all ${
                        newRoutineWeekdays.includes(i) ? "bg-white text-black" : "bg-neutral-800 text-neutral-500"
                      }`}>
                      {d}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <p className="text-xs text-neutral-500 mb-1">Zeitraum (leer = unbegrenzt):</p>
                <div className="grid grid-cols-2 gap-2">
                  <Input type="date" value={newRoutineStartDate} onChange={(e) => setNewRoutineStartDate(e.target.value)}
                    placeholder="Von" className="bg-neutral-800 border-none text-xs" />
                  <Input type="date" value={newRoutineEndDate} onChange={(e) => setNewRoutineEndDate(e.target.value)}
                    placeholder="Bis" className="bg-neutral-800 border-none text-xs" />
                </div>
              </div>
              <p className="text-xs text-neutral-500">Aufgaben:</p>
              {newRoutineItems.map((item, idx) => (
                <div key={idx} className="flex items-center gap-2">
                  <Input value={item.name} onChange={(e) => {
                    const updated = [...newRoutineItems];
                    updated[idx] = { ...updated[idx], name: e.target.value };
                    setNewRoutineItems(updated);
                  }} placeholder={`Aufgabe ${idx + 1}`} className="bg-neutral-800 border-none flex-1" />
                  {newRoutineItems.length > 1 && (
                    <button onClick={() => setNewRoutineItems(newRoutineItems.filter((_, i) => i !== idx))}>
                      <X className="h-4 w-4 text-neutral-600" />
                    </button>
                  )}
                </div>
              ))}
              <button onClick={() => setNewRoutineItems([...newRoutineItems, { name: "" }])}
                className="flex items-center gap-1 text-xs text-neutral-400">
                <Plus className="h-3 w-3" /> Aufgabe hinzufügen
              </button>
              <button onClick={createRoutine} disabled={!newRoutineName.trim()}
                className="w-full rounded-xl bg-white py-2.5 text-sm font-semibold text-black disabled:opacity-30 active:scale-[0.98]">
                Routine erstellen
              </button>
            </div>
          ) : (
            <button onClick={() => setShowAddRoutine(true)}
              className="flex w-full items-center justify-center gap-2 rounded-xl bg-card p-3 text-sm text-neutral-400 active:scale-[0.98]">
              <Plus className="h-4 w-4" /> Routine hinzufügen
            </button>
          )}
        </div>
      ) : (
        <div className="space-y-3">
          {todos.map((todo) => (
            <div key={todo.id} className={`flex items-center gap-3 rounded-xl bg-card p-4 transition-opacity ${todo.completed ? "opacity-60" : ""}`}>
              <button onClick={() => toggleTodo(todo)}
                className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-md border-2 transition-all ${
                  todo.completed ? "border-white bg-white" : "border-neutral-600"
                }`}>
                {todo.completed && <Check className="h-3.5 w-3.5 text-black" />}
              </button>
              <div className="flex-1">
                <p className={`text-sm font-medium ${todo.completed ? "line-through text-neutral-600" : ""}`}>{todo.title}</p>
                {todo.description && <p className="text-xs text-neutral-600">{todo.description}</p>}
              </div>
              <button onClick={() => deleteTodo(todo.id)} className="text-neutral-600 hover:text-red-500">
                <Trash2 className="h-4 w-4" />
              </button>
            </div>
          ))}

          {showAddTodo ? (
            <div className="rounded-xl bg-card p-4 space-y-3">
              <Input value={newTodoTitle} onChange={(e) => setNewTodoTitle(e.target.value)}
                placeholder="Todo Titel" className="bg-neutral-800 border-none"
                onKeyDown={(e) => e.key === "Enter" && addTodo()} />
              <div className="flex gap-1">
                {(["hoch", "mittel", "niedrig"] as TodoPriority[]).map((p) => (
                  <button key={p} onClick={() => setNewTodoPriority(p)}
                    className={`rounded-lg px-3 py-1.5 text-xs font-medium ${
                      newTodoPriority === p ? "bg-white text-black" : "bg-neutral-800 text-neutral-400"
                    }`}>
                    {p.charAt(0).toUpperCase() + p.slice(1)}
                  </button>
                ))}
              </div>
              <div className="flex gap-2">
                <button onClick={addTodo} disabled={!newTodoTitle.trim()}
                  className="flex-1 rounded-xl bg-white py-2 text-sm font-semibold text-black disabled:opacity-30">Erstellen</button>
                <button onClick={() => setShowAddTodo(false)}
                  className="rounded-xl bg-neutral-800 px-4 py-2 text-sm text-neutral-400">Abbrechen</button>
              </div>
            </div>
          ) : (
            <button onClick={() => setShowAddTodo(true)}
              className="flex w-full items-center justify-center gap-2 rounded-xl bg-card p-3 text-sm text-neutral-400 active:scale-[0.98]">
              <Plus className="h-4 w-4" /> Todo hinzufügen
            </button>
          )}
        </div>
      )}
    </div>
  );
}
