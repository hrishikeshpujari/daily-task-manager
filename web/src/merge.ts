// Per-task last-write-wins merge — the heart of cross-device sync. Extracted into its own
// pure module (no store/DOM deps) so it's node-testable in isolation. Shared contract with the
// Worker + Android: seed remote first, LOCAL WINS TIES (>=), drop tombstones older than 365d.
import type { Task } from "./types";
import { DAY } from "./scoring";

export function mergeTasks(localArr: Task[], remoteArr: Task[]): Task[] {
  const m = new Map<string, Task>();
  remoteArr.forEach((t) => m.set(t.id, t));
  localArr.forEach((t) => {
    const e = m.get(t.id);
    if (!e || (t.updatedAt || 0) >= (e.updatedAt || 0)) m.set(t.id, t);
  });
  const cutoff = Date.now() - 365 * DAY;
  return [...m.values()].filter((t) => !(t.deleted && (t.updatedAt || 0) < cutoff));
}
