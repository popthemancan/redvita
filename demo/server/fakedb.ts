type Row = Record<string, unknown>;
type Result = { data: unknown; error: { code?: string; message: string } | null; count?: number | null };

const nowIso = () => new Date().toISOString();
let seq = 1;

export const tables: Record<string, Row[]> = { patients: [], contacts: [], events: [], code_attempts: [] };

const defaults: Record<string, () => Row> = {
  patients: () => ({
    id: crypto.randomUUID(),
    phone: null,
    need: "other",
    home_lat: null,
    home_lng: null,
    push_token: null,
    lang: "en",
    power: "unknown",
    battery: null,
    last_heartbeat_at: null,
    outage_started_at: null,
    next_checkin_at: null,
    last_checkin_at: null,
    prompted_at: null,
    alerted_at: null,
    signal_alerted_at: null,
    version: 0,
    created_at: nowIso(),
  }),
  contacts: () => ({
    id: crypto.randomUUID(),
    phone: null,
    home_lat: null,
    home_lng: null,
    responding_at: null,
    last_report_at: null,
    push_token: null,
    lang: "en",
    created_at: nowIso(),
  }),
  events: () => ({ id: seq++, detail: null, created_at: nowIso() }),
  code_attempts: () => ({ id: seq++, created_at: nowIso() }),
};

export function reset(): void {
  for (const k of Object.keys(tables)) tables[k] = [];
}

type Filter = (r: Row) => boolean;

function parseOr(expr: string): Filter {
  const parts = expr.split(",").map((p) => {
    const bits = p.split(".");
    const col = bits[0];
    const not = bits[1] === "not";
    const [op, value] = not ? [bits[2], bits.slice(3).join(".")] : [bits[1], bits.slice(2).join(".")];
    const test: Filter =
      op === "is" && value === "null" ? (r) => r[col] === null || r[col] === undefined : (r) => String(r[col]) === value;
    return not ? (r: Row) => !test(r) : test;
  });
  return (r) => parts.some((f) => f(r));
}

function project(r: Row, cols: string): Row {
  if (cols.trim() === "*") return structuredClone(r);
  const out: Row = {};
  for (const c of cols.split(",").map((s) => s.trim())) out[c] = structuredClone(r[c]);
  return out;
}

class Query implements PromiseLike<Result> {
  private op: "select" | "insert" | "update" = "select";
  private payload: Row | Row[] = {};
  private cols = "*";
  private returning: string | null = null;
  private filters: Filter[] = [];
  private orderBy: { col: string; asc: boolean } | null = null;
  private max: number | null = null;
  private mode: "many" | "single" | "maybe" = "many";
  private countMode: string | null = null;
  private head = false;

  constructor(private table: string) {}

  select(cols = "*", opts: { count?: string; head?: boolean } = {}) {
    if (this.op === "select") this.cols = cols;
    else this.returning = cols;
    this.countMode = opts.count ?? null;
    this.head = opts.head ?? false;
    return this;
  }
  insert(v: Row | Row[]) {
    this.op = "insert";
    this.payload = v;
    return this;
  }
  update(v: Row) {
    this.op = "update";
    this.payload = v;
    return this;
  }
  eq(col: string, v: unknown) {
    this.filters.push((r) => r[col] === v);
    return this;
  }
  gte(col: string, v: number | string) {
    this.filters.push((r) => r[col] !== null && (r[col] as number | string) >= v);
    return this;
  }
  lte(col: string, v: number | string) {
    this.filters.push((r) => r[col] !== null && (r[col] as number | string) <= v);
    return this;
  }
  or(expr: string) {
    this.filters.push(parseOr(expr));
    return this;
  }
  order(col: string, opts: { ascending?: boolean } = {}) {
    this.orderBy = { col, asc: opts.ascending ?? true };
    return this;
  }
  limit(n: number) {
    this.max = n;
    return this;
  }
  single() {
    this.mode = "single";
    return this;
  }
  maybeSingle() {
    this.mode = "maybe";
    return this;
  }

  private run(): Result {
    const rows = tables[this.table];
    let out: Row[];
    if (this.op === "insert") {
      const items = Array.isArray(this.payload) ? this.payload : [this.payload];
      out = [];
      for (const item of items) {
        const row = { ...defaults[this.table](), ...item };
        if (this.table === "patients" && rows.some((r) => r.link_code === row.link_code)) {
          return { data: null, error: { code: "23505", message: "duplicate link_code" } };
        }
        rows.push(row);
        out.push(row);
      }
      if (this.returning === null) return { data: null, error: null };
      out = out.map((r) => project(r, this.returning!));
    } else if (this.op === "update") {
      const hit = rows.filter((r) => this.filters.every((f) => f(r)));
      for (const r of hit) Object.assign(r, structuredClone(this.payload));
      if (this.returning === null) return { data: null, error: null };
      out = hit.map((r) => project(r, this.returning!));
    } else {
      let hit = rows.filter((r) => this.filters.every((f) => f(r)));
      if (this.orderBy) {
        const { col, asc } = this.orderBy;
        hit = [...hit].sort((a, b) => ((a[col] as string) < (b[col] as string) ? -1 : 1) * (asc ? 1 : -1));
      }
      if (this.max !== null) hit = hit.slice(0, this.max);
      const count = this.countMode ? hit.length : null;
      if (this.head) return { data: null, error: null, count };
      out = hit.map((r) => project(r, this.cols));
      if (this.mode === "many") return { data: out, error: null, count };
    }
    if (this.mode === "many") return { data: out, error: null };
    if (out.length > 1) return { data: null, error: { code: "PGRST116", message: "more than one row" } };
    if (out.length === 0 && this.mode === "single") return { data: null, error: { code: "PGRST116", message: "no rows" } };
    return { data: out[0] ?? null, error: null };
  }

  then<A = Result, B = never>(ok?: ((v: Result) => A | PromiseLike<A>) | null, bad?: ((e: unknown) => B | PromiseLike<B>) | null) {
    return Promise.resolve()
      .then(() => this.run())
      .then(ok, bad);
  }
}

export type SupabaseClient = { from(table: string): Query };

export function createClient(..._args: unknown[]): SupabaseClient {
  return { from: (table: string) => new Query(table) };
}
