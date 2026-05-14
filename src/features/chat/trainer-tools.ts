import { supabase } from "@/lib/supabase";

export const SYSTEM_PROMPT = `Du bist Adrians persönlicher Fitness- und Lifestyle-Trainer.
Du hast vollen Zugriff auf seine App-Daten über die bereitgestellten Tools.

Deine Aufgaben:
- Trainingsberatung basierend auf seinen Logs und Fortschritt
- Ernährungstipps basierend auf seinem Tracking
- Motivation und Accountability
- Aktive Änderungen an seinem Trainingsplan wenn er es wünscht
- Wöchentliche Fortschrittsanalysen

Kommunikationsstil: Direkt, motivierend, kein Gelaber. Deutsch.
Sprich Adrian mit Du an. Sei ehrlich wenn Werte schlecht aussehen.`;

export const trainerTools = [
  {
    name: "get_training_plan",
    description: "Aktuellen Trainingsplan mit allen Übungen abrufen",
    input_schema: { type: "object" as const, properties: {}, required: [] },
  },
  {
    name: "get_training_logs",
    description: "Trainingslogs für einen bestimmten Zeitraum abrufen",
    input_schema: {
      type: "object" as const,
      properties: { days_back: { type: "number", description: "Anzahl Tage zurück" } },
      required: ["days_back"],
    },
  },
  {
    name: "get_nutrition_summary",
    description: "Ernährungszusammenfassung für einen Zeitraum",
    input_schema: {
      type: "object" as const,
      properties: { days_back: { type: "number", description: "Anzahl Tage zurück" } },
      required: ["days_back"],
    },
  },
  {
    name: "get_weight_history",
    description: "Gewichtsverlauf abrufen",
    input_schema: {
      type: "object" as const,
      properties: { days_back: { type: "number", description: "Anzahl Tage zurück" } },
      required: ["days_back"],
    },
  },
  {
    name: "get_daily_todos",
    description: "Aktuelle Daily Todos abrufen",
    input_schema: { type: "object" as const, properties: {}, required: [] },
  },
  {
    name: "get_sport_todos",
    description: "Aktuelle Sport Todos abrufen",
    input_schema: { type: "object" as const, properties: {}, required: [] },
  },
  {
    name: "update_exercise",
    description: "Übung im Trainingsplan ändern",
    input_schema: {
      type: "object" as const,
      properties: {
        exercise_id: { type: "string" },
        updates: {
          type: "object",
          properties: {
            name: { type: "string" },
            muscle_group: { type: "string" },
            sets: { type: "number" },
            reps: { type: "number" },
          },
        },
      },
      required: ["exercise_id", "updates"],
    },
  },
  {
    name: "add_exercise",
    description: "Übung zum Trainingsplan hinzufügen",
    input_schema: {
      type: "object" as const,
      properties: {
        plan_id: { type: "string" },
        exercise_data: {
          type: "object",
          properties: {
            name: { type: "string" },
            muscle_group: { type: "string" },
            sets: { type: "number" },
            reps: { type: "number" },
            day_label: { type: "string" },
          },
          required: ["name", "muscle_group", "sets", "reps", "day_label"],
        },
      },
      required: ["plan_id", "exercise_data"],
    },
  },
  {
    name: "remove_exercise",
    description: "Übung aus dem Trainingsplan entfernen",
    input_schema: {
      type: "object" as const,
      properties: { exercise_id: { type: "string" } },
      required: ["exercise_id"],
    },
  },
  {
    name: "create_todo",
    description: "Todo erstellen (daily oder sport)",
    input_schema: {
      type: "object" as const,
      properties: {
        type: { type: "string", enum: ["daily", "sport"] },
        todo_data: {
          type: "object",
          properties: {
            title: { type: "string" },
            description: { type: "string" },
            priority: { type: "string", enum: ["hoch", "mittel", "niedrig"] },
            due_date: { type: "string" },
          },
          required: ["title"],
        },
      },
      required: ["type", "todo_data"],
    },
  },
  {
    name: "complete_todo",
    description: "Todo abhaken",
    input_schema: {
      type: "object" as const,
      properties: {
        todo_id: { type: "string" },
        type: { type: "string", enum: ["daily", "sport"] },
      },
      required: ["todo_id", "type"],
    },
  },
  {
    name: "generate_weekly_report",
    description: "Wochenbericht generieren und speichern",
    input_schema: { type: "object" as const, properties: {}, required: [] },
  },
];

export async function executeToolCall(
  toolName: string,
  input: Record<string, unknown>,
  userId: string
): Promise<unknown> {
  const today = new Date().toISOString().split("T")[0];

  switch (toolName) {
    case "get_training_plan": {
      const { data: plan } = await supabase
        .from("training_plans")
        .select("*, training_exercises(*)")
        .eq("user_id", userId)
        .eq("is_active", true)
        .single();
      return plan ?? { message: "Kein aktiver Trainingsplan" };
    }

    case "get_training_logs": {
      const daysBack = (input.days_back as number) ?? 7;
      const since = new Date();
      since.setDate(since.getDate() - daysBack);
      const { data } = await supabase
        .from("training_logs")
        .select("*, training_exercises(name, muscle_group)")
        .eq("user_id", userId)
        .gte("date", since.toISOString().split("T")[0])
        .order("date");
      return data ?? [];
    }

    case "get_nutrition_summary": {
      const daysBack = (input.days_back as number) ?? 7;
      const since = new Date();
      since.setDate(since.getDate() - daysBack);
      const { data } = await supabase
        .from("nutrition_log")
        .select("*")
        .eq("user_id", userId)
        .gte("date", since.toISOString().split("T")[0]);

      if (!data || data.length === 0) return { message: "Keine Einträge", days: [] };

      const byDate = new Map<string, { calories: number; protein: number; carbs: number; fat: number; fiber: number }>();
      for (const entry of data) {
        const existing = byDate.get(entry.date) ?? { calories: 0, protein: 0, carbs: 0, fat: 0, fiber: 0 };
        existing.calories += entry.calories;
        existing.protein += entry.protein_g;
        existing.carbs += entry.carbs_g;
        existing.fat += entry.fat_g;
        existing.fiber += entry.fiber_g;
        byDate.set(entry.date, existing);
      }

      const days = Array.from(byDate.entries()).map(([date, vals]) => ({ date, ...vals }));
      const avg = {
        calories: Math.round(days.reduce((s, d) => s + d.calories, 0) / days.length),
        protein: Math.round(days.reduce((s, d) => s + d.protein, 0) / days.length),
        carbs: Math.round(days.reduce((s, d) => s + d.carbs, 0) / days.length),
        fat: Math.round(days.reduce((s, d) => s + d.fat, 0) / days.length),
      };

      return { days, averages: avg };
    }

    case "get_weight_history": {
      const daysBack = (input.days_back as number) ?? 30;
      const since = new Date();
      since.setDate(since.getDate() - daysBack);
      const { data } = await supabase
        .from("weight_log")
        .select("*")
        .eq("user_id", userId)
        .gte("date", since.toISOString().split("T")[0])
        .order("date");
      return data ?? [];
    }

    case "get_daily_todos": {
      const { data } = await supabase
        .from("daily_todos")
        .select("*")
        .eq("user_id", userId)
        .eq("due_date", today);
      return data ?? [];
    }

    case "get_sport_todos": {
      const { data } = await supabase
        .from("sport_todos")
        .select("*")
        .eq("user_id", userId)
        .eq("due_date", today);
      return data ?? [];
    }

    case "update_exercise": {
      const { data } = await supabase
        .from("training_exercises")
        .update(input.updates as Record<string, unknown>)
        .eq("id", input.exercise_id as string)
        .select()
        .single();
      return data ?? { error: "Übung nicht gefunden" };
    }

    case "add_exercise": {
      const exData = input.exercise_data as Record<string, unknown>;
      const { data } = await supabase
        .from("training_exercises")
        .insert({
          plan_id: input.plan_id,
          ...exData,
          order_index: 0,
        })
        .select()
        .single();
      return data ?? { error: "Fehler beim Hinzufügen" };
    }

    case "remove_exercise": {
      await supabase
        .from("training_exercises")
        .delete()
        .eq("id", input.exercise_id as string);
      return { success: true };
    }

    case "create_todo": {
      const todoData = input.todo_data as Record<string, unknown>;
      const table = input.type === "sport" ? "sport_todos" : "daily_todos";
      const { data } = await supabase
        .from(table)
        .insert({
          user_id: userId,
          title: todoData.title,
          description: todoData.description ?? null,
          priority: todoData.priority ?? "mittel",
          due_date: (todoData.due_date as string) ?? today,
          completed: false,
          ...(input.type === "sport" ? { category: "sonstiges" } : {}),
        })
        .select()
        .single();
      return data ?? { error: "Fehler beim Erstellen" };
    }

    case "complete_todo": {
      const table = input.type === "sport" ? "sport_todos" : "daily_todos";
      const { data } = await supabase
        .from(table)
        .update({ completed: true })
        .eq("id", input.todo_id as string)
        .select()
        .single();
      return data ?? { error: "Todo nicht gefunden" };
    }

    case "generate_weekly_report": {
      const weekStart = new Date();
      weekStart.setDate(weekStart.getDate() - 7);
      const weekStartStr = weekStart.toISOString().split("T")[0];

      const [trainingLogs, nutritionLogs, weightLogs, dailyTodos, sportTodos] = await Promise.all([
        supabase.from("training_logs").select("*").eq("user_id", userId).gte("date", weekStartStr),
        supabase.from("nutrition_log").select("*").eq("user_id", userId).gte("date", weekStartStr),
        supabase.from("weight_log").select("*").eq("user_id", userId).gte("date", weekStartStr).order("date"),
        supabase.from("daily_todos").select("*").eq("user_id", userId).gte("due_date", weekStartStr),
        supabase.from("sport_todos").select("*").eq("user_id", userId).gte("due_date", weekStartStr),
      ]);

      const report = {
        week_start: weekStartStr,
        training: {
          sessions: trainingLogs.data?.length ?? 0,
          total_sets: (trainingLogs.data ?? []).reduce(
            (s, l) => s + ((l.sets_completed as unknown[]) ?? []).length, 0
          ),
        },
        nutrition: {
          avg_calories: nutritionLogs.data && nutritionLogs.data.length > 0
            ? Math.round(nutritionLogs.data.reduce((s, n) => s + n.calories, 0) / 7)
            : 0,
        },
        weight: {
          start: weightLogs.data?.[0]?.weight_kg ?? null,
          end: weightLogs.data?.[weightLogs.data.length - 1]?.weight_kg ?? null,
        },
        todos: {
          daily_completed: (dailyTodos.data ?? []).filter((t) => t.completed).length,
          daily_total: dailyTodos.data?.length ?? 0,
          sport_completed: (sportTodos.data ?? []).filter((t) => t.completed).length,
          sport_total: sportTodos.data?.length ?? 0,
        },
      };

      await supabase.from("weekly_reports").insert({
        user_id: userId,
        week_start: weekStartStr,
        report_json: report,
      });

      return report;
    }

    default:
      return { error: `Unbekanntes Tool: ${toolName}` };
  }
}
