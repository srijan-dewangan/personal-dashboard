import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { SafeAreaTopScrim } from "@hatch/space-sdk/client";
import { api } from "./api";

type Dash = Awaited<ReturnType<typeof api.getDashboard>>;

function greeting() {
  const h = new Date().getHours();
  if (h < 5) return "Still up";
  if (h < 12) return "Good morning";
  if (h < 17) return "Good afternoon";
  return "Good evening";
}
function fmtDate(iso: string) {
  const d = new Date(`${iso}T12:00:00`);
  return d.toLocaleDateString("en-IN", { weekday: "long", day: "numeric", month: "long" });
}
function hostOf(url: string) { try { return new URL(url).hostname.replace(/^www\./, ""); } catch { return url; } }

const NOTE_COLORS: Record<string, string> = {
  amber: "#fef3c7", green: "#dcfce7", blue: "#dbeafe", pink: "#fce7f3", lavender: "#ede9fe",
};
const NOTE_COLORS_DARK: Record<string, string> = {
  amber: "#3a2f14", green: "#17351f", blue: "#1c2b45", pink: "#3d1f2e", lavender: "#2e2445",
};

export function App() {
  const qc = useQueryClient();
  const dash = useQuery({ queryKey: ["dashboard"], queryFn: () => api.getDashboard({}) });
  const invalidate = () => qc.invalidateQueries({ queryKey: ["dashboard"] });

  if (dash.isPending) return <div className="min-h-screen bg-[var(--bg)] px-5 py-16 text-center text-[var(--dim)]">Loading your day…</div>;
  if (dash.error || !dash.data) return <div className="min-h-screen bg-[var(--bg)] px-5 py-16 text-center"><p className="text-[var(--text)]">Couldn't load your dashboard.</p><button onClick={() => dash.refetch()} className="mt-3 rounded-full bg-[var(--accent)] px-4 py-2 text-sm text-white">Retry</button></div>;
  const d = dash.data;

  return (
    <div className="min-h-screen bg-[var(--bg)] text-[var(--text)]">
      <SafeAreaTopScrim backgroundColor="var(--bg)" />
      <main className="mx-auto max-w-6xl px-4 pb-10 sm:px-6">
        <Header d={d} onMutate={invalidate} />
        <div className="mt-5 grid grid-cols-1 gap-4 lg:grid-cols-12">
          <section className="lg:col-span-5"><FocusTimer d={d} onLogged={invalidate} /></section>
          <section className="lg:col-span-7"><Todos d={d} onMutate={invalidate} /></section>
          <section className="lg:col-span-7"><Goals d={d} onMutate={invalidate} /></section>
          <section className="lg:col-span-5"><Habits d={d} onMutate={invalidate} /></section>
          <section className="lg:col-span-7"><Notes d={d} onMutate={invalidate} /></section>
          <section className="lg:col-span-5"><Bookmarks d={d} onMutate={invalidate} /></section>
        </div>
        <p className="mt-8 text-center text-xs text-[var(--dim)]">Weather from Open-Meteo · Goals reset every morning · {d.today}</p>
      </main>
    </div>
  );
}

function Card({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return <div className={`rounded-[var(--radius)] border border-[var(--border)] bg-[var(--surface)] p-4 sm:p-5 shadow-[0_1px_0_rgba(0,0,0,0.03)] ${className}`}>{children}</div>;
}
function SectionTitle({ title, sub, right }: { title: string; sub?: string; right?: React.ReactNode }) {
  return <div className="mb-3 flex items-start justify-between gap-3"><div><h2 className="font-serif-d text-[22px] leading-6">{title}</h2>{sub ? <p className="mt-0.5 text-xs text-[var(--dim)]">{sub}</p> : null}</div>{right}</div>;
}

function Header({ d, onMutate }: { d: Dash; onMutate: () => void }) {
  const [editingCity, setEditingCity] = useState(false);
  const [city, setCity] = useState("");
  const setLoc = useMutation({ mutationFn: (c: string) => api.setLocation({ city: c }), onSuccess: () => { setEditingCity(false); onMutate(); } });
  const refreshW = useMutation({ mutationFn: () => api.refreshWeather({}), onSuccess: onMutate });
  const doneTodos = d.todos.filter(t => t.completed).length;
  const goalPct = d.goals.length ? Math.round(d.goals.reduce((a, g) => a + Math.min(1, g.current / Math.max(1, g.target)), 0) / d.goals.length * 100) : 0;
  const w = d.weather;
  return (
    <header className="pt-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-sm font-medium text-[var(--accent2)]">{fmtDate(d.today)}</p>
          <h1 className="font-serif-d text-4xl sm:text-5xl leading-tight">{greeting()}, Srijan</h1>
          <p className="mt-1 text-sm text-[var(--dim)]">{doneTodos} of {d.todos.length} tasks done · {d.focusTodayMinutes} min focused today</p>
        </div>
        <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] px-4 py-3 min-w-[210px]">
          {w ? <>
            <div className="flex items-center justify-between gap-3">
              <div><p className="text-2xl font-semibold">{w.temp}°C <span className="text-sm font-normal text-[var(--dim)]">{w.label}</span></p>
              <p className="text-xs text-[var(--dim)]">{w.city} · Humidity {w.humidity}% · Wind {w.wind} km/h</p></div>
              <button aria-label="Refresh weather" onClick={() => refreshW.mutate()} className="rounded-full border border-[var(--border)] px-2.5 py-1 text-xs">↻</button>
            </div>
            <div className="mt-2 flex gap-2">{w.daily.slice(0, 3).map(day => <span key={day.date} className="rounded-full bg-[var(--surface2)] px-2 py-1 text-[11px]">{new Date(`${day.date}T12:00:00`).toLocaleDateString("en-IN", { weekday: "short" })} {day.min}–{day.max}°</span>)}</div>
          </> : <p className="text-sm text-[var(--dim)]">Weather unavailable — tap refresh</p>}
          {editingCity ? <form className="mt-2 flex gap-2" onSubmit={e => { e.preventDefault(); if (city.trim()) setLoc.mutate(city.trim()); }}><input aria-label="Weather city" value={city} onChange={e => setCity(e.target.value)} placeholder="City name" className="w-full rounded-lg border border-[var(--border)] bg-[var(--bg)] px-2 py-1.5 text-sm" /><button className="rounded-lg bg-[var(--accent)] px-3 py-1.5 text-sm text-white">Set</button></form>
          : <button onClick={() => { setCity(w?.city ?? ""); setEditingCity(true); }} className="mt-2 text-xs font-medium text-[var(--accent)] underline underline-offset-2">Change city</button>}
          {setLoc.isError ? <p className="mt-1 text-xs text-[var(--danger)]">City not found — try another name.</p> : null}
        </div>
      </div>
      <div className="mt-4 grid grid-cols-3 gap-3">
        <div className="rounded-2xl bg-[var(--accent)] px-4 py-3 text-white"><p className="text-2xl font-bold">{d.todos.length ? Math.round(doneTodos / d.todos.length * 100) : 0}%</p><p className="text-xs opacity-90">Tasks complete</p></div>
        <div className="rounded-2xl bg-[#7c2d12] px-4 py-3 text-white"><p className="text-2xl font-bold">{goalPct}%</p><p className="text-xs opacity-90">Daily goals</p></div>
        <div className="rounded-2xl bg-[#1e3a5f] px-4 py-3 text-white"><p className="text-2xl font-bold">{d.focusTodayMinutes}m</p><p className="text-xs opacity-90">Focus today · {d.focusTotalMinutes}m all time</p></div>
      </div>
    </header>
  );
}

function FocusTimer({ d, onLogged }: { d: Dash; onLogged: () => void }) {
  const presets = [15, 25, 50];
  const [mins, setMins] = useState(25);
  const [total, setTotal] = useState(25 * 60);
  const [left, setLeft] = useState(25 * 60);
  const [running, setRunning] = useState(false);
  const [label, setLabel] = useState("");
  const [finished, setFinished] = useState(false);
  const log = useMutation({ mutationFn: () => api.logFocus({ minutes: mins, label }), onSuccess: onLogged });
  const tickRef = useRef<number | null>(null);
  useEffect(() => {
    if (!running) return;
    tickRef.current = window.setInterval(() => setLeft(s => Math.max(0, s - 1)), 1000);
    return () => { if (tickRef.current) window.clearInterval(tickRef.current); };
  }, [running]);
  useEffect(() => { if (left === 0 && running) { setRunning(false); setFinished(true); log.mutate(); } }, [left, running]);
  const pick = (m: number) => { setMins(m); setTotal(m * 60); setLeft(m * 60); setRunning(false); setFinished(false); };
  const mm = String(Math.floor(left / 60)).padStart(2, "0"); const ss = String(left % 60).padStart(2, "0");
  const pct = total ? 1 - left / total : 0;
  const R = 84, C = 2 * Math.PI * R;
  return (
    <Card className="h-full">
      <SectionTitle title="Focus timer" sub="Pick a length, press start — finished sessions are saved automatically." />
      <div className="flex flex-col items-center">
        <div className="relative h-[200px] w-[200px]">
          <svg viewBox="0 0 200 200" className="h-full w-full -rotate-90"><circle cx="100" cy="100" r={R} fill="none" stroke="var(--border)" strokeWidth="10" /><circle cx="100" cy="100" r={R} fill="none" stroke="var(--accent)" strokeWidth="10" strokeLinecap="round" strokeDasharray={C} strokeDashoffset={C * (1 - pct)} /></svg>
          <div className="absolute inset-0 flex flex-col items-center justify-center"><span className="font-serif-d text-5xl tabular-nums">{mm}:{ss}</span><span className="text-xs text-[var(--dim)]">{running ? "Focusing…" : finished ? "Done — nice work" : "Ready"}</span></div>
        </div>
        <div className="mt-3 flex flex-wrap justify-center gap-2">
          {presets.map(p => <button key={p} onClick={() => pick(p)} className={`rounded-full px-3.5 py-1.5 text-sm font-medium ${mins === p ? "bg-[var(--accent)] text-white" : "border border-[var(--border)]"}`}>{p} min</button>)}
          <label className="flex items-center gap-1 rounded-full border border-[var(--border)] px-3 py-1.5 text-sm"><input aria-label="Custom focus minutes" type="number" min={1} max={180} defaultValue={25} className="w-12 bg-transparent text-center outline-none" onChange={e => { const v = Math.max(1, Math.min(180, Number(e.target.value) || 25)); pick(v); }} /> min</label>
        </div>
        <input aria-label="Focus session label" value={label} onChange={e => setLabel(e.target.value)} placeholder="What are you focusing on? (optional)" className="mt-3 w-full rounded-xl border border-[var(--border)] bg-[var(--bg)] px-3 py-2 text-sm" />
        <div className="mt-3 flex gap-2">
          <button onClick={() => { setFinished(false); setRunning(r => !r); }} className="rounded-full bg-[var(--accent)] px-6 py-2.5 text-sm font-semibold text-white">{running ? "Pause" : left < total && left > 0 ? "Resume" : "Start focus"}</button>
          <button onClick={() => pick(mins)} className="rounded-full border border-[var(--border)] px-5 py-2.5 text-sm font-medium">Reset</button>
        </div>
        <p className="mt-3 text-xs text-[var(--dim)]">Today: {d.focusTodayMinutes} min across {d.focusSessionsToday} session{d.focusSessionsToday === 1 ? "" : "s"}</p>
      </div>
    </Card>
  );
}

function Todos({ d, onMutate }: { d: Dash; onMutate: () => void }) {
  const [text, setText] = useState(""); const [prio, setPrio] = useState<"low" | "medium" | "high">("medium"); const [filter, setFilter] = useState<"all" | "active" | "done">("all");
  const add = useMutation({ mutationFn: () => api.addTodo({ title: text.trim(), priority: prio }), onSuccess: () => { setText(""); onMutate(); } });
  const toggle = useMutation({ mutationFn: (v: { id: number; completed: boolean }) => api.toggleTodo(v), onSuccess: onMutate });
  const del = useMutation({ mutationFn: (id: number) => api.deleteTodo({ id }), onSuccess: onMutate });
  const list = useMemo(() => {
    const order = { high: 0, medium: 1, low: 2 } as Record<string, number>;
    let arr = [...d.todos].sort((a, b) => Number(a.completed) - Number(b.completed) || (order[a.priority] ?? 1) - (order[b.priority] ?? 1) || b.id - a.id);
    if (filter === "active") arr = arr.filter(t => !t.completed); if (filter === "done") arr = arr.filter(t => t.completed);
    return arr;
  }, [d.todos, filter]);
  const badge = (p: string) => p === "high" ? "bg-red-100 text-red-800" : p === "low" ? "bg-emerald-100 text-emerald-800" : "bg-amber-100 text-amber-800";
  return (
    <Card className="h-full">
      <SectionTitle title="To-do list" sub={`${d.todos.filter(t => !t.completed).length} open`} right={<div className="flex gap-1">{(["all", "active", "done"] as const).map(f => <button key={f} onClick={() => setFilter(f)} className={`rounded-full px-2.5 py-1 text-xs font-medium capitalize ${filter === f ? "bg-[var(--text)] text-[var(--bg)]" : "border border-[var(--border)]"}`}>{f}</button>)}</div>} />
      <form className="flex gap-2" onSubmit={e => { e.preventDefault(); if (text.trim()) add.mutate(); }}>
        <input aria-label="New task" value={text} onChange={e => setText(e.target.value)} placeholder="Add a task…" className="min-w-0 flex-1 rounded-xl border border-[var(--border)] bg-[var(--bg)] px-3 py-2.5 text-sm" />
        <select aria-label="Task priority" value={prio} onChange={e => setPrio(e.target.value as typeof prio)} className="rounded-xl border border-[var(--border)] bg-[var(--bg)] px-2 py-2.5 text-sm"><option value="high">High</option><option value="medium">Med</option><option value="low">Low</option></select>
        <button className="rounded-xl bg-[var(--accent)] px-4 py-2.5 text-sm font-semibold text-white">Add</button>
      </form>
      <ul className="mt-3 divide-y divide-[var(--border)]">
        {list.length === 0 ? <li className="py-6 text-center text-sm text-[var(--dim)]">{filter === "done" ? "Nothing completed yet." : "All clear. Add your first task above."}</li> : list.map(t => (
          <li key={t.id} className="flex items-center gap-3 py-2.5">
            <input aria-label={`Mark ${t.title} complete`} type="checkbox" checked={t.completed} onChange={e => toggle.mutate({ id: t.id, completed: e.target.checked })} className="h-5 w-5 shrink-0 accent-[#14532d]" />
            <span className={`min-w-0 flex-1 text-sm ${t.completed ? "text-[var(--dim)] line-through" : ""}`}>{t.title}</span>
            <span className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-semibold capitalize ${badge(t.priority)}`}>{t.priority}</span>
            <button aria-label={`Delete ${t.title}`} onClick={() => del.mutate(t.id)} className="shrink-0 text-[var(--dim)] hover:text-[var(--danger)]">✕</button>
          </li>))}
      </ul>
    </Card>
  );
}

function Goals({ d, onMutate }: { d: Dash; onMutate: () => void }) {
  const [title, setTitle] = useState(""); const [target, setTarget] = useState("1"); const [unit, setUnit] = useState("");
  const add = useMutation({ mutationFn: () => api.addGoal({ title: title.trim(), target: Math.max(1, Number(target) || 1), unit: unit.trim() }), onSuccess: () => { setTitle(""); setUnit(""); setTarget("1"); onMutate(); } });
  const setProg = useMutation({ mutationFn: (v: { templateId: number; current: number }) => api.setGoalProgress(v), onSuccess: onMutate });
  const del = useMutation({ mutationFn: (id: number) => api.deleteGoal({ templateId: id }), onSuccess: onMutate });
  return (
    <Card className="h-full">
      <SectionTitle title="Daily goals" sub="Progress resets each morning — targets stay." />
      <div className="space-y-3">
        {d.goals.length === 0 ? <p className="py-2 text-sm text-[var(--dim)]">No goals yet. Try “Read — 20 pages” or “Water — 8 glasses”.</p> : d.goals.map(g => {
          const pct = Math.min(100, Math.round(g.current / Math.max(1, g.target) * 100)); const done = g.current >= g.target;
          return <div key={g.templateId} className="rounded-xl border border-[var(--border)] p-3">
            <div className="flex items-center justify-between gap-2"><p className="text-sm font-medium">{done ? "✓ " : ""}{g.title}</p><div className="flex items-center gap-1.5">
              <button aria-label={`Decrease ${g.title}`} onClick={() => setProg.mutate({ templateId: g.templateId, current: Math.max(0, g.current - 1) })} className="h-8 w-8 rounded-full border border-[var(--border)] text-base">−</button>
              <span className="min-w-[64px] text-center text-sm font-semibold tabular-nums">{g.current} / {g.target}{g.unit ? ` ${g.unit}` : ""}</span>
              <button aria-label={`Increase ${g.title}`} onClick={() => setProg.mutate({ templateId: g.templateId, current: g.current + 1 })} className="h-8 w-8 rounded-full bg-[var(--accent)] text-base text-white">+</button>
              <button aria-label={`Delete goal ${g.title}`} onClick={() => del.mutate(g.templateId)} className="ml-1 text-[var(--dim)]">✕</button></div></div>
            <div className="mt-2 h-2 overflow-hidden rounded-full bg-[var(--surface2)]"><div className={`h-full rounded-full ${done ? "bg-[var(--accent2)]" : "bg-[var(--accent)]"}`} style={{ width: `${pct}%` }} /></div>
          </div>;
        })}
      </div>
      <form className="mt-3 flex flex-wrap gap-2" onSubmit={e => { e.preventDefault(); if (title.trim()) add.mutate(); }}>
        <input aria-label="New goal name" value={title} onChange={e => setTitle(e.target.value)} placeholder="Goal — e.g. Read" className="min-w-[120px] flex-1 rounded-xl border border-[var(--border)] bg-[var(--bg)] px-3 py-2 text-sm" />
        <input aria-label="Goal target" type="number" min={1} value={target} onChange={e => setTarget(e.target.value)} className="w-16 rounded-xl border border-[var(--border)] bg-[var(--bg)] px-2 py-2 text-sm" />
        <input aria-label="Goal unit" value={unit} onChange={e => setUnit(e.target.value)} placeholder="unit" className="w-20 rounded-xl border border-[var(--border)] bg-[var(--bg)] px-2 py-2 text-sm" />
        <button className="rounded-xl bg-[var(--text)] px-4 py-2 text-sm font-semibold text-[var(--bg)]">Add goal</button>
      </form>
    </Card>
  );
}

function Habits({ d, onMutate }: { d: Dash; onMutate: () => void }) {
  const [name, setName] = useState("");
  const add = useMutation({ mutationFn: () => api.addHabit({ name: name.trim() }), onSuccess: () => { setName(""); onMutate(); } });
  const toggle = useMutation({ mutationFn: (v: { habitId: number; done: boolean }) => api.toggleHabit(v), onSuccess: onMutate });
  const del = useMutation({ mutationFn: (id: number) => api.deleteHabit({ id }), onSuccess: onMutate });
  return (
    <Card className="h-full">
      <SectionTitle title="Habits & streaks" sub="Tap to check in for today." />
      <div className="flex flex-wrap gap-2">
        {d.habits.length === 0 ? <p className="text-sm text-[var(--dim)]">Add a habit like Meditate, Walk, or No sugar.</p> : d.habits.map(h => (
          <div key={h.id} className={`group flex items-center gap-2 rounded-full border px-3 py-2 ${h.doneToday ? "border-[var(--accent)] bg-[var(--accent)] text-white" : "border-[var(--border)] bg-[var(--bg)]"}`}>
            <button onClick={() => toggle.mutate({ habitId: h.id, done: !h.doneToday })} className="text-sm font-medium">{h.doneToday ? "✓ " : ""}{h.name}{h.streak > 0 ? <span className="ml-1.5 text-xs opacity-80">🔥 {h.streak}d</span> : null}</button>
            <button aria-label={`Delete habit ${h.name}`} onClick={() => del.mutate(h.id)} className="text-xs opacity-60">✕</button>
          </div>))}
      </div>
      <form className="mt-3 flex gap-2" onSubmit={e => { e.preventDefault(); if (name.trim()) add.mutate(); }}>
        <input aria-label="New habit" value={name} onChange={e => setName(e.target.value)} placeholder="New habit…" className="min-w-0 flex-1 rounded-xl border border-[var(--border)] bg-[var(--bg)] px-3 py-2 text-sm" />
        <button className="rounded-xl border border-[var(--border)] px-4 py-2 text-sm font-medium">Add</button>
      </form>
    </Card>
  );
}

function Notes({ d, onMutate }: { d: Dash; onMutate: () => void }) {
  const [title, setTitle] = useState(""); const [content, setContent] = useState(""); const [color, setColor] = useState("amber"); const [query, setQuery] = useState(""); const [editing, setEditing] = useState<number | null>(null); const [eTitle, setETitle] = useState(""); const [eContent, setEContent] = useState("");
  const add = useMutation({ mutationFn: () => api.addNote({ title: title.trim(), content: content.trim(), color }), onSuccess: () => { setTitle(""); setContent(""); onMutate(); } });
  const upd = useMutation({ mutationFn: (v: { id: number; title?: string; content?: string; pinned?: boolean }) => api.updateNote(v), onSuccess: () => { setEditing(null); onMutate(); } });
  const del = useMutation({ mutationFn: (id: number) => api.deleteNote({ id }), onSuccess: onMutate });
  const dark = typeof window !== "undefined" && window.matchMedia?.("(prefers-color-scheme: dark)").matches;
  const palette = dark ? NOTE_COLORS_DARK : NOTE_COLORS;
  const list = d.notes.filter(n => !query || (n.title + n.content).toLowerCase().includes(query.toLowerCase()));
  return (
    <Card className="h-full">
      <SectionTitle title="Quick notes" sub="Jot it down before you forget it." right={<input aria-label="Search notes" value={query} onChange={e => setQuery(e.target.value)} placeholder="Search…" className="w-28 rounded-full border border-[var(--border)] bg-[var(--bg)] px-3 py-1.5 text-xs" />} />
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {list.map(n => (
          <div key={n.id} className="rounded-xl p-3" style={{ background: palette[n.color] ?? palette.amber }}>
            {editing === n.id ? <div>
              <input aria-label="Edit note title" value={eTitle} onChange={e => setETitle(e.target.value)} className="w-full rounded-lg bg-white/70 px-2 py-1.5 text-sm font-medium text-[#1c2333]" />
              <textarea aria-label="Edit note content" value={eContent} onChange={e => setEContent(e.target.value)} rows={3} className="mt-2 w-full rounded-lg bg-white/70 px-2 py-1.5 text-sm text-[#1c2333]" />
              <div className="mt-2 flex gap-2"><button onClick={() => upd.mutate({ id: n.id, title: eTitle, content: eContent })} className="rounded-full bg-[#1c2333] px-3 py-1 text-xs font-semibold text-white">Save</button><button onClick={() => setEditing(null)} className="rounded-full border border-black/20 px-3 py-1 text-xs text-[#1c2333]">Cancel</button></div>
            </div> : <>
              <div className="flex items-start justify-between gap-2"><p className="text-sm font-semibold text-[#1c2333]">{n.pinned ? "📌 " : ""}{n.title || "Untitled"}</p>
                <div className="flex shrink-0 gap-1.5 text-xs text-[#1c2333]/70">
                  <button aria-label={`${n.pinned ? "Unpin" : "Pin"} note ${n.title}`} onClick={() => upd.mutate({ id: n.id, pinned: !n.pinned })}>{n.pinned ? "Unpin" : "Pin"}</button>
                  <button aria-label={`Edit note ${n.title}`} onClick={() => { setEditing(n.id); setETitle(n.title); setEContent(n.content); }}>Edit</button>
                  <button aria-label={`Delete note ${n.title}`} onClick={() => del.mutate(n.id)}>✕</button>
                </div></div>
              <p className="mt-1 whitespace-pre-wrap text-sm text-[#1c2333]/85">{n.content}</p>
            </>}
          </div>))}
        {list.length === 0 ? <p className="text-sm text-[var(--dim)] sm:col-span-2">No notes yet — write your first one below.</p> : null}
      </div>
      <form className="mt-3 rounded-xl border border-[var(--border)] bg-[var(--bg)] p-3" onSubmit={e => { e.preventDefault(); if (title.trim() || content.trim()) add.mutate(); }}>
        <input aria-label="New note title" value={title} onChange={e => setTitle(e.target.value)} placeholder="Title" className="w-full bg-transparent text-sm font-medium outline-none" />
        <textarea aria-label="New note content" value={content} onChange={e => setContent(e.target.value)} placeholder="Write something…" rows={2} className="mt-1 w-full bg-transparent text-sm outline-none" />
        <div className="mt-2 flex items-center justify-between"><div className="flex gap-1.5">{Object.keys(NOTE_COLORS).map(c => <button type="button" key={c} aria-label={`Note color ${c}`} onClick={() => setColor(c)} className={`h-6 w-6 rounded-full border ${color === c ? "ring-2 ring-[var(--text)]" : ""}`} style={{ background: NOTE_COLORS[c] }} />)}</div><button className="rounded-full bg-[var(--accent)] px-4 py-1.5 text-sm font-semibold text-white">Save note</button></div>
      </form>
    </Card>
  );
}

function Bookmarks({ d, onMutate }: { d: Dash; onMutate: () => void }) {
  const [title, setTitle] = useState(""); const [url, setUrl] = useState(""); const [cat, setCat] = useState("General");
  const add = useMutation({ mutationFn: () => api.addBookmark({ title: title.trim(), url: url.trim(), category: cat.trim() || "General" }), onSuccess: () => { setTitle(""); setUrl(""); onMutate(); } });
  const del = useMutation({ mutationFn: (id: number) => api.deleteBookmark({ id }), onSuccess: onMutate });
  const cats = useMemo(() => { const m = new Map<string, typeof d.bookmarks>(); for (const b of d.bookmarks) { if (!m.has(b.category)) m.set(b.category, []); m.get(b.category)!.push(b); } return [...m.entries()]; }, [d.bookmarks]);
  return (
    <Card className="h-full">
      <SectionTitle title="Bookmarks" sub="Links worth keeping, grouped your way." />
      {cats.length === 0 ? <p className="text-sm text-[var(--dim)]">No bookmarks yet.</p> : cats.map(([c, items]) => (
        <div key={c} className="mb-3"><p className="mb-1.5 text-[11px] font-bold uppercase tracking-wider text-[var(--dim)]">{c}</p>
          <ul className="space-y-1.5">{items.map(b => <li key={b.id} className="flex items-center gap-2 rounded-xl border border-[var(--border)] bg-[var(--bg)] px-3 py-2">
            <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-[var(--surface2)] text-xs font-bold uppercase">{b.title.slice(0, 1)}</span>
            <a href={b.url} target="_blank" rel="noreferrer" className="min-w-0 flex-1"><span className="block truncate text-sm font-medium">{b.title}</span><span className="block truncate text-xs text-[var(--dim)]">{hostOf(b.url)}</span></a>
            <button aria-label={`Delete bookmark ${b.title}`} onClick={() => del.mutate(b.id)} className="shrink-0 text-[var(--dim)]">✕</button></li>)}</ul></div>))}
      <form className="mt-2 space-y-2" onSubmit={e => { e.preventDefault(); if (title.trim() && url.trim()) add.mutate(); }}>
        <input aria-label="Bookmark title" value={title} onChange={e => setTitle(e.target.value)} placeholder="Title — e.g. Docs" className="w-full rounded-xl border border-[var(--border)] bg-[var(--bg)] px-3 py-2 text-sm" />
        <input aria-label="Bookmark URL" value={url} onChange={e => setUrl(e.target.value)} placeholder="https://…" className="w-full rounded-xl border border-[var(--border)] bg-[var(--bg)] px-3 py-2 text-sm" />
        <div className="flex gap-2"><input aria-label="Bookmark category" value={cat} onChange={e => setCat(e.target.value)} placeholder="Category" className="min-w-0 flex-1 rounded-xl border border-[var(--border)] bg-[var(--bg)] px-3 py-2 text-sm" /><button className="rounded-xl bg-[var(--accent)] px-4 py-2 text-sm font-semibold text-white">Save</button></div>
      </form>
    </Card>
  );
}
