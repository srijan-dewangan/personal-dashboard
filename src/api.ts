// Local-storage API for the standalone Personal Dashboard.
//
// Replaces the Muse space RPC client (server/src/actions.ts + Drizzle +
// SQLite) with the same method names/signatures the App uses, backed by a
// single localStorage key. No backend, no API key: weather is fetched
// directly from the browser via Open-Meteo (forecast + geocoding).

export interface WeatherDay {
  date: string;
  max: number;
  min: number;
  label: string;
  code: number;
}

export interface Weather {
  city: string;
  temp: number;
  code: number;
  label: string;
  humidity: number;
  wind: number;
  daily: WeatherDay[];
  fetchedAt: string;
}

export type TodoPriority = "low" | "medium" | "high";

export interface Todo {
  id: number;
  title: string;
  notes: string;
  priority: TodoPriority;
  completed: boolean;
  created_at: string;
}

export interface Goal {
  id: number;
  templateId: number;
  title: string;
  target: number;
  unit: string;
  current: number;
}

export interface Note {
  id: number;
  title: string;
  content: string;
  color: string;
  pinned: boolean;
  updated_at: string;
}

export interface Bookmark {
  id: number;
  title: string;
  url: string;
  category: string;
}

export interface Habit {
  id: number;
  name: string;
  doneToday: boolean;
  streak: number;
}

export interface Dashboard {
  today: string;
  todos: Todo[];
  goals: Goal[];
  notes: Note[];
  bookmarks: Bookmark[];
  habits: Habit[];
  focusTodayMinutes: number;
  focusSessionsToday: number;
  focusTotalMinutes: number;
  weather: Weather | null;
}

const STORAGE_KEY = "personal-dashboard-v1";
const WEATHER_CACHE_MS = 3 * 3600 * 1000;

function todayKolkata(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

function dateOffset(base: string, days: number): string {
  const d = new Date(`${base}T12:00:00+05:30`);
  d.setDate(d.getDate() + days);
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(d);
}

const WMO: Record<number, string> = {
  0: "Clear sky",
  1: "Mainly clear",
  2: "Partly cloudy",
  3: "Overcast",
  45: "Foggy",
  48: "Foggy",
  51: "Light drizzle",
  53: "Drizzle",
  55: "Drizzle",
  61: "Light rain",
  63: "Rain",
  65: "Heavy rain",
  71: "Light snow",
  73: "Snow",
  75: "Heavy snow",
  80: "Light showers",
  81: "Showers",
  82: "Violent showers",
  95: "Thunderstorm",
  96: "Thunderstorm",
  99: "Thunderstorm",
};

// ---- Stored state ----

interface GoalTemplate {
  id: number;
  title: string;
  target: number;
  unit: string;
  created_at: string;
}

interface GoalProgressRow {
  id: number;
  templateId: number;
  date: string;
  current: number;
}

interface StoredNote {
  id: number;
  title: string;
  content: string;
  color: string;
  pinned: boolean;
  created_at: string;
  updated_at: string;
}

interface StoredBookmark {
  id: number;
  title: string;
  url: string;
  category: string;
  created_at: string;
}

interface StoredHabit {
  id: number;
  name: string;
  created_at: string;
}

interface HabitLog {
  id: number;
  habitId: number;
  date: string;
}

interface FocusSession {
  id: number;
  minutes: number;
  label: string;
  completedAt: string;
}

interface StoredState {
  nextId: number;
  todos: Todo[];
  goalTemplates: GoalTemplate[];
  goalProgress: GoalProgressRow[];
  notes: StoredNote[];
  bookmarks: StoredBookmark[];
  habits: StoredHabit[];
  habitLogs: HabitLog[];
  focusSessions: FocusSession[];
  settings: { city: string; lat: number; lon: number };
  weatherCache: { data: Weather; fetchedAt: string } | null;
}

function defaultState(): StoredState {
  return {
    nextId: 1,
    todos: [],
    goalTemplates: [],
    goalProgress: [],
    notes: [],
    bookmarks: [],
    habits: [],
    habitLogs: [],
    focusSessions: [],
    settings: { city: "Delhi", lat: 28.65195, lon: 77.23149 },
    weatherCache: null,
  };
}

function loadState(): StoredState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return defaultState();
    const parsed = JSON.parse(raw) as Partial<StoredState>;
    const base = defaultState();
    return {
      ...base,
      ...parsed,
      settings: { ...base.settings, ...(parsed.settings ?? {}) },
      todos: parsed.todos ?? [],
      goalTemplates: parsed.goalTemplates ?? [],
      goalProgress: parsed.goalProgress ?? [],
      notes: parsed.notes ?? [],
      bookmarks: parsed.bookmarks ?? [],
      habits: parsed.habits ?? [],
      habitLogs: parsed.habitLogs ?? [],
      focusSessions: parsed.focusSessions ?? [],
      nextId: parsed.nextId ?? 1,
      weatherCache: parsed.weatherCache ?? null,
    };
  } catch {
    return defaultState();
  }
}

function saveState(state: StoredState): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    // Storage full / unavailable (private mode): keep working in-memory
    // for this session; the dashboard still renders.
  }
}

function nextId(state: StoredState): number {
  const id = state.nextId;
  state.nextId = id + 1;
  return id;
}

function ensureTodayGoals(state: StoredState): void {
  const today = todayKolkata();
  const have = new Set(
    state.goalProgress.filter((p) => p.date === today).map((p) => p.templateId),
  );
  for (const t of state.goalTemplates) {
    if (!have.has(t.id)) {
      state.goalProgress.push({
        id: nextId(state),
        templateId: t.id,
        date: today,
        current: 0,
      });
    }
  }
}

// ---- Weather (Open-Meteo, no API key, fetched from the browser) ----

interface ForecastResponse {
  current: {
    temperature_2m: number;
    weather_code: number;
    wind_speed_10m: number;
    relative_humidity_2m: number;
  };
  daily: {
    time: string[];
    temperature_2m_max: number[];
    temperature_2m_min: number[];
    weather_code: number[];
  };
}

async function fetchWeather(state: StoredState): Promise<Weather> {
  const { city, lat, lon } = state.settings;
  const url =
    `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}` +
    `&current=temperature_2m,weather_code,wind_speed_10m,relative_humidity_2m` +
    `&daily=temperature_2m_max,temperature_2m_min,weather_code` +
    `&timezone=Asia%2FKolkata&forecast_days=4`;
  const res = await fetch(url);
  if (!res.ok) throw new Error("Weather fetch failed");
  const j = (await res.json()) as ForecastResponse;
  const weather: Weather = {
    city,
    temp: Math.round(j.current.temperature_2m),
    code: j.current.weather_code,
    label: WMO[j.current.weather_code] ?? "—",
    humidity: j.current.relative_humidity_2m,
    wind: Math.round(j.current.wind_speed_10m),
    daily: j.daily.time.map((d, i) => ({
      date: d,
      max: Math.round(j.daily.temperature_2m_max[i] ?? 0),
      min: Math.round(j.daily.temperature_2m_min[i] ?? 0),
      label: WMO[j.daily.weather_code[i] ?? -1] ?? "—",
      code: j.daily.weather_code[i] ?? 0,
    })),
    fetchedAt: new Date().toISOString(),
  };
  state.weatherCache = { data: weather, fetchedAt: weather.fetchedAt };
  saveState(state);
  return weather;
}

async function getWeather(state: StoredState, force = false): Promise<Weather | null> {
  const cache = state.weatherCache;
  if (!force && cache) {
    const age = Date.now() - new Date(cache.fetchedAt).getTime();
    if (age < WEATHER_CACHE_MS) return cache.data;
  }
  try {
    return await fetchWeather(state);
  } catch {
    // Offline / fetch failed: fall back to stale cache, else null
    // (the UI shows "Weather unavailable — tap refresh").
    return cache ? cache.data : null;
  }
}

// ---- Public API: same method names/signatures the App uses ----

export const api = {
  async getDashboard(_args?: unknown): Promise<Dashboard> {
    void _args;
    const state = loadState();
    const today = todayKolkata();
    ensureTodayGoals(state);
    saveState(state);

    const todos = [...state.todos].sort((a, b) => b.id - a.id);
    const progMap = new Map(
      state.goalProgress
        .filter((p) => p.date === today)
        .map((p) => [p.templateId, p]),
    );
    const goals: Goal[] = state.goalTemplates.map((t) => {
      const p = progMap.get(t.id);
      return {
        id: p?.id ?? 0,
        templateId: t.id,
        title: t.title,
        target: t.target,
        unit: t.unit,
        current: p?.current ?? 0,
      };
    });
    const notes: Note[] = [...state.notes]
      .sort(
        (a, b) =>
          Number(b.pinned) - Number(a.pinned) ||
          new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime(),
      )
      .map((n) => ({
        id: n.id,
        title: n.title,
        content: n.content,
        color: n.color,
        pinned: n.pinned,
        updated_at: n.updated_at,
      }));
    const bookmarks: Bookmark[] = [...state.bookmarks]
      .sort((a, b) => a.category.localeCompare(b.category) || b.id - a.id)
      .map((b) => ({ id: b.id, title: b.title, url: b.url, category: b.category }));

    const habits: Habit[] = state.habits.map((h) => {
      const dates = new Set(
        state.habitLogs.filter((l) => l.habitId === h.id).map((l) => l.date),
      );
      const doneToday = dates.has(today);
      let streak = 0;
      let cursor = doneToday ? today : dateOffset(today, -1);
      while (dates.has(cursor)) {
        streak++;
        cursor = dateOffset(cursor, -1);
      }
      return { id: h.id, name: h.name, doneToday, streak };
    });

    const todayStart = new Date(`${today}T00:00:00+05:30`).getTime();
    const todaySessions = state.focusSessions.filter(
      (s) => new Date(s.completedAt).getTime() >= todayStart,
    );
    const focusTodayMinutes = todaySessions.reduce((a, s) => a + s.minutes, 0);
    const focusTotalMinutes = state.focusSessions.reduce((a, s) => a + s.minutes, 0);

    const weather = await getWeather(state);

    return {
      today,
      todos,
      goals,
      notes,
      bookmarks,
      habits,
      focusTodayMinutes,
      focusSessionsToday: todaySessions.length,
      focusTotalMinutes,
      weather,
    };
  },

  async addTodo(args: { title: string; priority: TodoPriority }): Promise<{ id: number }> {
    const state = loadState();
    const id = nextId(state);
    state.todos.push({
      id,
      title: args.title,
      notes: "",
      priority: args.priority ?? "medium",
      completed: false,
      created_at: new Date().toISOString(),
    });
    saveState(state);
    return { id };
  },

  async toggleTodo(args: { id: number; completed: boolean }): Promise<{ ok: true }> {
    const state = loadState();
    const t = state.todos.find((x) => x.id === args.id);
    if (t) t.completed = args.completed;
    saveState(state);
    return { ok: true };
  },

  async deleteTodo(args: { id: number }): Promise<{ ok: true }> {
    const state = loadState();
    state.todos = state.todos.filter((x) => x.id !== args.id);
    saveState(state);
    return { ok: true };
  },

  async addGoal(args: { title: string; target: number; unit: string }): Promise<{ id: number }> {
    const state = loadState();
    const id = nextId(state);
    state.goalTemplates.push({
      id,
      title: args.title,
      target: args.target,
      unit: args.unit ?? "",
      created_at: new Date().toISOString(),
    });
    state.goalProgress.push({
      id: nextId(state),
      templateId: id,
      date: todayKolkata(),
      current: 0,
    });
    saveState(state);
    return { id };
  },

  async setGoalProgress(args: { templateId: number; current: number }): Promise<{ ok: true }> {
    const state = loadState();
    const today = todayKolkata();
    ensureTodayGoals(state);
    const row = state.goalProgress.find(
      (p) => p.templateId === args.templateId && p.date === today,
    );
    if (row) row.current = args.current;
    saveState(state);
    return { ok: true };
  },

  async deleteGoal(args: { templateId: number }): Promise<{ ok: true }> {
    const state = loadState();
    state.goalProgress = state.goalProgress.filter((p) => p.templateId !== args.templateId);
    state.goalTemplates = state.goalTemplates.filter((t) => t.id !== args.templateId);
    saveState(state);
    return { ok: true };
  },

  async addNote(args: { title: string; content: string; color: string }): Promise<{ id: number }> {
    const state = loadState();
    const id = nextId(state);
    const now = new Date().toISOString();
    state.notes.push({
      id,
      title: args.title ?? "",
      content: args.content ?? "",
      color: args.color ?? "amber",
      pinned: false,
      created_at: now,
      updated_at: now,
    });
    saveState(state);
    return { id };
  },

  async updateNote(args: {
    id: number;
    title?: string;
    content?: string;
    color?: string;
    pinned?: boolean;
  }): Promise<{ ok: true }> {
    const state = loadState();
    const n = state.notes.find((x) => x.id === args.id);
    if (n) {
      if (args.title !== undefined) n.title = args.title;
      if (args.content !== undefined) n.content = args.content;
      if (args.color !== undefined) n.color = args.color;
      if (args.pinned !== undefined) n.pinned = args.pinned;
      n.updated_at = new Date().toISOString();
    }
    saveState(state);
    return { ok: true };
  },

  async deleteNote(args: { id: number }): Promise<{ ok: true }> {
    const state = loadState();
    state.notes = state.notes.filter((x) => x.id !== args.id);
    saveState(state);
    return { ok: true };
  },

  async addBookmark(args: {
    title: string;
    url: string;
    category: string;
  }): Promise<{ id: number }> {
    const state = loadState();
    let url = args.url.trim();
    if (!/^https?:\/\//i.test(url)) url = "https://" + url;
    const id = nextId(state);
    state.bookmarks.push({
      id,
      title: args.title,
      url,
      category: args.category || "General",
      created_at: new Date().toISOString(),
    });
    saveState(state);
    return { id };
  },

  async deleteBookmark(args: { id: number }): Promise<{ ok: true }> {
    const state = loadState();
    state.bookmarks = state.bookmarks.filter((x) => x.id !== args.id);
    saveState(state);
    return { ok: true };
  },

  async addHabit(args: { name: string }): Promise<{ id: number }> {
    const state = loadState();
    const id = nextId(state);
    state.habits.push({ id, name: args.name, created_at: new Date().toISOString() });
    saveState(state);
    return { id };
  },

  async toggleHabit(args: { habitId: number; done: boolean }): Promise<{ ok: true }> {
    const state = loadState();
    const today = todayKolkata();
    if (args.done) {
      const exists = state.habitLogs.some(
        (l) => l.habitId === args.habitId && l.date === today,
      );
      if (!exists) {
        state.habitLogs.push({ id: nextId(state), habitId: args.habitId, date: today });
      }
    } else {
      state.habitLogs = state.habitLogs.filter(
        (l) => !(l.habitId === args.habitId && l.date === today),
      );
    }
    saveState(state);
    return { ok: true };
  },

  async deleteHabit(args: { id: number }): Promise<{ ok: true }> {
    const state = loadState();
    state.habitLogs = state.habitLogs.filter((l) => l.habitId !== args.id);
    state.habits = state.habits.filter((h) => h.id !== args.id);
    saveState(state);
    return { ok: true };
  },

  async logFocus(args: { minutes: number; label: string }): Promise<{ id: number }> {
    const state = loadState();
    const id = nextId(state);
    state.focusSessions.push({
      id,
      minutes: args.minutes,
      label: args.label ?? "",
      completedAt: new Date().toISOString(),
    });
    saveState(state);
    return { id };
  },

  async refreshWeather(_args?: unknown): Promise<{ weather: Weather | null }> {
    void _args;
    const state = loadState();
    const weather = await getWeather(state, true);
    return { weather };
  },

  async setLocation(args: { city: string }): Promise<{ ok: true; city: string }> {
    const res = await fetch(
      `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(args.city)}&count=1&language=en&format=json`,
    );
    if (!res.ok) throw new Error("Geocoding failed");
    const j = (await res.json()) as {
      results?: { name: string; latitude: number; longitude: number }[];
    };
    const first = j.results?.[0];
    if (!first) throw new Error("City not found");
    const state = loadState();
    state.settings = { city: first.name, lat: first.latitude, lon: first.longitude };
    saveState(state);
    await getWeather(state, true);
    return { ok: true, city: first.name };
  },

  async dailyReset(_args?: unknown): Promise<{ ok: true; today: string }> {
    void _args;
    const state = loadState();
    ensureTodayGoals(state);
    saveState(state);
    try {
      await fetchWeather(state);
    } catch {
      // Weather refresh is best-effort; goals were still reset.
    }
    return { ok: true, today: todayKolkata() };
  },
};
