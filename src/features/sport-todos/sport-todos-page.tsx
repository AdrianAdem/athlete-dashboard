import { useState, useEffect, useCallback, useRef } from "react";
import { Plus, Check, Trash2, ChevronDown, ChevronUp, X, Pencil } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { USER_ID } from "@/lib/constants";
import { todayString, isRoutineActiveToday } from "@/lib/utils";
import { useDayChange } from "@/lib/use-day-change";
import { Input } from "@/components/ui/input";
import { SwipeRow } from "@/components/ui/swipe-row";
import type {
  SportTodo,
  DailyTodo,
  Routine,
  RoutineItem,
  RoutineLog,
  TodoPriority,
  RoutineCategory,
} from "@/types/database";

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

type UnifiedTodo = (SportTodo | DailyTodo) & { source: "sport" | "daily" };

export function SportTodosPage() {
  const [todos, setTodos] = useState<UnifiedTodo[]>([]);
  const [routines, setRoutines] = useState<RoutineWithItems[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<"routinen" | "todos">("routinen");
  const [expandedRoutine, setExpandedRoutine] = useState<string | null>(null);

  // Add/edit routine state. editingRoutineId set => the form edits that routine.
  const [showAddRoutine, setShowAddRoutine] = useState(false);
  const [editingRoutineId, setEditingRoutineId] = useState<string | null>(null);
  const [newRoutineName, setNewRoutineName] = useState("");
  const [newRoutineCategory, setNewRoutineCategory] = useState<RoutineCategory>("mobility");
  const [newRoutineItems, setNewRoutineItems] = useState<
    { id?: string; name: string; sets?: number; reps?: number; duration_sec?: number }[]
  >([{ name: "" }]);
  const [newRoutineWeekdays, setNewRoutineWeekdays] = useState<number[]>([]);
  const [newRoutineStartDate, setNewRoutineStartDate] = useState("");
  const [newRoutineEndDate, setNewRoutineEndDate] = useState("");

  // Add todo state
  const [showAddTodo, setShowAddTodo] = useState(false);
  const [newTodoTitle, setNewTodoTitle] = useState("");
  const [newTodoPriority, setNewTodoPriority] = useState<TodoPriority>("mittel");

  const fetchData = useCallback(async () => {
    const today = todayString();
    const [sportTodoRes, dailyTodoRes, routineRes] = await Promise.all([
      supabase
        .from("sport_todos")
        .select("*")
        .eq("user_id", USER_ID)
        .eq("due_date", today)
        .order("created_at", { ascending: false }),
      supabase
        .from("daily_todos")
        .select("*")
        .eq("user_id", USER_ID)
        .eq("due_date", today)
        .order("created_at", { ascending: false }),
      supabase
        .from("routines")
        .select("*")
        .eq("user_id", USER_ID)
        .eq("is_active", true)
        .order("created_at"),
    ]);

    const merged: UnifiedTodo[] = [
      ...((sportTodoRes.data ?? []) as SportTodo[]).map((t) => ({
        ...t,
        source: "sport" as const,
      })),
      ...((dailyTodoRes.data ?? []) as DailyTodo[]).map((t) => ({
        ...t,
        source: "daily" as const,
      })),
    ];
    setTodos(merged);

    if (routineRes.data) {
      const jsDay = new Date().getDay();
      const weekday = jsDay === 0 ? 6 : jsDay - 1;
      const routinesData = (routineRes.data as Routine[]).filter(
        (r) =>
          (!r.weekdays || r.weekdays.length === 0 || r.weekdays.includes(weekday)) &&
          isRoutineActiveToday(r.start_date, r.end_date),
      );
      const routineIds = routinesData.map((r) => r.id);
      if (routineIds.length > 0) {
        const [itemsRes, logsRes] = await Promise.all([
          supabase
            .from("routine_items")
            .select("*")
            .in("routine_id", routineIds)
            .order("order_index"),
          supabase
            .from("routine_logs")
            .select("*")
            .in("routine_id", routineIds)
            .eq("user_id", USER_ID)
            .eq("date", today),
        ]);
        const itemsByRoutine = new Map<string, RoutineItem[]>();
        for (const item of (itemsRes.data ?? []) as RoutineItem[]) {
          const list = itemsByRoutine.get(item.routine_id) ?? [];
          list.push(item);
          itemsByRoutine.set(item.routine_id, list);
        }
        const logByRoutine = new Map<string, RoutineLog>();
        for (const log of (logsRes.data ?? []) as RoutineLog[]) {
          logByRoutine.set(log.routine_id, log);
        }
        const withItems: RoutineWithItems[] = routinesData.map((r) => ({
          ...r,
          items: itemsByRoutine.get(r.id) ?? [],
          log: logByRoutine.get(r.id) ?? null,
        }));
        setRoutines(withItems);
      } else {
        setRoutines([]);
      }
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);
  useDayChange(() => void fetchData());

  const [notice, setNotice] = useState<string | null>(null);
  const noticeTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  useEffect(() => () => clearTimeout(noticeTimer.current), []);
  const showNotice = (msg: string) => {
    setNotice(msg);
    clearTimeout(noticeTimer.current);
    noticeTimer.current = setTimeout(() => setNotice(null), 4000);
  };

  // Revert one routine to its pre-edit state; other routines keep whatever
  // concurrent edits happened meanwhile. A routine missing now (deleted
  // optimistically) is put back at its old position.
  const restoreRoutine = (before: typeof routines, id: string) => {
    setRoutines((prev) => {
      const old = before.find((r) => r.id === id);
      if (!old) return prev;
      if (prev.some((r) => r.id === id)) return prev.map((r) => (r.id === id ? old : r));
      const next = [...prev];
      next.splice(Math.min(before.indexOf(old), next.length), 0, old);
      return next;
    });
  };

  // ── Routine handlers ──

  const toggleRoutineItem = async (routine: RoutineWithItems, itemId: string) => {
    const today = todayString();
    // A log from another day (page left open overnight) must not carry its
    // ticks into today. Ids of since-deleted steps are dropped as well.
    const itemIds = new Set(routine.items.map((i) => i.id));
    const currentCompleted =
      routine.log && routine.log.date === today
        ? routine.log.completed_items.filter((id) => itemIds.has(id))
        : [];
    const newCompleted = currentCompleted.includes(itemId)
      ? currentCompleted.filter((id) => id !== itemId)
      : [...currentCompleted, itemId];
    const allDone =
      routine.items.length > 0 && routine.items.every((i) => newCompleted.includes(i.id));
    const before = routines;

    // Optimistic update
    setRoutines((prev) =>
      prev.map((r) =>
        r.id === routine.id
          ? {
              ...r,
              log: {
                ...(r.log ?? {
                  id: "",
                  routine_id: r.id,
                  user_id: USER_ID,
                  date: today,
                  created_at: "",
                }),
                date: today,
                completed_items: newCompleted,
                completed: allDone,
              },
            }
          : r,
      ),
    );

    const { error } = await supabase.from("routine_logs").upsert(
      {
        routine_id: routine.id,
        user_id: USER_ID,
        date: today,
        completed_items: newCompleted,
        completed: allDone,
      },
      { onConflict: "routine_id,user_id,date" },
    );
    if (error) {
      restoreRoutine(before, routine.id);
      showNotice("Haken konnte nicht gespeichert werden");
    }
  };

  const resetRoutineForm = () => {
    setNewRoutineName("");
    setNewRoutineCategory("mobility");
    setNewRoutineItems([{ name: "" }]);
    setNewRoutineWeekdays([]);
    setNewRoutineStartDate("");
    setNewRoutineEndDate("");
    setShowAddRoutine(false);
    setEditingRoutineId(null);
  };

  const startEditRoutine = (routine: RoutineWithItems) => {
    setEditingRoutineId(routine.id);
    setNewRoutineName(routine.name);
    setNewRoutineCategory(routine.category);
    setNewRoutineWeekdays(routine.weekdays ?? []);
    setNewRoutineStartDate(routine.start_date ?? "");
    setNewRoutineEndDate(routine.end_date ?? "");
    setNewRoutineItems(
      routine.items.length > 0
        ? routine.items.map((i) => ({
            id: i.id,
            name: i.name,
            sets: i.sets ?? undefined,
            reps: i.reps ?? undefined,
            duration_sec: i.duration_sec ?? undefined,
          }))
        : [{ name: "" }],
    );
    setShowAddRoutine(true);
  };

  const saveRoutine = async () => {
    if (!newRoutineName.trim()) return;
    const validItems = newRoutineItems.filter((i) => i.name.trim());
    if (validItems.length === 0) return;

    const routineFields = {
      name: newRoutineName.trim(),
      category: newRoutineCategory,
      weekdays: newRoutineWeekdays.length > 0 ? newRoutineWeekdays : null,
      start_date: newRoutineStartDate || null,
      end_date: newRoutineEndDate || null,
    };

    if (editingRoutineId) {
      const { error: updateError } = await supabase
        .from("routines")
        .update(routineFields)
        .eq("id", editingRoutineId);
      if (updateError) {
        showNotice("Routine konnte nicht gespeichert werden");
        return;
      }

      // Sync items: update kept, insert new, delete removed. Keeping ids stable
      // preserves today's completed_items references in routine_logs.
      const keptIds = validItems.filter((i) => i.id).map((i) => i.id as string);
      const existing = routines.find((r) => r.id === editingRoutineId)?.items ?? [];
      const removed = existing.filter((i) => !keptIds.includes(i.id)).map((i) => i.id);
      if (removed.length) await supabase.from("routine_items").delete().in("id", removed);

      const results = await Promise.all(
        validItems.map((item, idx) => {
          const row = {
            routine_id: editingRoutineId,
            name: item.name.trim(),
            sets: item.sets || null,
            reps: item.reps || null,
            duration_sec: item.duration_sec || null,
            order_index: idx,
          };
          return item.id
            ? supabase.from("routine_items").update(row).eq("id", item.id)
            : supabase.from("routine_items").insert(row);
        }),
      );
      if (results.some((r) => r.error)) showNotice("Nicht alle Schritte wurden gespeichert");
      resetRoutineForm();
      fetchData();
      return;
    }

    const { data: routine, error: createError } = await supabase
      .from("routines")
      .insert({ user_id: USER_ID, area: "sport", ...routineFields })
      .select()
      .single();

    if (createError || !routine) {
      showNotice("Routine konnte nicht erstellt werden");
      return;
    }
    {
      const { error: itemsError } = await supabase.from("routine_items").insert(
        validItems.map((item, idx) => ({
          routine_id: routine.id,
          name: item.name.trim(),
          sets: item.sets || null,
          reps: item.reps || null,
          duration_sec: item.duration_sec || null,
          order_index: idx,
        })),
      );
      if (itemsError) showNotice("Schritte konnten nicht gespeichert werden");
      resetRoutineForm();
      fetchData();
    }
  };

  const deleteRoutine = async (id: string) => {
    const before = routines;
    setRoutines((prev) => prev.filter((r) => r.id !== id));
    const { error } = await supabase.from("routines").update({ is_active: false }).eq("id", id);
    if (error) {
      restoreRoutine(before, id);
      showNotice("Löschen fehlgeschlagen");
    }
  };

  const deleteRoutineItem = async (routineId: string, itemId: string) => {
    const before = routines;
    setRoutines((prev) =>
      prev.map((r) =>
        r.id === routineId ? { ...r, items: r.items.filter((i) => i.id !== itemId) } : r,
      ),
    );
    const { error } = await supabase.from("routine_items").delete().eq("id", itemId);
    if (error) {
      restoreRoutine(before, routineId);
      showNotice("Löschen fehlgeschlagen");
    }
  };

  // ── Todo handlers ──

  const toggleTodo = async (todo: UnifiedTodo) => {
    const flip = (t: UnifiedTodo) => (t.id === todo.id ? { ...t, completed: !todo.completed } : t);
    setTodos((prev) => prev.map(flip));
    const table = todo.source === "sport" ? "sport_todos" : "daily_todos";
    const { error } = await supabase
      .from(table)
      .update({ completed: !todo.completed })
      .eq("id", todo.id);
    if (error) {
      setTodos((prev) =>
        prev.map((t) => (t.id === todo.id ? { ...t, completed: todo.completed } : t)),
      );
      showNotice("Änderung nicht gespeichert");
    }
  };

  const addTodo = async () => {
    if (!newTodoTitle.trim()) return;
    const { data, error } = await supabase
      .from("sport_todos")
      .insert({
        user_id: USER_ID,
        title: newTodoTitle.trim(),
        due_date: todayString(),
        priority: newTodoPriority,
        category: "sonstiges",
        completed: false,
      })
      .select()
      .single();
    if (error || !data) {
      showNotice("Todo konnte nicht gespeichert werden");
      return;
    }
    {
      setTodos((prev) => [{ ...(data as SportTodo), source: "sport" as const }, ...prev]);
      setNewTodoTitle("");
      setShowAddTodo(false);
    }
  };

  const deleteTodo = async (todo: UnifiedTodo) => {
    setTodos((prev) => prev.filter((t) => t.id !== todo.id));
    const table = todo.source === "sport" ? "sport_todos" : "daily_todos";
    const { error } = await supabase.from(table).delete().eq("id", todo.id);
    if (error) {
      setTodos((prev) => [todo, ...prev]);
      showNotice("Löschen fehlgeschlagen");
    }
  };

  // Progress from today's log, counted only over steps that still exist, so
  // deleting a ticked step can no longer make an unfinished routine "done".
  const doneItemIds = (routine: RoutineWithItems) => {
    if (!routine.log || routine.log.date !== todayString()) return [];
    const ids = new Set(routine.log.completed_items);
    return routine.items.filter((i) => ids.has(i.id)).map((i) => i.id);
  };
  const isRoutineDone = (routine: RoutineWithItems) =>
    routine.items.length > 0 && doneItemIds(routine).length === routine.items.length;

  // ── Stats ──
  const routinesDone = routines.filter(isRoutineDone).length;
  const todosDone = todos.filter((t) => t.completed).length;
  const totalTasks = routines.length + todos.length;
  const totalDone = routinesDone + todosDone;
  const progress = totalTasks > 0 ? (totalDone / totalTasks) * 100 : 0;

  if (loading)
    return (
      <div className="flex min-h-screen items-center justify-center text-neutral-500">Laden...</div>
    );

  return (
    <div className="space-y-4 p-4 pb-24">
      {notice && (
        <p
          role="status"
          className="fixed inset-x-4 top-[calc(env(safe-area-inset-top,0px)+12px)] z-50 rounded-xl bg-neutral-800 px-4 py-3 text-center text-sm text-white shadow-lg"
        >
          {notice}
        </p>
      )}
      <h1 className="text-2xl font-bold">Aufgaben</h1>

      {/* Progress */}
      <div className="rounded-xl bg-card p-4">
        <div className="flex justify-between text-sm text-neutral-500 mb-2">
          <span>
            {totalDone} / {totalTasks} erledigt
          </span>
          <span>{Math.round(progress)}%</span>
        </div>
        <div className="h-2 rounded-full bg-neutral-800 overflow-hidden">
          <div
            className="h-full rounded-full bg-white transition-all duration-300"
            style={{ width: `${progress}%` }}
          />
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 rounded-xl bg-card p-1">
        <button
          onClick={() => setActiveTab("routinen")}
          className={`flex-1 rounded-lg py-2 text-sm font-medium transition-all ${activeTab === "routinen" ? "bg-white text-black" : "text-neutral-500"}`}
        >
          Routinen ({routines.length})
        </button>
        <button
          onClick={() => setActiveTab("todos")}
          className={`flex-1 rounded-lg py-2 text-sm font-medium transition-all ${activeTab === "todos" ? "bg-white text-black" : "text-neutral-500"}`}
        >
          Todos ({todos.length})
        </button>
      </div>

      {activeTab === "routinen" ? (
        <div className="space-y-3">
          {/* Routine list */}
          {routines.map((routine) => {
            const completed = doneItemIds(routine);
            const itemsDone = completed.length;
            const isExpanded = expandedRoutine === routine.id;
            const allDone = isRoutineDone(routine);

            return (
              <SwipeRow
                key={routine.id}
                onDelete={() => deleteRoutine(routine.id)}
                className={`transition-opacity ${allDone ? "opacity-60" : ""}`}
              >
                {/* Routine header */}
                <button
                  onClick={() => setExpandedRoutine(isExpanded ? null : routine.id)}
                  className="flex w-full items-center gap-3 p-4"
                >
                  <div className={`h-3 w-3 rounded-full ${categoryColors[routine.category]}`} />
                  <div className="flex-1 text-left">
                    <p className="text-sm font-semibold">{routine.name}</p>
                    <p className="text-xs text-neutral-500">
                      {itemsDone}/{routine.items.length} Schritte ·{" "}
                      {categoryLabels[routine.category]}
                    </p>
                  </div>
                  {/* Mini progress */}
                  <div className="flex items-center gap-2">
                    {allDone && <Check className="h-4 w-4 text-green-500" />}
                    {isExpanded ? (
                      <ChevronUp className="h-4 w-4 text-neutral-500" />
                    ) : (
                      <ChevronDown className="h-4 w-4 text-neutral-500" />
                    )}
                  </div>
                </button>

                {/* Progress bar */}
                <div className="mx-4 mb-2 h-1 rounded-full bg-neutral-800 overflow-hidden">
                  <div
                    className="h-full rounded-full bg-green-500 transition-all duration-300"
                    style={{
                      width: `${routine.items.length > 0 ? (itemsDone / routine.items.length) * 100 : 0}%`,
                    }}
                  />
                </div>

                {/* Expanded items */}
                {isExpanded && (
                  <div className="border-t border-neutral-800 px-4 pb-4 pt-3 space-y-2">
                    {routine.items.map((item) => {
                      const isDone = completed.includes(item.id);
                      return (
                        <SwipeRow
                          key={item.id}
                          rounded="rounded-lg"
                          onDelete={() => deleteRoutineItem(routine.id, item.id)}
                        >
                          <div className="flex items-center gap-3 py-1">
                            <button
                              onClick={() => toggleRoutineItem(routine, item.id)}
                              className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-md border-2 transition-all ${
                                isDone ? "border-green-500 bg-green-500" : "border-neutral-600"
                              }`}
                            >
                              {isDone && <Check className="h-3.5 w-3.5 text-black" />}
                            </button>
                            <div className="flex-1">
                              <p
                                className={`text-sm ${isDone ? "line-through text-neutral-600" : ""}`}
                              >
                                {item.name}
                              </p>
                              {(item.sets || item.reps || item.duration_sec) && (
                                <p className="text-xs text-neutral-600">
                                  {item.sets && item.reps ? `${item.sets}×${item.reps}` : ""}
                                  {item.duration_sec ? `${item.duration_sec}s` : ""}
                                  {item.notes ? ` · ${item.notes}` : ""}
                                </p>
                              )}
                            </div>
                          </div>
                        </SwipeRow>
                      );
                    })}
                    <p className="pt-1 text-center text-[10px] text-neutral-600">
                      Nach links wischen zum Löschen
                    </p>
                    <button
                      onClick={() => startEditRoutine(routine)}
                      className="flex w-full items-center justify-center gap-1.5 rounded-lg bg-neutral-800 py-2 text-xs font-medium text-neutral-300 active:scale-[0.98]"
                    >
                      <Pencil className="h-3.5 w-3.5" /> Routine bearbeiten
                    </button>
                  </div>
                )}
              </SwipeRow>
            );
          })}

          {/* Add routine */}
          {showAddRoutine ? (
            <div className="rounded-xl bg-card p-4 space-y-3">
              <div className="flex items-center justify-between">
                <p className="text-sm font-medium">
                  {editingRoutineId ? "Routine bearbeiten" : "Neue Routine"}
                </p>
                <button onClick={resetRoutineForm}>
                  <X className="h-4 w-4 text-neutral-500" />
                </button>
              </div>
              <Input
                value={newRoutineName}
                onChange={(e) => setNewRoutineName(e.target.value)}
                placeholder="Name (z.B. Scapula Routine)"
                className="bg-neutral-800 border-none"
              />
              <div className="flex flex-wrap gap-1">
                {(
                  [
                    "kraft",
                    "cardio",
                    "mobility",
                    "gesundheit",
                    "morgenroutine",
                    "abendroutine",
                    "sonstiges",
                  ] as RoutineCategory[]
                ).map((cat) => (
                  <button
                    key={cat}
                    onClick={() => setNewRoutineCategory(cat)}
                    className={`rounded-lg px-3 py-1.5 text-xs font-medium transition-all ${
                      newRoutineCategory === cat
                        ? "bg-white text-black"
                        : "bg-neutral-800 text-neutral-400"
                    }`}
                  >
                    {categoryLabels[cat]}
                  </button>
                ))}
              </div>
              <div>
                <p className="text-xs text-neutral-500 mb-1">Wochentage (leer = täglich):</p>
                <div className="flex gap-1">
                  {["Mo", "Di", "Mi", "Do", "Fr", "Sa", "So"].map((d, i) => (
                    <button
                      key={i}
                      onClick={() =>
                        setNewRoutineWeekdays((prev) =>
                          prev.includes(i) ? prev.filter((x) => x !== i) : [...prev, i].sort(),
                        )
                      }
                      className={`flex-1 rounded-lg py-1.5 text-xs font-medium transition-all ${
                        newRoutineWeekdays.includes(i)
                          ? "bg-white text-black"
                          : "bg-neutral-800 text-neutral-500"
                      }`}
                    >
                      {d}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <p className="text-xs text-neutral-500 mb-1">Zeitraum (leer = unbegrenzt):</p>
                <div className="grid grid-cols-2 gap-2">
                  <Input
                    type="text"
                    value={newRoutineStartDate}
                    onChange={(e) => setNewRoutineStartDate(e.target.value)}
                    placeholder="Von (JJJJ-MM-TT)"
                    className="bg-neutral-800 border-none text-xs"
                    onFocus={(e) => {
                      e.target.type = "date";
                    }}
                    onBlur={(e) => {
                      if (!e.target.value) e.target.type = "text";
                    }}
                  />
                  <Input
                    type="text"
                    value={newRoutineEndDate}
                    onChange={(e) => setNewRoutineEndDate(e.target.value)}
                    placeholder="Bis (JJJJ-MM-TT)"
                    className="bg-neutral-800 border-none text-xs"
                    onFocus={(e) => {
                      e.target.type = "date";
                    }}
                    onBlur={(e) => {
                      if (!e.target.value) e.target.type = "text";
                    }}
                  />
                </div>
              </div>
              <p className="text-xs text-neutral-500">Schritte:</p>
              {newRoutineItems.map((item, idx) => (
                <div key={idx} className="flex items-center gap-2">
                  <Input
                    value={item.name}
                    onChange={(e) => {
                      const updated = [...newRoutineItems];
                      updated[idx] = { ...updated[idx], name: e.target.value };
                      setNewRoutineItems(updated);
                    }}
                    placeholder={`Schritt ${idx + 1}`}
                    className="bg-neutral-800 border-none flex-1"
                  />
                  {["kraft", "cardio", "mobility"].includes(newRoutineCategory) && (
                    <>
                      <Input
                        type="number"
                        placeholder="Sets"
                        className="w-16 bg-neutral-800 border-none"
                        value={item.sets ?? ""}
                        onChange={(e) => {
                          const updated = [...newRoutineItems];
                          updated[idx] = {
                            ...updated[idx],
                            sets: Number(e.target.value) || undefined,
                          };
                          setNewRoutineItems(updated);
                        }}
                      />
                      <Input
                        type="number"
                        placeholder="Reps"
                        className="w-16 bg-neutral-800 border-none"
                        value={item.reps ?? ""}
                        onChange={(e) => {
                          const updated = [...newRoutineItems];
                          updated[idx] = {
                            ...updated[idx],
                            reps: Number(e.target.value) || undefined,
                          };
                          setNewRoutineItems(updated);
                        }}
                      />
                    </>
                  )}
                  {newRoutineItems.length > 1 && (
                    <button
                      onClick={() =>
                        setNewRoutineItems(newRoutineItems.filter((_, i) => i !== idx))
                      }
                    >
                      <X className="h-4 w-4 text-neutral-600" />
                    </button>
                  )}
                </div>
              ))}
              <button
                onClick={() => setNewRoutineItems([...newRoutineItems, { name: "" }])}
                className="flex items-center gap-1 text-xs text-neutral-400"
              >
                <Plus className="h-3 w-3" /> Schritt hinzufügen
              </button>
              <button
                onClick={saveRoutine}
                disabled={!newRoutineName.trim()}
                className="w-full rounded-xl bg-white py-2.5 text-sm font-semibold text-black disabled:opacity-30 active:scale-[0.98]"
              >
                {editingRoutineId ? "Speichern" : "Routine erstellen"}
              </button>
            </div>
          ) : (
            <button
              onClick={() => {
                setEditingRoutineId(null);
                setShowAddRoutine(true);
              }}
              className="flex w-full items-center justify-center gap-2 rounded-xl bg-card p-3 text-sm text-neutral-400 active:scale-[0.98]"
            >
              <Plus className="h-4 w-4" /> Routine hinzufügen
            </button>
          )}
        </div>
      ) : (
        <div className="space-y-3">
          {/* Todo list */}
          {todos.map((todo) => (
            <div
              key={todo.id}
              className={`flex items-center gap-3 rounded-xl bg-card p-4 transition-opacity ${todo.completed ? "opacity-60" : ""}`}
            >
              <button
                onClick={() => toggleTodo(todo)}
                className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-md border-2 transition-all ${
                  todo.completed ? "border-white bg-white" : "border-neutral-600"
                }`}
              >
                {todo.completed && <Check className="h-3.5 w-3.5 text-black" />}
              </button>
              <div className="flex-1">
                <p
                  className={`text-sm font-medium ${todo.completed ? "line-through text-neutral-600" : ""}`}
                >
                  {todo.title}
                </p>
                {todo.description && <p className="text-xs text-neutral-600">{todo.description}</p>}
              </div>
              <button
                onClick={() => deleteTodo(todo)}
                className="text-neutral-600 hover:text-red-500"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </div>
          ))}

          {/* Add todo */}
          {showAddTodo ? (
            <div className="rounded-xl bg-card p-4 space-y-3">
              <Input
                value={newTodoTitle}
                onChange={(e) => setNewTodoTitle(e.target.value)}
                placeholder="Todo Titel"
                className="bg-neutral-800 border-none"
                onKeyDown={(e) => e.key === "Enter" && addTodo()}
              />
              <div className="flex gap-1">
                {(["hoch", "mittel", "niedrig"] as TodoPriority[]).map((p) => (
                  <button
                    key={p}
                    onClick={() => setNewTodoPriority(p)}
                    className={`rounded-lg px-3 py-1.5 text-xs font-medium ${
                      newTodoPriority === p
                        ? "bg-white text-black"
                        : "bg-neutral-800 text-neutral-400"
                    }`}
                  >
                    {p.charAt(0).toUpperCase() + p.slice(1)}
                  </button>
                ))}
              </div>
              <div className="flex gap-2">
                <button
                  onClick={addTodo}
                  disabled={!newTodoTitle.trim()}
                  className="flex-1 rounded-xl bg-white py-2 text-sm font-semibold text-black disabled:opacity-30"
                >
                  Erstellen
                </button>
                <button
                  onClick={() => setShowAddTodo(false)}
                  className="rounded-xl bg-neutral-800 px-4 py-2 text-sm text-neutral-400"
                >
                  Abbrechen
                </button>
              </div>
            </div>
          ) : (
            <button
              onClick={() => setShowAddTodo(true)}
              className="flex w-full items-center justify-center gap-2 rounded-xl bg-card p-3 text-sm text-neutral-400 active:scale-[0.98]"
            >
              <Plus className="h-4 w-4" /> Todo hinzufügen
            </button>
          )}
        </div>
      )}
    </div>
  );
}
