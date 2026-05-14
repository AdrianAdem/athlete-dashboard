import { useState, useEffect, useCallback } from "react";
import { ChevronLeft, ChevronRight, MapPin, Clock } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { USER_ID } from "@/lib/constants";
import type { CalendarEvent } from "@/types/database";

const WEEKDAYS = ["Mo", "Di", "Mi", "Do", "Fr", "Sa", "So"];
const MONTHS = ["Januar", "Februar", "März", "April", "Mai", "Juni", "Juli", "August", "September", "Oktober", "November", "Dezember"];

function getDaysInMonth(year: number, month: number) {
  return new Date(year, month + 1, 0).getDate();
}

function getFirstDayOfMonth(year: number, month: number) {
  const day = new Date(year, month, 1).getDay();
  return day === 0 ? 6 : day - 1;
}

function dateStr(y: number, m: number, d: number) {
  return `${y}-${String(m + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

function formatTime(isoStr: string) {
  return new Date(isoStr).toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit" });
}

export function CalendarPage() {
  const today = new Date();
  const [year, setYear] = useState(today.getFullYear());
  const [month, setMonth] = useState(today.getMonth());
  const [selectedDate, setSelectedDate] = useState<string>(
    dateStr(today.getFullYear(), today.getMonth(), today.getDate())
  );
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [loading, setLoading] = useState(true);

  const daysInMonth = getDaysInMonth(year, month);
  const firstDay = getFirstDayOfMonth(year, month);
  const todayStr = dateStr(today.getFullYear(), today.getMonth(), today.getDate());

  const fetchEvents = useCallback(async () => {
    const start = `${year}-${String(month + 1).padStart(2, "0")}-01T00:00:00`;
    const endD = getDaysInMonth(year, month);
    const end = `${year}-${String(month + 1).padStart(2, "0")}-${String(endD).padStart(2, "0")}T23:59:59`;

    const { data } = await supabase
      .from("calendar_events")
      .select("*")
      .eq("user_id", USER_ID)
      .gte("start_time", start)
      .lte("start_time", end)
      .order("start_time");

    if (data) setEvents(data as CalendarEvent[]);
    setLoading(false);
  }, [year, month]);

  useEffect(() => { fetchEvents(); }, [fetchEvents]);

  const prevMonth = () => {
    if (month === 0) { setMonth(11); setYear(year - 1); }
    else setMonth(month - 1);
  };

  const nextMonth = () => {
    if (month === 11) { setMonth(0); setYear(year + 1); }
    else setMonth(month + 1);
  };

  const days: (number | null)[] = Array.from({ length: firstDay }, () => null);
  for (let d = 1; d <= daysInMonth; d++) days.push(d);

  const eventsOnDate = (date: string) =>
    events.filter((e) => {
      const eDate = e.start_time.slice(0, 10);
      return eDate === date;
    });

  const selectedEvents = eventsOnDate(selectedDate);
  const selectedDay = Number(selectedDate.split("-")[2]);

  return (
    <div className="space-y-4 p-4 pb-24">
      <div className="flex items-center justify-between">
        <button onClick={prevMonth} className="rounded-lg bg-neutral-800 p-2">
          <ChevronLeft className="h-5 w-5" />
        </button>
        <h1 className="text-lg font-bold">{MONTHS[month]} {year}</h1>
        <button onClick={nextMonth} className="rounded-lg bg-neutral-800 p-2">
          <ChevronRight className="h-5 w-5" />
        </button>
      </div>

      <div className="rounded-xl bg-card p-4">
        <div className="grid grid-cols-7 gap-1 mb-2">
          {WEEKDAYS.map((d) => (
            <div key={d} className="text-center text-xs font-medium text-neutral-500">{d}</div>
          ))}
        </div>
        <div className="grid grid-cols-7 gap-1">
          {days.map((day, i) => {
            if (day === null) return <div key={i} />;
            const ds = dateStr(year, month, day);
            const isToday = ds === todayStr;
            const isSelected = ds === selectedDate;
            const hasEvents = eventsOnDate(ds).length > 0;
            return (
              <button key={i} onClick={() => setSelectedDate(ds)}
                className={`relative flex h-10 items-center justify-center rounded-lg text-sm transition-all ${
                  isSelected ? "bg-white font-bold text-black" :
                  isToday ? "bg-neutral-800 font-bold text-white" :
                  "text-neutral-300 hover:bg-neutral-800/50"
                }`}>
                {day}
                {hasEvents && (
                  <span className={`absolute bottom-1 h-1 w-1 rounded-full ${
                    isSelected ? "bg-black" : "bg-blue-400"
                  }`} />
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* Events for selected date */}
      <div className="space-y-2">
        <p className="text-xs font-semibold uppercase tracking-wider text-neutral-500">
          {selectedDay}. {MONTHS[month]}
        </p>

        {loading ? (
          <div className="rounded-xl bg-card p-4 text-center text-sm text-neutral-500">Laden...</div>
        ) : selectedEvents.length === 0 ? (
          <div className="rounded-xl bg-card p-4 text-center text-sm text-neutral-500">
            Keine Termine an diesem Tag
          </div>
        ) : (
          selectedEvents.map((event) => (
            <div key={event.id} className="rounded-xl bg-card p-4">
              <div className="flex items-start gap-3">
                <div className="mt-1 h-3 w-3 shrink-0 rounded-full" style={{ backgroundColor: event.color || "#3b82f6" }} />
                <div className="flex-1">
                  <p className="text-sm font-semibold">{event.title}</p>
                  <div className="mt-1 flex flex-wrap items-center gap-3 text-xs text-neutral-500">
                    {event.all_day ? (
                      <span>Ganztägig</span>
                    ) : (
                      <span className="flex items-center gap-1">
                        <Clock className="h-3 w-3" />
                        {formatTime(event.start_time)} – {formatTime(event.end_time)}
                      </span>
                    )}
                    {event.location && (
                      <span className="flex items-center gap-1">
                        <MapPin className="h-3 w-3" /> {event.location}
                      </span>
                    )}
                  </div>
                  {event.description && (
                    <p className="mt-2 text-xs text-neutral-600">{event.description}</p>
                  )}
                </div>
              </div>
            </div>
          ))
        )}
      </div>

      <p className="text-center text-[10px] text-neutral-700">
        Events werden via Google Calendar MCP synchronisiert
      </p>
    </div>
  );
}
