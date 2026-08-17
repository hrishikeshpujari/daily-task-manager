// The six views (Today/Week/Board/Month/All/History) + their empty states, ported from the
// current app's *HTML() render functions. They read signals directly, so they re-render
// reactively — no manual render() calls, no innerHTML rebuilds.
import { signal } from "@preact/signals";
import { tasks, q, domFilter, stFilter, selDay, monthCursor, setCaptureDue } from "../store";
import { activeOpen, somedayList, doneTodayList, effScore, dueDays, localKey, DAY } from "../scoring";
import { dayLabel } from "../helpers";
import { randomSticker } from "../theme";
import { boardMove } from "../actions";
import { TaskRow, Ghead, TaskTable, BoardCard } from "./task";
import type { Task } from "../types";

const Empty = ({ children }: { children: any }) => <div class="empty">{children}</div>;

export function TodayView() {
  const act = activeOpen(tasks.value);
  const items = act.slice(0, 5);
  const dt = doneTodayList(tasks.value);
  const has = items.length > 0;
  return (
    <div class="panel">
      <div class="toolbar"><h2>Today's plate</h2></div>
      {has ? (
        <TaskTable>
          <Ghead label="Top priorities" extra={items.length} />
          {items.map((t, i) => <TaskRow t={t} rank={i + 1} key={t.id} />)}
          {act.length > 5 ? <Ghead label={`+${act.length - 5} more in This week`} /> : null}
          {dt.length ? <><Ghead label="Done today" extra={dt.length} />{dt.map((t) => <TaskRow t={t} key={t.id} />)}</> : null}
        </TaskTable>
      ) : (
        <Empty>Nothing yet. Capture your first task above 👆 {randomSticker()}</Empty>
      )}
    </div>
  );
}

export function WeekView() {
  const act = activeOpen(tasks.value);
  const order: string[] = [];
  const byKey: Record<string, { label: string; tasks: Task[] }> = {};
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const add = (key: string, label: string, t: Task) => {
    if (!byKey[key]) { byKey[key] = { label, tasks: [] }; order.push(key); }
    byKey[key].tasks.push(t);
  };
  for (const t of act) {
    const dd = dueDays(t);
    if (dd === null) add("z", "No date", t);
    else if (dd < 0) add("a", "Overdue", t);
    else if (dd === 0) add("b0", "Today", t);
    else if (dd === 1) add("b1", "Tomorrow", t);
    else if (dd < 7) add("b" + dd, new Date(today.getTime() + dd * DAY).toLocaleDateString(undefined, { weekday: "long" }), t);
    else add("y", "Later", t);
  }
  order.sort();
  return (
    <div class="panel">
      <div class="toolbar"><h2>This week</h2></div>
      {act.length ? (
        <TaskTable>
          {order.map((k) => <><Ghead label={byKey[k].label} extra={byKey[k].tasks.length} />{byKey[k].tasks.map((t) => <TaskRow t={t} key={t.id} />)}</>)}
        </TaskTable>
      ) : (
        <Empty>No active tasks. {randomSticker()}</Empty>
      )}
    </div>
  );
}

// Board drag state (desktop DnD). dragId is the card being dragged; dragCol highlights the hovered column.
const dragId = signal<string | null>(null);
const dragCol = signal<string | null>(null);
const COLS: { key: "todo" | "today" | "someday" | "done"; label: string; hint: string }[] = [
  { key: "todo", label: "To do", hint: "drag a card here to unschedule it" },
  { key: "today", label: "Today", hint: "drag here to do it today" },
  { key: "someday", label: "Someday", hint: "drag here to park an idea" },
  { key: "done", label: "Done", hint: "drag here to complete" },
];

export function BoardView() {
  const today = localKey();
  const open = tasks.value.filter((t) => !t.deleted && !t.done);
  const someday = open.filter((t) => t.bucket === "someday").sort((a, b) => b.updatedAt - a.updatedAt);
  const todayCol = open.filter((t) => t.bucket === "active" && (t.due === today || t.pinnedFor === today)).sort((a, b) => effScore(b) - effScore(a));
  const todo = open.filter((t) => t.bucket === "active" && !(t.due === today || t.pinnedFor === today)).sort((a, b) => effScore(b) - effScore(a));
  const doneAll = tasks.value.filter((t) => !t.deleted && t.done);
  const done = doneAll.slice().sort((a, b) => (b.completedAt || 0) - (a.completedAt || 0)).slice(0, 10);
  const byCol: Record<string, { arr: Task[]; count: number }> = {
    todo: { arr: todo, count: todo.length },
    today: { arr: todayCol, count: todayCol.length },
    someday: { arr: someday, count: someday.length },
    done: { arr: done, count: doneAll.length },
  };
  return (
    <div class="panel">
      <div class="toolbar"><h2>Board</h2><span class="meta">drag cards between columns</span></div>
      <div class="board">
        {COLS.map((c) => (
          <div
            class={`column${dragCol.value === c.key ? " dragover" : ""}`}
            key={c.key}
            onDragOver={(e) => { e.preventDefault(); dragCol.value = c.key; }}
            onDragLeave={(e) => { if (!(e.currentTarget as HTMLElement).contains(e.relatedTarget as Node)) dragCol.value = null; }}
            onDrop={(e) => { e.preventDefault(); dragCol.value = null; const id = dragId.value; dragId.value = null; if (id) boardMove(id, c.key); }}
          >
            <div class="column-head">{c.label}<span class="count">{byCol[c.key].count}</span></div>
            {byCol[c.key].arr.map((t) => (
              <BoardCard t={t} key={t.id} onDragStart={(e) => { dragId.value = t.id; e.dataTransfer!.effectAllowed = "move"; }} />
            ))}
            {byCol[c.key].arr.length ? null : <div class="meta" style="padding:6px">{c.hint}</div>}
          </div>
        ))}
      </div>
    </div>
  );
}

export function MonthView() {
  if (!monthCursor.value) { const n = new Date(); monthCursor.value = { y: n.getFullYear(), m: n.getMonth() }; }
  const { y, m } = monthCursor.value!;
  const first = new Date(y, m, 1), startDow = first.getDay(), daysIn = new Date(y, m + 1, 0).getDate();
  const todayKey = localKey();
  const openBy: Record<string, Task[]> = {}, doneBy: Record<string, Task[]> = {};
  tasks.value.forEach((t) => {
    if (t.deleted) return;
    if (!t.done && t.due) (openBy[t.due] = openBy[t.due] || []).push(t);
    else if (t.done && t.completedAt) { const k = localKey(t.completedAt); (doneBy[k] = doneBy[k] || []).push(t); }
  });
  const monthName = first.toLocaleDateString(undefined, { month: "long", year: "numeric" });
  const cells: any[] = ["S", "M", "T", "W", "T", "F", "S"].map((d, i) => <div class="mdow" key={"dow" + i}>{d}</div>);
  for (let i = 0; i < startDow; i++) cells.push(<div class="mcell blank" key={"blank" + i} />);
  for (let d = 1; d <= daysIn; d++) {
    const key = y + "-" + String(m + 1).padStart(2, "0") + "-" + String(d).padStart(2, "0");
    const n = (openBy[key] || []).length, dn = (doneBy[key] || []).length;
    const cls = ["mcell", key === todayKey ? "tdy" : "", key === selDay.value ? "sel" : "", n && key < todayKey ? "late" : ""].filter(Boolean).join(" ");
    cells.push(
      <div class={cls} key={key} onClick={() => (selDay.value = selDay.value === key ? null : key)}>
        <span class="mnum">{d}</span>
        {n ? <span class="mcount">{n}</span> : dn ? <span class="mdone">✓</span> : null}
      </div>
    );
  }
  const nav = (delta: number) => {
    if (delta === 0) { const n = new Date(); monthCursor.value = { y: n.getFullYear(), m: n.getMonth() }; selDay.value = localKey(); return; }
    let mm = m + delta, yy = y;
    if (mm < 0) { mm = 11; yy--; }
    if (mm > 11) { mm = 0; yy++; }
    monthCursor.value = { y: yy, m: mm };
  };
  const prefix = y + "-" + String(m + 1).padStart(2, "0");
  const sel = selDay.value && selDay.value.startsWith(prefix) ? selDay.value : null;
  let dayBlock: any = <Empty>Tap a day to see or add its tasks. {randomSticker()}</Empty>;
  if (sel) {
    const dayOpen = (openBy[sel] || []).slice().sort((a, b) => effScore(b) - effScore(a));
    // Reconciled (plan cleanup): key done-on-this-day by completedAt, consistent with the dots.
    const dayDone = tasks.value.filter((t) => !t.deleted && t.done && t.completedAt && localKey(t.completedAt) === sel);
    const dLabel = new Date(sel + "T00:00:00").toLocaleDateString(undefined, { weekday: "long", month: "short", day: "numeric" });
    dayBlock = (
      <>
        <div class="dayhdr"><h3>{dLabel}</h3><span class="cnt">{dayOpen.length} open</span><div class="ln" /><button class="chipbtn" onClick={() => setCaptureDue(sel)}>＋ add here</button></div>
        {dayOpen.length || dayDone.length ? (
          <TaskTable>{[...dayOpen, ...dayDone].map((t) => <TaskRow t={t} key={t.id} />)}</TaskTable>
        ) : (
          <Empty>Nothing on this day. {randomSticker()}</Empty>
        )}
      </>
    );
  }
  return (
    <div class="panel">
      <div class="mnav">
        <button onClick={() => nav(-1)} aria-label="Previous month">‹</button>
        <div class="mtitle">{monthName}</div>
        <button onClick={() => nav(1)} aria-label="Next month">›</button>
        <button onClick={() => nav(0)}>today</button>
      </div>
      <div class="mgrid">{cells}</div>
      {dayBlock}
    </div>
  );
}

export function AllView() {
  const query = (q.value || "").toLowerCase();
  const domains = [...new Set(tasks.value.filter((t) => !t.deleted && t.domain).map((t) => t.domain!))].sort();
  const match = (t: Task) => (!query || t.text.toLowerCase().includes(query) || (t.domain || "").toLowerCase().includes(query)) && (!domFilter.value || t.domain === domFilter.value);
  let a = activeOpen(tasks.value).filter(match);
  let s = somedayList(tasks.value).filter(match);
  let d: Task[] = query ? tasks.value.filter((t) => !t.deleted && t.done && match(t)).sort((x, z) => (z.completedAt || 0) - (x.completedAt || 0)).slice(0, 20) : [];
  if (stFilter.value === "active") { s = []; d = []; }
  else if (stFilter.value === "someday") { a = []; d = []; }
  else if (stFilter.value === "done") { a = []; s = []; d = tasks.value.filter((t) => !t.deleted && t.done && match(t)).sort((x, z) => (z.completedAt || 0) - (x.completedAt || 0)).slice(0, 50); }
  const hasBody = a.length || s.length || d.length;
  return (
    <div class="panel">
      <div class="toolbar">
        <h2>All tasks</h2>
        <input class="search" id="qInput" placeholder="Search tasks…" value={q.value} onInput={(e) => (q.value = (e.target as HTMLInputElement).value)} />
        <select class="filter" value={stFilter.value} onChange={(e) => (stFilter.value = (e.target as HTMLSelectElement).value as any)}>
          <option value="">All statuses</option>
          <option value="active">Active</option>
          <option value="someday">Someday</option>
          <option value="done">Done</option>
        </select>
      </div>
      {domains.length ? (
        <div class="domchips">
          <button class={`domchip${!domFilter.value ? " on" : ""}`} onClick={() => (domFilter.value = "")}>All domains</button>
          {domains.map((dm) => <button class={`domchip${domFilter.value === dm ? " on" : ""}`} key={dm} onClick={() => (domFilter.value = dm)}>{dm}</button>)}
        </div>
      ) : null}
      {hasBody ? (
        <TaskTable>
          {a.length ? <><Ghead label="Active" extra={a.length} />{a.map((t) => <TaskRow t={t} key={t.id} />)}</> : null}
          {s.length ? <><Ghead label="Someday" extra={s.length} />{s.map((t) => <TaskRow t={t} key={t.id} />)}</> : null}
          {d.length ? <><Ghead label="Done" extra={d.length} />{d.map((t) => <TaskRow t={t} key={t.id} />)}</> : null}
        </TaskTable>
      ) : (
        <Empty>{query || domFilter.value || stFilter.value ? "No tasks match this view." : <>Nothing yet. Capture your first task above {randomSticker()}</>}</Empty>
      )}
    </div>
  );
}

export function HistoryView({ onWeekly }: { onWeekly: () => void }) {
  const done = tasks.value.filter((t) => !t.deleted && t.done && t.completedAt);
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const counts: { d: Date; n: number }[] = [];
  let max = 1;
  for (let i = 6; i >= 0; i--) {
    const dt = new Date(today.getTime() - i * DAY);
    const key = localKey(dt.getTime());
    const n = done.filter((t) => localKey(t.completedAt!) === key).length;
    counts.push({ d: dt, n });
    if (n > max) max = n;
  }
  const groups: Record<string, Task[]> = {};
  done.forEach((t) => { const k = localKey(t.completedAt!); (groups[k] = groups[k] || []).push(t); });
  const keys = Object.keys(groups).sort().reverse();
  return (
    <div class="panel">
      <div class="toolbar"><h2>Completed</h2></div>
      <div class="spark">
        {counts.map((c, i) => (
          <div class="col" key={i}>
            <span class="val">{c.n || ""}</span>
            <div class={`bar2${c.n ? "" : " zero"}`} style={`height:${c.n ? Math.round((c.n / max) * 100) : 0}%`} />
            <span class="lbl">{c.d.toLocaleDateString(undefined, { weekday: "narrow" })}</span>
          </div>
        ))}
      </div>
      {done.length ? (
        <TaskTable>
          {keys.map((k) => {
            const items = groups[k].slice().sort((a, b) => (b.completedAt || 0) - (a.completedAt || 0));
            return <><Ghead label={dayLabel(k)} extra={items.length + " done"} />{items.map((t) => <TaskRow t={t} key={t.id} />)}</>;
          })}
        </TaskTable>
      ) : (
        <Empty>No completed tasks yet. Knock one out {randomSticker()}</Empty>
      )}
      <button class="weekbtn" onClick={onWeekly}>📧 Generate weekly email</button>
    </div>
  );
}
