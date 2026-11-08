// Minimal in-memory stand-in for the Supabase client, used when VITE_DEMO=1.
//
// It implements only the query-builder surface this app actually uses:
// select/insert/update/upsert/delete, the eq/gte/lte/in/ilike filters, plus
// order, limit and single. Writes mutate the in-memory fixtures so the UI stays
// interactive for a session; nothing is persisted.

import { demoTables, demoFoodCatalogue } from "./demo-data";

type Row = Record<string, unknown>;
type Filter = { kind: "eq" | "gte" | "lte" | "in" | "ilike"; column: string; value: unknown };
type Result<T> = { data: T; error: null } | { data: null; error: { message: string } };

// Cloned once so mutations never leak back into the fixture module.
const store: Record<string, Row[]> = Object.fromEntries(
  Object.entries(demoTables).map(([table, rows]) => [table, structuredClone(rows)]),
);

function tableRows(table: string): Row[] {
  if (!store[table]) store[table] = [];
  return store[table];
}

function matches(row: Row, filters: Filter[]): boolean {
  return filters.every((f) => {
    const cell = row[f.column];
    switch (f.kind) {
      case "eq":
        return cell === f.value;
      case "gte":
        return String(cell) >= String(f.value);
      case "lte":
        return String(cell) <= String(f.value);
      case "in":
        return Array.isArray(f.value) && f.value.includes(cell);
      case "ilike":
        return String(cell)
          .toLowerCase()
          .includes(String(f.value).replaceAll("%", "").toLowerCase());
    }
  });
}

let idCounter = 0;
const nextId = () => `demo-generated-${++idCounter}`;

class DemoQuery implements PromiseLike<Result<unknown>> {
  private filters: Filter[] = [];
  private operation: "select" | "insert" | "update" | "upsert" | "delete" = "select";
  private payload: Row[] = [];
  private sort?: { column: string; ascending: boolean };
  private max?: number;
  private wantsSingle = false;

  private readonly table: string;

  constructor(table: string) {
    this.table = table;
  }

  select() {
    return this;
  }

  insert(rows: Row | Row[]) {
    this.operation = "insert";
    this.payload = Array.isArray(rows) ? rows : [rows];
    return this;
  }

  update(patch: Row) {
    this.operation = "update";
    this.payload = [patch];
    return this;
  }

  upsert(rows: Row | Row[]) {
    this.operation = "upsert";
    this.payload = Array.isArray(rows) ? rows : [rows];
    return this;
  }

  delete() {
    this.operation = "delete";
    return this;
  }

  eq(column: string, value: unknown) {
    this.filters.push({ kind: "eq", column, value });
    return this;
  }

  gte(column: string, value: unknown) {
    this.filters.push({ kind: "gte", column, value });
    return this;
  }

  lte(column: string, value: unknown) {
    this.filters.push({ kind: "lte", column, value });
    return this;
  }

  in(column: string, value: unknown[]) {
    this.filters.push({ kind: "in", column, value });
    return this;
  }

  ilike(column: string, value: string) {
    this.filters.push({ kind: "ilike", column, value });
    return this;
  }

  order(column: string, options?: { ascending?: boolean }) {
    this.sort = { column, ascending: options?.ascending ?? true };
    return this;
  }

  limit(count: number) {
    this.max = count;
    return this;
  }

  single() {
    this.wantsSingle = true;
    return this;
  }

  maybeSingle() {
    return this.single();
  }

  private run(): Result<unknown> {
    const rows = tableRows(this.table);
    let affected: Row[];

    switch (this.operation) {
      case "insert": {
        affected = this.payload.map((r) => ({
          id: nextId(),
          created_at: new Date().toISOString(),
          ...r,
        }));
        rows.push(...affected);
        break;
      }
      case "upsert": {
        affected = this.payload.map((incoming) => {
          // Match on the natural key the app upserts by: same user plus the
          // other identifying columns present in the payload.
          const keys = Object.keys(incoming).filter((k) =>
            ["user_id", "date", "routine_id", "goal_type", "name", "id"].includes(k),
          );
          const existing = rows.find((r) => keys.every((k) => r[k] === incoming[k]));
          if (existing) {
            Object.assign(existing, incoming);
            return existing;
          }
          const created = { id: nextId(), created_at: new Date().toISOString(), ...incoming };
          rows.push(created);
          return created;
        });
        break;
      }
      case "update": {
        affected = rows.filter((r) => matches(r, this.filters));
        affected.forEach((r) => Object.assign(r, this.payload[0]));
        break;
      }
      case "delete": {
        affected = rows.filter((r) => matches(r, this.filters));
        store[this.table] = rows.filter((r) => !affected.includes(r));
        break;
      }
      default: {
        affected = rows.filter((r) => matches(r, this.filters));
        if (this.sort) {
          const { column, ascending } = this.sort;
          affected = [...affected].sort((a, b) => {
            const av = a[column] as string | number;
            const bv = b[column] as string | number;
            if (av === bv) return 0;
            return (av > bv ? 1 : -1) * (ascending ? 1 : -1);
          });
        }
        if (this.max !== undefined) affected = affected.slice(0, this.max);
      }
    }

    if (this.wantsSingle) {
      const row = affected[0];
      return row
        ? { data: structuredClone(row), error: null }
        : { data: null, error: { message: "No rows found" } };
    }
    return { data: structuredClone(affected), error: null };
  }

  then<A = Result<unknown>, B = never>(
    onfulfilled?: ((value: Result<unknown>) => A | PromiseLike<A>) | null,
    onrejected?: ((reason: unknown) => B | PromiseLike<B>) | null,
  ): PromiseLike<A | B> {
    return Promise.resolve(this.run()).then(onfulfilled, onrejected);
  }
}

export const demoClient = {
  from: (table: string) => new DemoQuery(table),
};

/** Stands in for the food-lookup edge function while in demo mode. */
export function demoFoodResponse(endpoint: string, body: Record<string, unknown>) {
  switch (endpoint) {
    case "search": {
      const query = String(body.query ?? "").toLowerCase();
      const results = demoFoodCatalogue
        .filter((f) => f.name.toLowerCase().includes(query))
        .map((f) => ({
          id: f.id,
          name: f.name,
          brand: f.brand,
          description: `Per 100g - Calories: ${f.servings[0].calories}kcal`,
        }));
      return { results, totalResults: results.length };
    }
    case "food":
      return { found: true, food: demoFoodCatalogue.find((f) => f.id === body.food_id) };
    case "barcode":
      return { found: true, food: demoFoodCatalogue[0] };
    case "ai":
      return [
        { name: "Reis", amount_g: 250, calories: 325, protein_g: 6.8, carbs_g: 70.5, fat_g: 0.8 },
        {
          name: "Hähnchenbrust",
          amount_g: 200,
          calories: 330,
          protein_g: 62,
          carbs_g: 0,
          fat_g: 7.2,
        },
        { name: "Brokkoli", amount_g: 150, calories: 51, protein_g: 4.2, carbs_g: 6.0, fat_g: 0.6 },
      ];
    default:
      return null;
  }
}

export const IS_DEMO = import.meta.env.VITE_DEMO === "1";
