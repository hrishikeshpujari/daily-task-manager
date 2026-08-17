// Parity harness: runs the CURRENT app's actual scoring functions (pasted verbatim from
// index.html lines 483-513) against the ported scoring.ts over a battery of tasks, and asserts
// they never diverge. This is the anti-regression proof for the highest-risk logic. The new
// module is transpiled by run-parity.sh (esbuild) to ./.parity/scoring.mjs before this runs.
import * as NEW from "./.parity/scoring.mjs";

const DAY = 86400000;
// --- OLD (verbatim from the live index.html) ---
const localKey = (ts) => { const d = ts != null ? new Date(ts) : new Date(); return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0"); };
const dueDays = (t) => { if (!t.due) return null; const today = new Date(); today.setHours(0, 0, 0, 0); return Math.round((new Date(t.due + "T00:00:00") - today) / DAY); };
const staleDays = (t) => Math.floor((Date.now() - t.updatedAt) / DAY);
function score(t) { let s = 0; const dd = dueDays(t); if (dd !== null) { if (dd < 0) s += 100 + Math.min(-dd, 30) * 5; else if (dd === 0) s += 80; else if (dd === 1) s += 60; else if (dd <= 3) s += 40; else if (dd <= 7) s += 20; else s += 5; } if (t.important) s += 50; s += Math.min(staleDays(t), 20) * 3; return s; }
const effScore = (t) => { if (t.pinnedFor === localKey()) return 1000; return (typeof t.aiPriority === "number") ? t.aiPriority : Math.min(score(t), 100); };
const tier = (t) => { const p = (typeof t.aiPriority === "number") ? t.aiPriority : Math.min(score(t), 100); return p >= 70 ? "high" : p >= 40 ? "med" : "low"; };

// --- battery: cross every meaningful dimension ---
const today = localKey();
const dueOffsets = [null, -30, -10, -1, 0, 1, 2, 3, 5, 7, 8, 30];
const dateFor = (off) => (off === null ? null : localKey(Date.now() + off * DAY));
const importants = [false, true];
const staleAges = [0, 1 * DAY, 5 * DAY, 25 * DAY];
const pins = [undefined, today, "2000-01-01"];
const ais = [undefined, 0, 1, 39, 40, 69, 70, 100];

let n = 0, fails = 0;
for (const off of dueOffsets)
  for (const important of importants)
    for (const age of staleAges)
      for (const pinnedFor of pins)
        for (const aiPriority of ais) {
          const t = { id: "x", text: "t", createdAt: 0, updatedAt: Date.now() - age, due: dateFor(off), important, done: false, completedAt: null, bucket: "active", deleted: false };
          if (pinnedFor !== undefined) t.pinnedFor = pinnedFor;
          if (aiPriority !== undefined) t.aiPriority = aiPriority;
          const checks = {
            dueDays: [dueDays(t), NEW.dueDays(t)],
            staleDays: [staleDays(t), NEW.staleDays(t)],
            score: [score(t), NEW.score(t)],
            effScore: [effScore(t), NEW.effScore(t)],
            tier: [tier(t), NEW.tier(t)],
          };
          for (const [name, [a, b]] of Object.entries(checks)) {
            n++;
            if (a !== b) { fails++; if (fails <= 10) console.log(`MISMATCH ${name}: old=${a} new=${b} task=${JSON.stringify(t)}`); }
          }
        }
console.log(`${n} checks, ${fails} mismatches`);
process.exit(fails === 0 ? 0 : 1);
