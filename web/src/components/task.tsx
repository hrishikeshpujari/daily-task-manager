// Shared task renderers: table row (taskHTML), group header (ghead), the table wrapper
// (listWrap), and the board card (boardCardHTML). Ported field-for-field from the current app.
import type { Task } from "../types";
import { effScore, tier, isStale, staleDays, localKey } from "../scoring";
import { dueLabel, fmtTime } from "../helpers";
import { toggleDone, setStatus } from "../actions";
import { openModal } from "../ui";
import type { ComponentChildren } from "preact";

const TIER_TXT = { high: "High", med: "Med", low: "Low" } as const;
const TIER_CLS = { high: "priority", med: "medium", low: "normal" } as const;

export function TierBadge({ t }: { t: Task }) {
  const k = tier(t);
  return <span class={`badge ${TIER_CLS[k]}`}>{TIER_TXT[k]}</span>;
}

function StatusSelect({ t }: { t: Task }) {
  const v = t.done ? "done" : t.bucket === "someday" ? "someday" : "active";
  const cls = { active: "in-progress", someday: "on-hold", done: "complete" }[v];
  return (
    <select class={`status ${cls}`} value={v} onChange={(e) => setStatus(t.id, (e.target as HTMLSelectElement).value as any)}>
      <option value="active">Active</option>
      <option value="someday">Someday</option>
      <option value="done">Done</option>
    </select>
  );
}

export function TaskRow({ t, rank }: { t: Task; rank?: number | null }) {
  const isOne = !t.done && t.pinnedFor === localKey();
  const metaBits = [t.domain || "", !t.done && t.why ? "✦ " + t.why : "", !t.done && isStale(t) ? "🕓 " + staleDays(t) + "d idle" : ""].filter(Boolean).join(" · ");
  const dl = dueLabel(t);
  const scoreN = Math.min(t.done ? 100 : Math.round(effScore(t) > 100 ? 100 : effScore(t)), 100);
  const tm = fmtTime(t.time);
  return (
    <tr class={`task${t.done ? " done" : ""}${isOne ? " one" : ""}`} data-id={t.id}>
      <td style="width:34px"><button class="check" onClick={() => toggleDone(t.id)} aria-label="Done" /></td>
      <td>
        <div class="task-name">{isOne ? "🎯 " : ""}{rank && !t.done ? <span class="meta">#{rank} </span> : ""}{t.text}{t.important ? " ★" : ""}</div>
        {metaBits ? <div class="meta">{metaBits}</div> : null}
      </td>
      <td>{t.done ? "" : <TierBadge t={t} />}</td>
      <td><StatusSelect t={t} /></td>
      <td>{dl ? <span class={dl.cls === "due-over" ? "badge priority" : "meta"}>{dl.txt}</span> : <span class="meta">Not set</span>}</td>
      <td class="meta">{tm ? "🕐 " + tm : "—"}</td>
      <td><div class="progress"><span class="bar"><i style={`width:${scoreN}%`} /></span>{scoreN}</div></td>
      <td><button class="open" onClick={() => openModal({ kind: "task", id: t.id })}>Open</button></td>
    </tr>
  );
}

export function Ghead({ label, extra }: { label: string; extra?: string | number }) {
  return (
    <tr class="ghead">
      <td colSpan={8}>{label}{extra ? <span class="count"> {extra}</span> : null}</td>
    </tr>
  );
}

/** Table wrapper (listWrap): the tracker's column headers + a scroll container. */
export function TaskTable({ children }: { children: ComponentChildren }) {
  return (
    <div class="table-wrap">
      <table class="tasks">
        <thead>
          <tr><th></th><th>Task</th><th>Priority</th><th>Status</th><th>Due</th><th>Time</th><th>Score</th><th></th></tr>
        </thead>
        <tbody>{children}</tbody>
      </table>
    </div>
  );
}

export function BoardCard({ t, onDragStart }: { t: Task; onDragStart?: (e: DragEvent) => void }) {
  const dl = dueLabel(t);
  const meta = [t.domain || "", dl && !t.done ? dl.txt : "", fmtTime(t.time) ? "🕐 " + fmtTime(t.time) : ""].filter(Boolean).join(" · ");
  return (
    <article class={`task card${t.done ? " done" : ""}`} data-id={t.id} draggable={true} onDragStart={onDragStart}>
      <div class="cardrow">
        <button class="check" onClick={() => toggleDone(t.id)} aria-label="Done" />
        <div class="task-name">{!t.done && t.pinnedFor === localKey() ? "🎯 " : ""}{t.text}{t.important && !t.done ? " ★" : ""}</div>
      </div>
      {meta ? <div class="meta" style="margin-top:6px">{meta}</div> : null}
      <div class="card-foot">
        {t.done ? <span class="badge normal">Done</span> : <TierBadge t={t} />}
        <span class="card-actions">
          <button type="button" class="move-trigger" onClick={() => openModal({ kind: "move", id: t.id })}>⇄ Move</button>
          <button class="open" onClick={() => openModal({ kind: "task", id: t.id })}>Open</button>
        </span>
      </div>
    </article>
  );
}
