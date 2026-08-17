import { useRef } from "preact/hooks";
import {
  tasks, config, brief, view, captureDue, syncState, paState, paReady,
  domFilter, stFilter, toast, dismissToast,
  addTask, clearCaptureDue, pinTask, showToast, wrapDone, setWrapDone,
} from "../store";
import { activeOpen, doneTodayList, tier, localKey, tomorrowKey } from "../scoring";
import { domainEmoji } from "../helpers";
import { stickerSlots } from "../theme";
import { setView, openModal, jumpToTask } from "../ui";
import { startVoice, listening } from "../voice";
import { generateBrief } from "../pa";
import type { View } from "../types";

const VIEW_META: Record<View, [string, string]> = {
  today: ["Today", "Your ranked plate for the day — capture above, AI sorts the rest."],
  week: ["This week", "Everything active, grouped by day."],
  board: ["Board", "Drag cards between To do, Today, Someday and Done."],
  month: ["Month", "The monthly view — tap a day to see or add its tasks."],
  all: ["All tasks", "Search and filter everything, including completed work."],
  history: ["Done", "What you've shipped, day by day."],
};
const NAV: { v: View; label: string; icon: string }[] = [
  { v: "today", label: "Today", icon: "▦" },
  { v: "week", label: "Week", icon: "◫" },
  { v: "board", label: "Board", icon: "▤" },
  { v: "month", label: "Month", icon: "◇" },
  { v: "all", label: "All tasks", icon: "☷" },
  { v: "history", label: "Done", icon: "✓" },
];
const openSettings = () => openModal({ kind: "settings" });
const focusCapture = () => { const i = document.getElementById("captureInput") as HTMLInputElement | null; i?.scrollIntoView({ block: "center", behavior: "smooth" }); i?.focus(); };

export function Sidebar() {
  const domains = [...new Set(tasks.value.filter((t) => !t.deleted && t.domain).map((t) => t.domain!))].sort();
  const sk = stickerSlots.value;
  return (
    <aside class="sidebar">
      <div class="brand"><span class="mark">✓</span> My Tasks <span class="sidebar-sticker">{sk.sidebar}</span></div>
      <div class="workspace">Workspace</div>
      <nav class="nav">
        {NAV.map((n) => <button key={n.v} class={view.value === n.v ? "on" : ""} onClick={() => setView(n.v)}>{n.icon} {n.label}</button>)}
      </nav>
      {domains.length ? (
        <>
          <div class="workspace">Domains</div>
          <nav class="nav">
            {domains.map((d) => <button key={d} class={view.value === "all" && domFilter.value === d ? "on" : ""} onClick={() => { domFilter.value = d; stFilter.value = ""; setView("all"); }}>{domainEmoji(d)} {d}</button>)}
          </nav>
        </>
      ) : null}
      <div class="workspace">Settings</div>
      <nav class="nav"><button onClick={openSettings}>⚙ Preferences</button></nav>
      <div class="side-bottom">
        <span id="syncPill" data-s={syncState.value} title="Sync — tap for settings" onClick={openSettings}>
          <span class="dot" />{{ synced: "Synced", syncing: "Syncing…", offline: "Offline", error: "Sync error", local: "Local" }[syncState.value]}
        </span>
        {paReady.value ? <div id="paPill" data-s={paState.value} onClick={openSettings}>✦ {{ ready: "PA", thinking: "thinking…", error: "PA error" }[paState.value]}</div> : null}
      </div>
    </aside>
  );
}

export function BottomNav() {
  // Board is now in the mobile nav (plan cleanup); All + Done stay reachable via stat cards.
  return (
    <nav id="bnav">
      <button class={view.value === "today" ? "on" : ""} onClick={() => setView("today")}><span class="bi">▦</span><span>Today</span></button>
      <button class={view.value === "week" ? "on" : ""} onClick={() => setView("week")}><span class="bi">◫</span><span>Week</span></button>
      <button type="button" class={`micbtn bfab${listening.value ? " listening" : ""}`} aria-label="Add by voice" onClick={() => startVoice(focusCapture)}>🎤</button>
      <button class={view.value === "board" ? "on" : ""} onClick={() => setView("board")}><span class="bi">▤</span><span>Board</span></button>
      <button class={view.value === "month" ? "on" : ""} onClick={() => setView("month")}><span class="bi">◇</span><span>Month</span></button>
    </nav>
  );
}

export function TopHeader() {
  const [title, sub] = VIEW_META[view.value];
  return (
    <header class="top">
      <div>
        <div class="eyebrow">Workspace / {title}</div>
        <h1>{title}</h1>
        <p class="sub">{sub}</p>
      </div>
      <button class="primary" onClick={focusCapture}>+ New task</button>
    </header>
  );
}

export function CaptureBar() {
  const ref = useRef<HTMLInputElement>(null);
  const submit = (e: Event) => {
    e.preventDefault();
    const v = ref.current?.value || "";
    addTask(v); // store fires the afterCapture hook (ingest/prioritize)
    if (ref.current) { ref.current.value = ""; ref.current.focus(); }
  };
  const dueKey = captureDue.value;
  return (
    <>
      <form class="capturebar" autocomplete="off" onSubmit={submit}>
        <input id="captureInput" ref={ref} placeholder={dueKey ? "Add a task for that day…" : "What needs doing? Type & press Enter…"} enterkeyhint="done" />
        <button type="button" class={`micbtn${listening.value ? " listening" : ""}`} aria-label="Add by voice" onClick={() => startVoice(focusCapture)}>🎤</button>
        <button type="submit" class="addbtn" aria-label="Add">＋</button>
      </form>
      {dueKey ? (
        <div class="capdue">
          <span>→ due {new Date(dueKey + "T00:00:00").toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" })}</span>
          <button type="button" aria-label="Clear date" onClick={clearCaptureDue}>✕</button>
        </div>
      ) : null}
    </>
  );
}

export function StatCards() {
  const act = activeOpen(tasks.value);
  const today = localKey();
  const sk = stickerSlots.value;
  const dn = doneTodayList(tasks.value).length;
  const dueToday = act.filter((t) => t.due === today).length;
  const overdue = act.filter((t) => t.due && t.due < today).length;
  const high = act.filter((t) => tier(t) === "high").length;
  return (
    <section class="stats">
      <div class="stat" title="Completed tasks" onClick={() => setView("history")}><span class="stat-sticker">{sk.stat1}</span><label>Done today</label><strong>{dn}</strong><small>Tap for history</small></div>
      <div class="stat" onClick={() => setView("today")}><span class="stat-sticker">{sk.stat2}</span><label>Due today</label><strong>{dueToday}</strong><small>On today's plate</small></div>
      <div class="stat" onClick={() => setView("week")}><span class="stat-sticker">{sk.stat3}</span><label>Overdue</label><strong>{overdue}</strong><small>Need rescue</small></div>
      <div class="stat" onClick={() => setView("all")}><span class="stat-sticker">{sk.stat4}</span><label>High priority</label><strong>{high}</strong><small>Claude-ranked</small></div>
    </section>
  );
}

function FocusItem({ id, subtitle, text }: { id: string; subtitle: string; text: string }) {
  return <div class="focus-item" onClick={() => jumpToTask(id)}><span>{subtitle}</span><b>{text}</b></div>;
}

export function Aside() {
  const act = activeOpen(tasks.value);
  const sk = stickerSlots.value;
  const due = act.filter((t) => t.due).sort((a, b) => a.due!.localeCompare(b.due!)).slice(0, 6);
  const focus = act.filter((t) => tier(t) === "high").slice(0, 5);
  const completed = tasks.value.filter((t) => !t.deleted && t.done).sort((a, b) => (b.completedAt || 0) - (a.completedAt || 0)).slice(0, 5);
  const domains = [...new Set(tasks.value.filter((t) => !t.deleted && t.domain).map((t) => t.domain!))].sort();
  const fmtDay = (d: string) => new Date(d + "T00:00:00").toLocaleDateString(undefined, { weekday: "short", day: "numeric", month: "short" });
  return (
    <aside class="aside">
      <div class="panel"><h3>Due by day<span class="panel-sticker">{sk.panelDue}</span></h3><div class="focus">
        {due.length ? due.map((t) => <FocusItem key={t.id} id={t.id} subtitle={fmtDay(t.due!) + (t.domain ? " · " + t.domain : "")} text={t.text} />) : <div class="meta">No upcoming due dates yet. {sk.panelDue}</div>}
      </div></div>
      <div class="panel"><h3>Priority queue<span class="panel-sticker">{sk.panelQueue}</span></h3><div class="focus">
        {focus.length ? focus.map((t) => <FocusItem key={t.id} id={t.id} subtitle={(t.domain || "High priority") + (t.why ? " · " + t.why : "")} text={t.text} />) : <div class="meta">Priority queue is clear. {sk.panelQueue}</div>}
      </div></div>
      <div class="panel"><h3>Recently completed<span class="panel-sticker">{sk.panelDone}</span></h3><div class="focus">
        {completed.length ? completed.map((t) => <FocusItem key={t.id} id={t.id} subtitle={t.completedAt ? new Date(t.completedAt).toLocaleDateString(undefined, { weekday: "short", day: "numeric", month: "short" }) : "Done"} text={t.text} />) : <div class="meta">Completed tasks will appear here. {sk.panelDone}</div>}
      </div></div>
      <div class="panel"><h3>Progress by domain<span class="panel-sticker">{sk.panelDomain}</span></h3><div>
        {domains.length ? domains.map((d) => {
          const x = tasks.value.filter((t) => !t.deleted && t.domain === d);
          const doneN = x.filter((t) => t.done).length;
          const pct = x.length ? Math.round((doneN / x.length) * 100) : 0;
          return <div class="project-row" key={d}><div class="project-label"><b>{d}</b><span>{pct}% · {x.length} tasks</span></div><div class="widebar"><i style={`width:${pct}%`} /></div></div>;
        }) : <div class="meta">Add domains to tasks to see progress here. {sk.panelDomain}</div>}
      </div></div>
    </aside>
  );
}

export function Banner() {
  if (config.value.token) return null;
  return <div class="banner"><span>📵 Local only — add a token to sync across devices.</span><button onClick={openSettings}>Set up</button></div>;
}

export function Brief() {
  if (view.value !== "today" || !paReady.value) return null;
  const today = localKey();
  const b = brief.value;
  if (b && b.date === today && b.summary) {
    const byId = Object.fromEntries(tasks.value.map((t) => [t.id, t]));
    const focus = (b.focus || []).filter((f) => byId[f.id] && !byId[f.id].done && !byId[f.id].deleted);
    return (
      <div class="brief">
        <div class="bh"><b>✨ Today's plan</b><button class="mini" onClick={() => generateBrief(true)}>↻ refresh</button></div>
        <p class="summary">{b.summary}</p>
        {focus.length ? <div class="focus">{focus.map((f, i) => (
          <div class="fitem" key={f.id} onClick={() => jumpToTask(f.id)}><span class="dotnum">{i + 1}</span><span class="fa">{f.action || byId[f.id].text}</span>{f.minutes ? <span class="fm">~{f.minutes}m</span> : null}</div>
        ))}</div> : null}
      </div>
    );
  }
  return <div class="setup-pa"><span>✨ Get Claude's plan for today</span><button onClick={() => generateBrief(true)}>Brief me</button></div>;
}

export function WrapUp() {
  if (view.value !== "today") return null;
  if (new Date().getHours() < 16) return null;
  if (wrapDone() === localKey()) return null;
  const doneN = doneTodayList(tasks.value).length;
  const pinned = tasks.value.find((t) => !t.deleted && !t.done && t.pinnedFor === tomorrowKey());
  const opts = activeOpen(tasks.value).slice(0, 5);
  return (
    <div class="wrapup">
      <div class="bh"><b>🌇 Day wrap-up — {doneN} done today</b><button class="mini" onClick={() => setWrapDone()}>Done</button></div>
      {pinned ? (
        <div class="wsel">🎯 Tomorrow's #1: <b>{pinned.text}</b></div>
      ) : opts.length ? (
        <>
          <div class="wq">Pick tomorrow's #1 — it'll be pinned on top in the morning:</div>
          <div class="wchips">{opts.map((t) => <button class="wchip" key={t.id} onClick={() => { pinTask(t.id, tomorrowKey()); showToast("🎯 Pinned for tomorrow"); }}>{t.text}</button>)}</div>
        </>
      ) : (
        <div class="wq">Nothing open — clean slate tomorrow 🎉</div>
      )}
    </div>
  );
}

export function Toast() {
  const t = toast.value;
  if (!t) return null;
  return (
    <div class="toast">
      <span>{t.msg}</span>
      {t.btnLabel ? <button onClick={() => { dismissToast(); t.onAction?.(); }}>{t.btnLabel}</button> : null}
    </div>
  );
}
