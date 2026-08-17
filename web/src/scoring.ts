// Pure scoring / date helpers — ported VERBATIM from the current app (index.html). These drive
// every ordering (today plate, board columns, month day, weekly) and the priority tiers, so
// they must match the old outputs exactly. Cross-checked against the live functions in
// scoring.parity.mjs. No signals / no DOM here — pure functions only.

import type { Task } from "./types";

export const DAY = 86400000;

/** Local-time YYYY-MM-DD (NOT UTC). All date compares in the app are local + string-lexical. */
export function localKey(ts?: number): string {
  const d = ts != null ? new Date(ts) : new Date();
  return (
    d.getFullYear() +
    "-" +
    String(d.getMonth() + 1).padStart(2, "0") +
    "-" +
    String(d.getDate()).padStart(2, "0")
  );
}

export function tomorrowKey(): string {
  return localKey(Date.now() + DAY);
}

/** Days until due (negative = overdue), or null when no due date. */
export function dueDays(t: Task): number | null {
  if (!t.due) return null;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return Math.round((new Date(t.due + "T00:00:00").getTime() - today.getTime()) / DAY);
}

export function staleDays(t: Task): number {
  return Math.floor((Date.now() - t.updatedAt) / DAY);
}

export const isStale = (t: Task): boolean => staleDays(t) >= 4;

/** Rule-based fallback score (used when Claude hasn't ranked the task). */
export function score(t: Task): number {
  let s = 0;
  const dd = dueDays(t);
  if (dd !== null) {
    if (dd < 0) s += 100 + Math.min(-dd, 30) * 5;
    else if (dd === 0) s += 80;
    else if (dd === 1) s += 60;
    else if (dd <= 3) s += 40;
    else if (dd <= 7) s += 20;
    else s += 5;
  }
  if (t.important) s += 50;
  s += Math.min(staleDays(t), 20) * 3;
  return s;
}

/** Effective score for ordering: pinned-for-today dominates (1000); else Claude's aiPriority
 *  if present; else the capped rule score. */
export function effScore(t: Task): number {
  if (t.pinnedFor === localKey()) return 1000;
  return typeof t.aiPriority === "number" ? t.aiPriority : Math.min(score(t), 100);
}

export type Tier = "high" | "med" | "low";
export function tier(t: Task): Tier {
  const p = typeof t.aiPriority === "number" ? t.aiPriority : Math.min(score(t), 100);
  return p >= 70 ? "high" : p >= 40 ? "med" : "low";
}

export const isToday = (ts: number | null | undefined): boolean =>
  !!ts && new Date(ts).toDateString() === new Date().toDateString();

// ---- list selectors (pure over a task array) ----

export function activeOpen(tasks: Task[]): Task[] {
  return tasks
    .filter((t) => !t.deleted && !t.done && t.bucket === "active")
    .sort((a, b) => effScore(b) - effScore(a) || a.createdAt - b.createdAt);
}
export function somedayList(tasks: Task[]): Task[] {
  return tasks
    .filter((t) => !t.deleted && !t.done && t.bucket === "someday")
    .sort((a, b) => b.updatedAt - a.updatedAt);
}
export function doneTodayList(tasks: Task[]): Task[] {
  return tasks
    .filter((t) => !t.deleted && t.done && isToday(t.completedAt))
    .sort((a, b) => (b.completedAt || 0) - (a.completedAt || 0));
}
