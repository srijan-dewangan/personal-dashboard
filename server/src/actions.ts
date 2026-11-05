import { defineAction, z, type ActionsModule, type Ctx } from "@hatch/space-sdk";
import { asc, desc, eq, and } from "drizzle-orm";
import * as schema from "./schema";

function todayKolkata(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
}
function dateOffset(base: string, days: number): string {
  const d = new Date(`${base}T12:00:00+05:30`);
  d.setDate(d.getDate() + days);
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata", year: "numeric", month: "2-digit", day: "2-digit" }).format(d);
}

const WMO: Record<number, string> = { 0:"Clear sky",1:"Mainly clear",2:"Partly cloudy",3:"Overcast",45:"Foggy",48:"Foggy",51:"Light drizzle",53:"Drizzle",55:"Drizzle",61:"Light rain",63:"Rain",65:"Heavy rain",71:"Light snow",73:"Snow",75:"Heavy snow",80:"Light showers",81:"Showers",82:"Violent showers",95:"Thunderstorm",96:"Thunderstorm",99:"Thunderstorm" };

async function getSetting(ctx: Ctx, key: string, fallback: string): Promise<string> {
  const db = ctx.db<typeof schema>();
  const rows = await db.select().from(schema.settings).where(eq(schema.settings.key, key));
  return rows[0]?.value ?? fallback;
}
async function setSetting(ctx: Ctx, key: string, value: string) {
  const db = ctx.db<typeof schema>();
  const existing = await db.select().from(schema.settings).where(eq(schema.settings.key, key));
  if (existing.length) await db.update(schema.settings).set({ value }).where(eq(schema.settings.key, key));
  else await db.insert(schema.settings).values({ key, value });
}

async function fetchWeather(ctx: Ctx) {
  const city = await getSetting(ctx, "city", "Delhi");
  const lat = parseFloat(await getSetting(ctx, "lat", "28.65195"));
  const lon = parseFloat(await getSetting(ctx, "lon", "77.23149"));
  const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current=temperature_2m,weather_code,wind_speed_10m,relative_humidity_2m&daily=temperature_2m_max,temperature_2m_min,weather_code&timezone=Asia%2FKolkata&forecast_days=4`;
  const res = await fetch(url);
  if (!res.ok) throw new Error("Weather fetch failed");
  const j: any = await res.json();
  const weather = {
    city,
    temp: Math.round(j.current.temperature_2m),
    code: j.current.weather_code as number,
    label: WMO[j.current.weather_code as number] ?? "—",
    humidity: j.current.relative_humidity_2m as number,
    wind: Math.round(j.current.wind_speed_10m),
    daily: (j.daily.time as string[]).map((d: string, i: number) => ({ date: d, max: Math.round(j.daily.temperature_2m_max[i]), min: Math.round(j.daily.temperature_2m_min[i]), label: WMO[j.daily.weather_code[i]] ?? "—", code: j.daily.weather_code[i] })),
    fetchedAt: new Date().toISOString(),
  };
  const db = ctx.db<typeof schema>();
  await db.delete(schema.weatherCache);
  await db.insert(schema.weatherCache).values({ data: JSON.stringify(weather) });
  return weather;
}

async function ensureTodayGoals(ctx: Ctx) {
  const db = ctx.db<typeof schema>();
  const today = todayKolkata();
  const templates = await db.select().from(schema.goalTemplates).orderBy(asc(schema.goalTemplates.id));
  const existing = await db.select().from(schema.goalProgress).where(eq(schema.goalProgress.date, today));
  const have = new Set(existing.map(e => e.templateId));
  for (const t of templates) {
    if (!have.has(t.id)) await db.insert(schema.goalProgress).values({ templateId: t.id, date: today, current: 0 });
  }
}

const weatherShape = z.object({
  city: z.string(), temp: z.number(), code: z.number(), label: z.string(), humidity: z.number(), wind: z.number(),
  daily: z.array(z.object({ date: z.string(), max: z.number(), min: z.number(), label: z.string(), code: z.number() })),
  fetchedAt: z.string(),
}).nullable();

export const Actions = {
  getDashboard: defineAction({
    description: "Returns the full dashboard: todos, today's goals, notes, bookmarks, habits, focus stats, and weather.",
    request: z.object({}),
    response: z.object({
      today: z.string(),
      todos: z.array(z.object({ id: z.number(), title: z.string(), notes: z.string(), priority: z.string(), completed: z.boolean(), created_at: z.string() })),
      goals: z.array(z.object({ id: z.number(), templateId: z.number(), title: z.string(), target: z.number(), unit: z.string(), current: z.number() })),
      notes: z.array(z.object({ id: z.number(), title: z.string(), content: z.string(), color: z.string(), pinned: z.boolean(), updated_at: z.string() })),
      bookmarks: z.array(z.object({ id: z.number(), title: z.string(), url: z.string(), category: z.string() })),
      habits: z.array(z.object({ id: z.number(), name: z.string(), doneToday: z.boolean(), streak: z.number() })),
      focusTodayMinutes: z.number(),
      focusSessionsToday: z.number(),
      focusTotalMinutes: z.number(),
      weather: weatherShape,
    }),
    async handler(ctx) {
      const db = ctx.db<typeof schema>();
      const today = todayKolkata();
      await ensureTodayGoals(ctx);
      const todoRows = await db.select().from(schema.todos).orderBy(desc(schema.todos.id));
      const templates = await db.select().from(schema.goalTemplates).orderBy(asc(schema.goalTemplates.id));
      const prog = await db.select().from(schema.goalProgress).where(eq(schema.goalProgress.date, today));
      const progMap = new Map(prog.map(p => [p.templateId, p]));
      const goals = templates.map(t => { const p = progMap.get(t.id); return { id: p?.id ?? 0, templateId: t.id, title: t.title, target: t.target, unit: t.unit, current: p?.current ?? 0 }; });
      const noteRows = await db.select().from(schema.notes).orderBy(desc(schema.notes.pinned), desc(schema.notes.updatedAt));
      const bmRows = await db.select().from(schema.bookmarks).orderBy(asc(schema.bookmarks.category), desc(schema.bookmarks.id));
      const habitRows = await db.select().from(schema.habits).orderBy(asc(schema.habits.id));
      const allLogs = await db.select().from(schema.habitLogs);
      const habits = habitRows.map(h => {
        const dates = new Set(allLogs.filter(l => l.habitId === h.id).map(l => l.date));
        const doneToday = dates.has(today);
        let streak = 0; let cursor = doneToday ? today : dateOffset(today, -1);
        while (dates.has(cursor)) { streak++; cursor = dateOffset(cursor, -1); }
        return { id: h.id, name: h.name, doneToday, streak };
      });
      const sessions = await db.select().from(schema.focusSessions).orderBy(desc(schema.focusSessions.id));
      const todayStart = new Date(`${today}T00:00:00+05:30`).getTime();
      const todaySessions = sessions.filter(s => s.completedAt.getTime() >= todayStart);
      const focusTodayMinutes = todaySessions.reduce((a, s) => a + s.minutes, 0);
      const focusTotalMinutes = sessions.reduce((a, s) => a + s.minutes, 0);
      // weather: serve cache if fresh (<3h), else fetch
      let weather: z.infer<typeof weatherShape> = null;
      const cache = await db.select().from(schema.weatherCache).orderBy(desc(schema.weatherCache.id)).limit(1);
      if (cache[0]) {
        const age = Date.now() - cache[0].fetchedAt.getTime();
        if (age < 3 * 3600 * 1000) { try { weather = JSON.parse(cache[0].data); } catch {} }
      }
      if (!weather) { try { weather = await fetchWeather(ctx); } catch { if (cache[0]) { try { weather = JSON.parse(cache[0].data); } catch {} } } }
      return {
        today,
        todos: todoRows.map(r => ({ id: r.id, title: r.title, notes: r.notes ?? "", priority: r.priority, completed: r.completed === 1, created_at: r.createdAt.toISOString() })),
        goals,
        notes: noteRows.map(r => ({ id: r.id, title: r.title, content: r.content, color: r.color, pinned: r.pinned === 1, updated_at: r.updatedAt.toISOString() })),
        bookmarks: bmRows.map(r => ({ id: r.id, title: r.title, url: r.url, category: r.category })),
        habits,
        focusTodayMinutes, focusSessionsToday: todaySessions.length, focusTotalMinutes,
        weather,
      };
    },
  }),

  addTodo: defineAction({
    description: "Adds a todo item.",
    request: z.object({ title: z.string().min(1), priority: z.enum(["low","medium","high"]).default("medium") }),
    response: z.object({ id: z.number() }),
    async handler(ctx, args) { const db = ctx.db<typeof schema>(); const r = await db.insert(schema.todos).values({ title: args.title, priority: args.priority }).returning({ id: schema.todos.id }); ctx.invalidateQueries(); return { id: r[0]!.id }; },
  }),
  toggleTodo: defineAction({
    description: "Toggles a todo's completed state.",
    request: z.object({ id: z.number(), completed: z.boolean() }),
    response: z.object({ ok: z.literal(true) }),
    async handler(ctx, args): Promise<{ ok: true }> { const db = ctx.db<typeof schema>(); await db.update(schema.todos).set({ completed: args.completed ? 1 : 0 }).where(eq(schema.todos.id, args.id)); ctx.invalidateQueries(); return { ok: true }; },
  }),
  deleteTodo: defineAction({
    description: "Deletes a todo.",
    request: z.object({ id: z.number() }),
    response: z.object({ ok: z.literal(true) }),
    async handler(ctx, args): Promise<{ ok: true }> { const db = ctx.db<typeof schema>(); await db.delete(schema.todos).where(eq(schema.todos.id, args.id)); ctx.invalidateQueries(); return { ok: true }; },
  }),

  addGoal: defineAction({
    description: "Adds a daily goal template and today's progress row.",
    request: z.object({ title: z.string().min(1), target: z.number().int().min(1).max(9999), unit: z.string().default("") }),
    response: z.object({ id: z.number() }),
    async handler(ctx, args) { const db = ctx.db<typeof schema>(); const r = await db.insert(schema.goalTemplates).values({ title: args.title, target: args.target, unit: args.unit }).returning({ id: schema.goalTemplates.id }); const tid = r[0]!.id; await db.insert(schema.goalProgress).values({ templateId: tid, date: todayKolkata(), current: 0 }); ctx.invalidateQueries(); return { id: tid }; },
  }),
  setGoalProgress: defineAction({
    description: "Sets today's progress value for a goal.",
    request: z.object({ templateId: z.number(), current: z.number().int().min(0).max(99999) }),
    response: z.object({ ok: z.literal(true) }),
    async handler(ctx, args): Promise<{ ok: true }> { const db = ctx.db<typeof schema>(); const today = todayKolkata(); await ensureTodayGoals(ctx); await db.update(schema.goalProgress).set({ current: args.current }).where(and(eq(schema.goalProgress.templateId, args.templateId), eq(schema.goalProgress.date, today))); ctx.invalidateQueries(); return { ok: true }; },
  }),
  deleteGoal: defineAction({
    description: "Deletes a daily goal and its progress history.",
    request: z.object({ templateId: z.number() }),
    response: z.object({ ok: z.literal(true) }),
    async handler(ctx, args): Promise<{ ok: true }> { const db = ctx.db<typeof schema>(); await db.delete(schema.goalProgress).where(eq(schema.goalProgress.templateId, args.templateId)); await db.delete(schema.goalTemplates).where(eq(schema.goalTemplates.id, args.templateId)); ctx.invalidateQueries(); return { ok: true }; },
  }),

  addNote: defineAction({
    description: "Creates a quick note.",
    request: z.object({ title: z.string().default(""), content: z.string().default(""), color: z.string().default("amber") }),
    response: z.object({ id: z.number() }),
    async handler(ctx, args) { const db = ctx.db<typeof schema>(); const r = await db.insert(schema.notes).values({ title: args.title, content: args.content, color: args.color }).returning({ id: schema.notes.id }); ctx.invalidateQueries(); return { id: r[0]!.id }; },
  }),
  updateNote: defineAction({
    description: "Updates a note's title, content, color, or pinned state.",
    request: z.object({ id: z.number(), title: z.string().optional(), content: z.string().optional(), color: z.string().optional(), pinned: z.boolean().optional() }),
    response: z.object({ ok: z.literal(true) }),
    async handler(ctx, args): Promise<{ ok: true }> { const db = ctx.db<typeof schema>(); const patch: Record<string, unknown> = { updatedAt: new Date() }; if (args.title !== undefined) patch.title = args.title; if (args.content !== undefined) patch.content = args.content; if (args.color !== undefined) patch.color = args.color; if (args.pinned !== undefined) patch.pinned = args.pinned ? 1 : 0; await db.update(schema.notes).set(patch).where(eq(schema.notes.id, args.id)); ctx.invalidateQueries(); return { ok: true }; },
  }),
  deleteNote: defineAction({
    description: "Deletes a note.",
    request: z.object({ id: z.number() }),
    response: z.object({ ok: z.literal(true) }),
    async handler(ctx, args): Promise<{ ok: true }> { const db = ctx.db<typeof schema>(); await db.delete(schema.notes).where(eq(schema.notes.id, args.id)); ctx.invalidateQueries(); return { ok: true }; },
  }),

  addBookmark: defineAction({
    description: "Adds a bookmark.",
    request: z.object({ title: z.string().min(1), url: z.string().min(1), category: z.string().default("General") }),
    response: z.object({ id: z.number() }),
    async handler(ctx, args) { const db = ctx.db<typeof schema>(); let url = args.url.trim(); if (!/^https?:\/\//i.test(url)) url = "https://" + url; const r = await db.insert(schema.bookmarks).values({ title: args.title, url, category: args.category || "General" }).returning({ id: schema.bookmarks.id }); ctx.invalidateQueries(); return { id: r[0]!.id }; },
  }),
  deleteBookmark: defineAction({
    description: "Deletes a bookmark.",
    request: z.object({ id: z.number() }),
    response: z.object({ ok: z.literal(true) }),
    async handler(ctx, args): Promise<{ ok: true }> { const db = ctx.db<typeof schema>(); await db.delete(schema.bookmarks).where(eq(schema.bookmarks.id, args.id)); ctx.invalidateQueries(); return { ok: true }; },
  }),

  addHabit: defineAction({
    description: "Adds a daily habit to track.",
    request: z.object({ name: z.string().min(1) }),
    response: z.object({ id: z.number() }),
    async handler(ctx, args) { const db = ctx.db<typeof schema>(); const r = await db.insert(schema.habits).values({ name: args.name }).returning({ id: schema.habits.id }); ctx.invalidateQueries(); return { id: r[0]!.id }; },
  }),
  toggleHabit: defineAction({
    description: "Marks or unmarks a habit as done today.",
    request: z.object({ habitId: z.number(), done: z.boolean() }),
    response: z.object({ ok: z.literal(true) }),
    async handler(ctx, args): Promise<{ ok: true }> { const db = ctx.db<typeof schema>(); const today = todayKolkata(); if (args.done) { const ex = await db.select().from(schema.habitLogs).where(and(eq(schema.habitLogs.habitId, args.habitId), eq(schema.habitLogs.date, today))); if (!ex.length) await db.insert(schema.habitLogs).values({ habitId: args.habitId, date: today }); } else { await db.delete(schema.habitLogs).where(and(eq(schema.habitLogs.habitId, args.habitId), eq(schema.habitLogs.date, today))); } ctx.invalidateQueries(); return { ok: true }; },
  }),
  deleteHabit: defineAction({
    description: "Deletes a habit and its logs.",
    request: z.object({ id: z.number() }),
    response: z.object({ ok: z.literal(true) }),
    async handler(ctx, args): Promise<{ ok: true }> { const db = ctx.db<typeof schema>(); await db.delete(schema.habitLogs).where(eq(schema.habitLogs.habitId, args.id)); await db.delete(schema.habits).where(eq(schema.habits.id, args.id)); ctx.invalidateQueries(); return { ok: true }; },
  }),

  logFocus: defineAction({
    description: "Logs a completed focus session.",
    request: z.object({ minutes: z.number().int().min(1).max(480), label: z.string().default("") }),
    response: z.object({ id: z.number() }),
    async handler(ctx, args) { const db = ctx.db<typeof schema>(); const r = await db.insert(schema.focusSessions).values({ minutes: args.minutes, label: args.label }).returning({ id: schema.focusSessions.id }); ctx.invalidateQueries(); return { id: r[0]!.id }; },
  }),

  refreshWeather: defineAction({
    description: "Refetches weather from Open-Meteo and updates the cache.",
    request: z.object({}),
    response: z.object({ weather: weatherShape }),
    async handler(ctx) { const w = await fetchWeather(ctx); ctx.invalidateQueries(); return { weather: w }; },
  }),

  setLocation: defineAction({
    description: "Sets the weather city by geocoding a place name and refreshes weather.",
    request: z.object({ city: z.string().min(1) }),
    response: z.object({ ok: z.literal(true), city: z.string() }),
    async handler(ctx, args): Promise<{ ok: true; city: string }> {
      const res = await fetch(`https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(args.city)}&count=1&language=en&format=json`);
      if (!res.ok) throw new Error("Geocoding failed");
      const j: any = await res.json();
      const first = j.results?.[0];
      if (!first) throw new Error("City not found");
      await setSetting(ctx, "city", first.name as string);
      await setSetting(ctx, "lat", String(first.latitude));
      await setSetting(ctx, "lon", String(first.longitude));
      await fetchWeather(ctx);
      ctx.invalidateQueries();
      return { ok: true, city: first.name as string };
    },
  }),

  dailyReset: defineAction({
    description: "Daily refresh: ensures today's goal rows exist (fresh progress) and refreshes the weather cache. Run by the daily schedule.",
    request: z.object({}),
    response: z.object({ ok: z.literal(true), today: z.string() }),
    async handler(ctx): Promise<{ ok: true; today: string }> { await ensureTodayGoals(ctx); try { await fetchWeather(ctx); } catch {} ctx.invalidateQueries(); return { ok: true, today: todayKolkata() }; },
  }),
} satisfies ActionsModule;
