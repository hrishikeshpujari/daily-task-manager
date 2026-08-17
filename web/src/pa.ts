// Claude PA layer — prioritize / daily brief / weekly email / smart-capture ingest / import.
// The 5 system prompts and the relay contract ({system,prompt,max_tokens} -> {result}, header
// x-app-secret) are ported VERBATIM and shared with the Worker + Android; do not reword.

import type { Task } from "./types";
import { localKey, effScore, DAY } from "./scoring";
import {
  tasks, config, brief, paReady, paState, uid,
  saveTasks, saveBrief, queueSync, queuePrioritize, showToast,
} from "./store";

export const SYS_PRIORITIZE = `You are a personal assistant prioritizing ONE user's tasks (work + personal). Input is a JSON task list (id, text, due YYYY-MM-DD or null, important, createdAt, bucket). Return ONLY JSON, no prose, no fences: {"tasks":[{"id":"<id>","priority":<1-100>,"effortMins":<int>,"why":"<=8 words"}]}. Higher priority = do sooner. Weigh due-date proximity, importance, how long it has sat, and obvious dependencies. Be decisive and realistic about effort.`;
export const SYS_BRIEF = `You are a personal assistant giving ONE user a short daily briefing (work + personal). Input is a JSON task list. Return ONLY JSON, no prose, no fences: {"summary":"<2-3 sentences: what to do today and roughly how much time>","focus":[{"id":"<id>","action":"<=12 words","minutes":<int>}],"skip":["<id>"]}. Pick the 3-5 things that matter most today. A task with pinned:true is the user's chosen #1 for today — put it first in focus and build the plan around it. Realistic about total time. Direct and encouraging.`;
export const SYS_WEEKLY = `You are drafting a brief weekly status update the user will paste into an email to their manager. Input is JSON with "completed" (tasks finished in the last 7 days) and "inProgress" (current open tasks, highest priority first). Write in the user's first-person voice: concise, confident, professional. Output ONLY the email body to paste — no subject, no greeting, no sign-off, no preamble. Use two short labeled sections: what got done this week (from completed), and current focus / what's next (from inProgress — lead with important or due-soon items). Tight bullets, group related items, only real items from the input, never invent. If a section is empty, say so in one short honest line.`;
export const SYS_INGEST = `You clean up ONE raw task capture (often messy voice-to-text) into a structured task. Input is the raw string plus today's date. Return ONLY JSON, no prose, no fences: {"text":"<clean concise task title, filler words removed>","due":"<YYYY-MM-DD or null>","time":"<HH:MM 24-hour or null>","important":<true|false>,"domain":"<short area label or null>","bucket":"<active|someday>"}. Strip filler (um, uh, like, so, basically). Resolve relative dates against today (tomorrow, tonight, next Monday become a date; if only a clock time is mentioned, use today). Extract a clock time into "time" (e.g. "2pm" -> "14:00") and REMOVE it from the title. Set important:true only if the user signals urgency or importance. Infer domain only if obvious (e.g. Home, Work, Health, Errands, Finance); else null. Use bucket "someday" only for clearly vague someday/maybe ideas; else "active". Stay faithful to intent — if the input is already a clean short task, return it nearly unchanged.`;
export const SYS_IMPORT = `You convert ONE pasted dump of personal to-do lists (from Apple Notes, Google Keep, etc.) into structured tasks. Input: today's date + the raw dump (may contain list titles, day names, emoji, checkboxes, mixed formatting). Return ONLY JSON, no prose, no fences: {"tasks":[{"text":"<concise title>","due":"<YYYY-MM-DD or null>","time":"<HH:MM 24-hour or null>","important":<true|false>,"domain":"<label or null>","bucket":"<active|someday>"}]}. One entry per real to-do. Skip headings, blank lines, and completed-looking items (checked boxes, strikethrough). Resolve weekday names to the NEXT occurrence of that day. Extract clock times into "time" and remove them from the title. Infer domain from list titles when obvious.`;

const clampNum = (n: unknown): number | undefined => {
  const x = Number(n);
  return Number.isFinite(x) ? Math.round(x) : undefined;
};
export function parseLooseJSON(s: string | null): any {
  if (!s) return null;
  let t = String(s).trim().replace(/^```[a-z]*\s*/i, "").replace(/\s*```$/, "");
  const a = t.indexOf("{"), b = t.lastIndexOf("}");
  if (a >= 0 && b > a) t = t.slice(a, b + 1);
  try { return JSON.parse(t); } catch { return null; }
}
export function setPA(s: "ready" | "thinking" | "error") {
  paState.value = s;
}

let paErrToasted = false;
function paError(e: any) {
  console.error(e);
  setPA("error");
  if (paErrToasted) return;
  paErrToasted = true;
  const m = String(e?.message || "");
  let msg = "Claude PA error — check the Worker URL & secret in ⚙";
  if (/401|403|unauthorized/i.test(m)) msg = "PA rejected: the app secret doesn't match the Worker's APP_SECRET (⚙)";
  else if (/credit|billing|402/i.test(m)) msg = "PA out of Anthropic credit — top up at console.anthropic.com";
  showToast(msg, "OK");
}

export async function callPA(system: string, prompt: string, max?: number): Promise<string | null> {
  const c = config.value;
  if (!paReady.value) return null;
  const res = await fetch(c.proxyUrl, {
    method: "POST",
    headers: { "content-type": "application/json", "x-app-secret": c.appSecret },
    body: JSON.stringify({ system, prompt, max_tokens: max || 1024 }),
  });
  if (!res.ok) throw new Error("PA " + res.status);
  const data = await res.json();
  if (data.error) throw new Error(data.error);
  return data.result || "";
}

export function aiTaskPayload() {
  return tasks.value
    .filter((t) => !t.deleted && !t.done)
    .map((t) => ({ id: t.id, text: t.text, due: t.due, important: t.important, createdAt: t.createdAt, bucket: t.bucket, pinned: t.pinnedFor === localKey() }));
}

export function looksIngestable(s: string): boolean {
  s = String(s);
  return s.length >= 24 || /\d/.test(s) || /\b(today|tonight|tmrw|tomorrow|mon|tue|wed|thu|fri|sat|sun|monday|tuesday|wednesday|thursday|friday|saturday|sunday|am|pm|next|morning|afternoon|evening)\b/i.test(s);
}

export async function runIngest(id: string, raw: string) {
  if (!paReady.value || !navigator.onLine) return;
  setPA("thinking");
  try {
    const before = tasks.value.find((x) => x.id === id);
    const stamp = before ? before.updatedAt : 0;
    const out = parseLooseJSON(await callPA(SYS_INGEST, "Today is " + localKey() + ". Raw capture:\n" + raw, 400));
    const t = tasks.value.find((x) => x.id === id);
    // clobber guard: only apply if the task still exists, isn't deleted, and wasn't edited/
    // completed during the async round-trip.
    if (out && t && !t.deleted && t.updatedAt === stamp) {
      if (out.text && String(out.text).trim()) t.text = String(out.text).trim();
      if (out.due && !t.due && /^\d{4}-\d{2}-\d{2}$/.test(out.due)) t.due = out.due; // never overwrite an explicit capture-due
      if (out.time && /^\d{2}:\d{2}$/.test(out.time)) t.time = out.time;
      if (typeof out.important === "boolean") t.important = out.important;
      if (out.domain && String(out.domain).trim() && String(out.domain).toLowerCase() !== "null") t.domain = String(out.domain).trim();
      if (out.bucket === "someday") t.bucket = "someday";
      t.updatedAt = Date.now();
      saveTasks();
      queueSync();
      queuePrioritize();
    }
    setPA("ready");
  } catch (e) { paError(e); }
}

export async function runPrioritize() {
  if (!paReady.value || !navigator.onLine) return;
  setPA("thinking");
  try {
    const r = parseLooseJSON(await callPA(SYS_PRIORITIZE, "Tasks:\n" + JSON.stringify(aiTaskPayload()), 2048));
    if (r && Array.isArray(r.tasks)) {
      const m: Record<string, any> = {};
      r.tasks.forEach((x: any) => (m[x.id] = x));
      tasks.value.forEach((t) => {
        const x = m[t.id];
        if (x) {
          if (x.priority != null) { const p = clampNum(x.priority); if (typeof p === "number") t.aiPriority = p; }
          if (x.effortMins != null) { const e = clampNum(x.effortMins); if (typeof e === "number") t.effortMins = e; }
          if (x.why) t.why = String(x.why).trim();
        }
      });
      saveTasks();
    }
    setPA("ready");
  } catch (e) { paError(e); }
}

export async function generateBrief(force: boolean) {
  if (!paReady.value || !navigator.onLine) return;
  const today = localKey();
  if (!force && brief.value && brief.value.date === today) return;
  setPA("thinking");
  try {
    const r = parseLooseJSON(await callPA(SYS_BRIEF, "Now: " + new Date() + "\nTasks:\n" + JSON.stringify(aiTaskPayload()), 1024));
    if (r) {
      brief.value = { date: today, summary: r.summary || "", focus: Array.isArray(r.focus) ? r.focus : [], skip: r.skip || [] };
      saveBrief();
    }
    setPA("ready");
  } catch (e) { paError(e); }
}

export function weeklyText(done?: Task[], active?: Task[]): string {
  done = done || tasks.value.filter((t) => t.done && !t.deleted && (t.completedAt || 0) >= Date.now() - 7 * DAY).sort((a, b) => (b.completedAt || 0) - (a.completedAt || 0));
  active = active || tasks.value.filter((t) => !t.deleted && !t.done && t.bucket === "active").sort((a, b) => effScore(b) - effScore(a)).slice(0, 12);
  const d = `Completed this week (${done.length}):\n` + (done.map((t) => "• " + t.text).join("\n") || "• (nothing logged)");
  const a = `\n\nIn progress / next:\n` + (active.map((t) => "• " + t.text).join("\n") || "• (nothing active)");
  return d + a;
}

export async function generateWeekly(): Promise<string> {
  const since = Date.now() - 7 * DAY;
  const done = tasks.value.filter((t) => t.done && !t.deleted && (t.completedAt || 0) >= since).sort((a, b) => (b.completedAt || 0) - (a.completedAt || 0));
  const active = tasks.value.filter((t) => !t.deleted && !t.done && t.bucket === "active").sort((a, b) => effScore(b) - effScore(a)).slice(0, 12);
  if (!paReady.value || !navigator.onLine) return weeklyText(done, active);
  setPA("thinking");
  try {
    const payload = { completed: done.map((t) => ({ text: t.text, day: localKey(t.completedAt || undefined) })), inProgress: active.map((t) => ({ text: t.text, due: t.due, important: t.important })) };
    const text = ((await callPA(SYS_WEEKLY, "This week's data:\n" + JSON.stringify(payload), 900)) || "").trim();
    setPA("ready");
    return text || weeklyText(done, active);
  } catch (e) { paError(e); return weeklyText(done, active); }
}

/** Parse a pasted dump into tasks (PA if available, else line-split fallback), append, and
 *  return how many were added. The modal open/close + textarea live in the component. */
export async function importNow(raw: string): Promise<number> {
  raw = raw.trim();
  if (!raw) return 0;
  let items: any[] | null = null;
  if (paReady.value && navigator.onLine) {
    setPA("thinking");
    try {
      const r = parseLooseJSON(await callPA(SYS_IMPORT, "Today is " + localKey() + ".\nDump:\n" + raw, 2000));
      if (r && Array.isArray(r.tasks)) items = r.tasks;
      setPA("ready");
    } catch (e) { paError(e); }
  }
  if (!items) items = raw.split(/\n+/).map((s) => s.replace(/^[\s\-*•◦☐□✓✔]+/, "").trim()).filter((s) => s.length > 1).map((s) => ({ text: s }));
  const base = Date.now();
  let n = 0;
  const add: Task[] = [];
  for (const it of items) {
    if (!it || !it.text || !String(it.text).trim()) continue;
    const t: Task = { id: uid(), text: String(it.text).trim(), createdAt: base + n, updatedAt: base + n, due: it.due && /^\d{4}-\d{2}-\d{2}$/.test(it.due) ? it.due : null, important: it.important === true, done: false, completedAt: null, bucket: it.bucket === "someday" ? "someday" : "active", deleted: false };
    if (it.domain && String(it.domain).trim()) t.domain = String(it.domain).trim();
    if (it.time && /^\d{2}:\d{2}$/.test(it.time)) t.time = it.time;
    add.push(t);
    n++;
  }
  tasks.value = [...tasks.value, ...add];
  saveTasks();
  queueSync();
  queuePrioritize();
  showToast("⇪ Imported " + n + " task" + (n === 1 ? "" : "s"));
  return n;
}

/** Registered as store's afterCapture hook (app.tsx): ingest messy captures, else just re-prioritize. */
export function afterCapture(id: string, text: string) {
  if (paReady.value && looksIngestable(text)) runIngest(id, text);
  else queuePrioritize();
}
