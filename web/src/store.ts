// Central state (Preact signals) + localStorage persistence + low-level model mutations.
// This is the leaf module — sync/pa/theme import it, never the reverse. Cross-layer triggers
// (queue a sync after a mutation; ingest-or-prioritize after a capture) go through the small
// hook registry at the bottom so there are zero import cycles.
//
// CRITICAL: the localStorage key NAMES and JSON shapes here are a hard contract — the native
// Android shell (MainActivity.mirror) reads 'dtm.config'/'dtm.tasks'/'dtm.brief' by these exact
// names, and every value is JSON.stringify'd (even plain strings). See plan invariants.

import { signal, computed } from "@preact/signals";
import type { Task, Config, Brief, View } from "./types";
import { localKey } from "./scoring";

export const GIST_FILE = "daily-tasks.json";
const K_TASKS = "dtm.tasks";
const K_CFG = "dtm.config";
const K_BRIEF = "dtm.brief";
const K_WRAP = "dtm.wrapDone";

export function load<T>(k: string, d: T): T {
  try {
    const v = localStorage.getItem(k);
    return v == null ? d : (JSON.parse(v) as T) ?? d;
  } catch {
    return d;
  }
}
function save(k: string, v: unknown) {
  localStorage.setItem(k, JSON.stringify(v));
}

export function uid(): string {
  return "t_" + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}

// ---- config (with boot migration matching the old app) ----
function loadConfig(): Config {
  const c = load<Partial<Config>>(K_CFG, {});
  return {
    token: c.token ?? "",
    gistId: c.gistId ?? "",
    proxyUrl: c.proxyUrl ?? "",
    appSecret: c.appSecret ?? "",
    theme: c.theme || "screener",
    // old builds stored only a light/dark string under the legacy "dtm.theme" key
    mode: c.mode || load<"light" | "dark">("dtm.theme", "light"),
    themeUpdatedAt: c.themeUpdatedAt || 0,
  };
}

// ---- signals: persisted domain state ----
export const tasks = signal<Task[]>(load<Task[]>(K_TASKS, []));
export const config = signal<Config>(loadConfig());
export const brief = signal<Brief | null>(load<Brief | null>(K_BRIEF, null));

// ---- signals: ephemeral UI state (not persisted) ----
export const view = signal<View>("today");
export const q = signal("");
export const domFilter = signal("");
export const stFilter = signal<"" | "active" | "someday" | "done">("");
export const captureDue = signal<string | null>(null);
export const monthCursor = signal<{ y: number; m: number } | null>(null);
export const selDay = signal<string | null>(null);
export const lastSync = signal(0);

export type SyncState = "local" | "syncing" | "synced" | "offline" | "error";
export const syncState = signal<SyncState>("local");
export type PaState = "ready" | "thinking" | "error";
export const paState = signal<PaState>("ready");

export interface ToastMsg {
  id: number;
  msg: string;
  btnLabel?: string;
  onAction?: () => void;
}
export const toast = signal<ToastMsg | null>(null);

export const paReady = computed(() => !!(config.value.proxyUrl && config.value.appSecret));

// ---- persistence helpers (also nudge reactivity by reassigning the signal) ----
export function saveTasks() {
  save(K_TASKS, tasks.value);
  tasks.value = tasks.value.slice(); // new array ref → subscribers re-run
}
export function saveConfig() {
  save(K_CFG, config.value);
  config.value = { ...config.value };
}
export function saveBrief() {
  if (brief.value) save(K_BRIEF, brief.value);
}
export function clearBrief() {
  brief.value = null;
  localStorage.removeItem(K_BRIEF);
}
export const wrapDone = () => load<string>(K_WRAP, "");
export const setWrapDone = () => save(K_WRAP, localKey());

// ---- toast ----
let toastId = 0;
let toastTimer: ReturnType<typeof setTimeout> | null = null;
export function showToast(msg: string, btnLabel?: string, onAction?: () => void) {
  if (toastTimer) clearTimeout(toastTimer);
  const id = ++toastId;
  toast.value = { id, msg, btnLabel, onAction };
  toastTimer = setTimeout(() => {
    if (toast.value?.id === id) toast.value = null;
  }, 5000);
}
export function dismissToast() {
  if (toastTimer) clearTimeout(toastTimer);
  toast.value = null;
}

// ---- model mutations ----
export function findTask(id: string): Task | undefined {
  return tasks.value.find((t) => t.id === id);
}

/** Capture: append a new active task (respecting a pending capture-due). Returns the new id and
 *  the raw text so the caller/hook can decide ingest-vs-prioritize (same as the old addTask). */
export function addTask(text: string): { id: string; text: string } | null {
  text = text.trim();
  if (!text) return null;
  const now = Date.now();
  const id = uid();
  const t: Task = {
    id,
    text,
    createdAt: now,
    updatedAt: now,
    due: captureDue.value || null,
    important: false,
    done: false,
    completedAt: null,
    bucket: "active",
    deleted: false,
  };
  tasks.value = [...tasks.value, t];
  save(K_TASKS, tasks.value);
  if (captureDue.value) clearCaptureDue();
  queueSync();
  afterCapture?.(id, text);
  return { id, text };
}

/** Apply fn to a task, bump updatedAt, persist, queue a sync. */
export function mutate(id: string, fn: (t: Task) => void) {
  const t = findTask(id);
  if (!t) return;
  fn(t);
  t.updatedAt = Date.now();
  saveTasks();
  queueSync();
}

/** One pin per date: toggling; clears any other task pinned for the same date; forces bucket
 *  active on set. Matches the old pinTask exactly. */
export function pinTask(id: string, dateKey: string) {
  const t = findTask(id);
  if (!t) return;
  const was = t.pinnedFor === dateKey;
  const now = Date.now();
  for (const x of tasks.value) {
    if (x.pinnedFor === dateKey) {
      delete x.pinnedFor;
      x.updatedAt = now;
    }
  }
  if (!was) {
    t.pinnedFor = dateKey;
    t.bucket = "active";
    t.updatedAt = now;
  }
  saveTasks();
  queueSync();
}

export function setCaptureDue(key: string) {
  captureDue.value = key;
}
export function clearCaptureDue() {
  captureDue.value = null;
}

// ---- hook registry (breaks store↔sync↔pa cycles; mirrors the old global calls) ----
let _sync: (() => void) | null = null;
let _prioritize: (() => void) | null = null;
let afterCapture: ((id: string, text: string) => void) | null = null;
let syncTimer: ReturnType<typeof setTimeout> | null = null;
let paTimer: ReturnType<typeof setTimeout> | null = null;

export function registerHooks(h: {
  sync?: () => void;
  prioritize?: () => void;
  afterCapture?: (id: string, text: string) => void;
}) {
  if (h.sync) _sync = h.sync;
  if (h.prioritize) _prioritize = h.prioritize;
  if (h.afterCapture) afterCapture = h.afterCapture;
}

/** Debounced sync (1200ms), same as the old queueSync. */
export function queueSync() {
  if (syncTimer) clearTimeout(syncTimer);
  syncTimer = setTimeout(() => _sync?.(), 1200);
}
/** Debounced prioritize (800ms), same as the old queuePrioritize. */
export function queuePrioritize() {
  if (paTimer) clearTimeout(paTimer);
  paTimer = setTimeout(() => _prioritize?.(), 800);
}
