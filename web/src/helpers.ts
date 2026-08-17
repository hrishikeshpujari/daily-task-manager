// Small render helpers ported from the current app (dueLabel/dayLabel/fmtTime/fmtMins) + the
// domain emoji map. Pure; UI components import these.
import type { Task } from "./types";
import { DAY, dueDays } from "./scoring";

export function fmtMins(m: number | undefined): string | null {
  if (!m || m < 1) return null;
  if (m < 60) return "~" + m + "m";
  return "~" + Math.round(m / 30) / 2 + "h";
}

export function fmtTime(hm: string | undefined): string | null {
  if (!hm || !/^\d{2}:\d{2}$/.test(hm)) return null;
  const p = hm.split(":");
  const d = new Date();
  d.setHours(+p[0], +p[1], 0, 0);
  return d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
}

export function dueLabel(t: Task): { cls: string; txt: string } | null {
  const dd = dueDays(t);
  if (dd === null) return null;
  let cls = "", txt: string;
  if (dd < 0) { cls = "due-over"; txt = "overdue " + -dd + "d"; }
  else if (dd === 0) { cls = "due-today"; txt = "due today"; }
  else if (dd === 1) { txt = "due tomorrow"; }
  else if (dd <= 7) { txt = "due in " + dd + "d"; }
  else { txt = "due " + t.due!.slice(5); }
  return { cls, txt };
}

export function dayLabel(key: string): string {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const d = new Date(key + "T00:00:00");
  const diff = Math.round((today.getTime() - d.getTime()) / DAY);
  if (diff === 0) return "Today";
  if (diff === 1) return "Yesterday";
  if (diff < 7) return d.toLocaleDateString(undefined, { weekday: "long" });
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

// Emoji per domain (color half of the old DOMAIN_STYLE is unused — only the emoji is rendered).
export const DOMAIN_EMOJI: Record<string, string> = {
  home: "🏠", work: "💼", health: "🏋️", errands: "🛒", shopping: "🛒", groceries: "🛒",
  finance: "💳", personal: "💜", travel: "✈️", family: "👪", social: "🎉", fitness: "🏋️",
};
export const domainEmoji = (d?: string) => (d && DOMAIN_EMOJI[d.toLowerCase()]) || "📝";
