// Parity harness for the sync merge: runs the CURRENT app's actual mergeTasks (verbatim from
// index.html) against the ported merge.ts over hundreds of random local/remote scenarios —
// including updatedAt ties (local must win), tombstones above/below the 365-day cutoff, and
// ids present in only one side. Asserts the output arrays are byte-identical. run-parity.sh
// transpiles merge.ts to ./.parity/merge.mjs first.
import { mergeTasks as NEW } from "./.parity/merge.mjs";

const DAY = 86400000;
// --- OLD (verbatim from live index.html) ---
function OLD(localArr, remoteArr) {
  const m = new Map();
  remoteArr.forEach((t) => m.set(t.id, t));
  localArr.forEach((t) => { const e = m.get(t.id); if (!e || (t.updatedAt || 0) >= (e.updatedAt || 0)) m.set(t.id, t); });
  const cutoff = Date.now() - 365 * DAY;
  return [...m.values()].filter((t) => !(t.deleted && (t.updatedAt || 0) < cutoff));
}

const now = Date.now();
// updatedAt pool: fresh, equal-tie value, and two well clear of the 365d boundary (avoid
// straddling the cutoff by exact ms so old/new Date.now() skew can't flip a single case).
const updPool = [now, now - 1000, now - 100 * DAY, now - 400 * DAY];
const rnd = (a) => a[Math.floor(Math.random() * a.length)];
function mkTask(id, upd, deleted) {
  return { id, text: id + "@" + upd, createdAt: 0, updatedAt: upd, due: null, important: false, done: false, completedAt: null, bucket: "active", deleted };
}

let scenarios = 0, mismatches = 0;
for (let s = 0; s < 2000; s++) {
  const nIds = 1 + Math.floor(Math.random() * 5);
  const local = [], remote = [];
  for (let i = 0; i < nIds; i++) {
    const id = "id" + i;
    const inLocal = Math.random() < 0.75, inRemote = Math.random() < 0.75;
    if (inLocal) local.push(mkTask(id, rnd(updPool), Math.random() < 0.3));
    if (inRemote) remote.push(mkTask(id, rnd(updPool), Math.random() < 0.3));
  }
  scenarios++;
  const a = JSON.stringify(OLD(local, remote));
  const b = JSON.stringify(NEW(local, remote));
  if (a !== b) {
    mismatches++;
    if (mismatches <= 5) console.log(`MISMATCH\n old=${a}\n new=${b}\n local=${JSON.stringify(local)}\n remote=${JSON.stringify(remote)}`);
  }
}
console.log(`${scenarios} scenarios, ${mismatches} mismatches`);
process.exit(mismatches === 0 ? 0 : 1);
