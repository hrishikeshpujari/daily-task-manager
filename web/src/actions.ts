// High-level task actions used by components — combine store mutations with haptics, undo
// toasts, and re-prioritize, exactly as the old delegated handlers did.
import { mutate, findTask, showToast, queuePrioritize, pinTask } from "./store";
import { localKey } from "./scoring";
import { haptic } from "./bridge";
import { randomSticker } from "./theme";

export function toggleDone(id: string) {
  const t = findTask(id);
  const wasDone = !!t?.done;
  if (!wasDone) haptic("confirm");
  mutate(id, (x) => { x.done = !x.done; x.completedAt = x.done ? Date.now() : null; });
  if (t && !wasDone) showToast(`✓ Done ${randomSticker()}`, "Undo", () => mutate(id, (x) => { x.done = false; x.completedAt = null; }));
}

export function setStatus(id: string, v: "active" | "someday" | "done") {
  if (v === "done") {
    const t = findTask(id);
    if (t && !t.done) {
      mutate(id, (x) => { x.done = true; x.completedAt = Date.now(); });
      showToast(`✓ Done ${randomSticker()}`, "Undo", () => mutate(id, (x) => { x.done = false; x.completedAt = null; }));
    }
  } else {
    mutate(id, (x) => { if (x.done) { x.done = false; x.completedAt = null; } x.bucket = v; });
  }
  queuePrioritize();
}

export function boardMove(id: string, colKey: "todo" | "today" | "someday" | "done") {
  const t = findTask(id);
  if (!t) return;
  const today = localKey();
  haptic("tap");
  if (colKey === "done") {
    if (!t.done) {
      mutate(id, (x) => { x.done = true; x.completedAt = Date.now(); });
      showToast(`✓ Done ${randomSticker()}`, "Undo", () => mutate(id, (x) => { x.done = false; x.completedAt = null; }));
    }
    return;
  }
  mutate(id, (x) => {
    if (x.done) { x.done = false; x.completedAt = null; }
    if (colKey === "someday") x.bucket = "someday";
    else if (colKey === "today") { x.bucket = "active"; x.due = today; }
    else { x.bucket = "active"; if (x.due === today) x.due = null; }
  });
  queuePrioritize();
}

export function deleteTask(id: string) {
  mutate(id, (t) => { t.deleted = true; });
  showToast("Deleted", "Undo", () => mutate(id, (t) => { t.deleted = false; }));
}

export interface TaskEdit {
  text: string; domain: string; bucket: "active" | "someday" | "done"; due: string | null; time: string | null; important: boolean; pin: boolean;
}
export function saveTaskEdit(id: string, e: TaskEdit) {
  mutate(id, (t) => {
    if (e.text) t.text = e.text;
    if (e.domain) t.domain = e.domain; else delete t.domain;
    t.due = e.due;
    if (e.time) t.time = e.time; else delete t.time;
    t.important = e.important;
    if (e.bucket === "done") { if (!t.done) { t.done = true; t.completedAt = Date.now(); } }
    else { if (t.done) { t.done = false; t.completedAt = null; } t.bucket = e.bucket; }
  });
  const nowPinned = findTask(id)?.pinnedFor === localKey();
  if (e.pin !== nowPinned) pinTask(id, localKey());
  queuePrioritize();
}
