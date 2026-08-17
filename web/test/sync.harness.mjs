// Sync-engine harness: drives the REAL bundled syncNow() against a MOCKED GitHub API + stubbed
// browser globals — so it verifies discovery -> per-task LWW merge -> canonical(oldest gist)
// convergence -> PATCH wiring end to end, with NO real token and NO network (never test shared
// state with real creds). Bundled by run-sync.sh (esbuild) to ./.parity/sync.mjs.

// --- browser-global stubs (must exist before the dynamic import runs store's module init) ---
const LS = { s: {}, getItem(k) { return k in this.s ? this.s[k] : null; }, setItem(k, v) { this.s[k] = String(v); }, removeItem(k) { delete this.s[k]; } };
globalThis.localStorage = LS;
Object.defineProperty(globalThis, "navigator", { value: { onLine: true }, configurable: true }); // read-only getter in Node 24
globalThis.document = { body: { classList: { toggle() {} }, style: {}, dataset: {} }, documentElement: { style: { setProperty() {} } }, querySelector() { return null; } };

// seed a local task + a token so syncNow actually runs
LS.s["dtm.config"] = JSON.stringify({ token: "FAKE", gistId: "", proxyUrl: "", appSecret: "", theme: "screener", mode: "light", themeUpdatedAt: 0 });
LS.s["dtm.tasks"] = JSON.stringify([{ id: "local1", text: "local task", createdAt: 1, updatedAt: 1000, due: null, important: false, done: false, completedAt: null, bucket: "active", deleted: false }]);

// --- mock GitHub API (two gists; gistA is older -> canonical) ---
const calls = [];
const gistFile = (tasks) => ({ files: { "daily-tasks.json": { content: JSON.stringify({ v: 1, tasks, themeUpdatedAt: 0 }) } } });
globalThis.fetch = async (url, opts = {}) => {
  const method = opts.method || "GET";
  calls.push({ method, url, body: opts.body });
  const json = (o) => ({ ok: true, json: async () => o, text: async () => JSON.stringify(o) });
  if (url.includes("/gists?per_page=100")) return json([
    { id: "gistB", created_at: "2026-02-01T00:00:00Z", files: { "daily-tasks.json": {} } },
    { id: "gistA", created_at: "2026-01-01T00:00:00Z", files: { "daily-tasks.json": {} } },
  ]);
  if (url.endsWith("/gists/gistB")) return json(gistFile([{ id: "remoteB", text: "from B", createdAt: 2, updatedAt: 2000, due: null, important: false, done: false, completedAt: null, bucket: "active", deleted: false }]));
  if (url.endsWith("/gists/gistA")) return json(gistFile([{ id: "remoteA", text: "from A", createdAt: 3, updatedAt: 3000, due: null, important: false, done: false, completedAt: null, bucket: "active", deleted: false }]));
  return json({}); // PATCH responses
};

const sync = await import("./.parity/sync.mjs");
let fails = 0;
const check = (name, cond) => { if (!cond) { fails++; console.log("FAIL:", name); } };

await sync.syncNow();

// discovery hit the list + both gists
check("listed gists", calls.some((c) => c.method === "GET" && c.url.includes("/gists?per_page=100")));
check("read gistA", calls.some((c) => c.url.endsWith("/gists/gistA") && c.method === "GET"));
check("read gistB", calls.some((c) => c.url.endsWith("/gists/gistB") && c.method === "GET"));
// canonical = oldest (gistA) got the PATCH, NOT gistB
const patch = calls.find((c) => c.method === "PATCH");
check("PATCHed canonical=gistA (oldest)", !!patch && patch.url.endsWith("/gists/gistA"));
check("did NOT PATCH gistB", !calls.some((c) => c.method === "PATCH" && c.url.endsWith("/gists/gistB")));
// merged body has all three tasks (local + both remotes), LWW
const merged = patch ? JSON.parse(JSON.parse(patch.body).files["daily-tasks.json"].content).tasks : [];
const ids = merged.map((t) => t.id).sort().join(",");
check("merged all 3 tasks (local1,remoteA,remoteB)", ids === "local1,remoteA,remoteB");
check("PATCH body carries theme/mode/themeUpdatedAt keys", (() => { const c = patch && JSON.parse(JSON.parse(patch.body).files["daily-tasks.json"].content); return c && c.theme === "screener" && c.mode === "light" && "themeUpdatedAt" in c; })());
// config.gistId converged to the canonical
check("config.gistId set to gistA", JSON.parse(LS.s["dtm.config"]).gistId === "gistA");

// second sync should use the fast path (known gist): GET gistA + PATCH gistA, no re-list
const before = calls.length;
await sync.syncNow();
const after = calls.slice(before);
check("fastSync did NOT re-list all gists", !after.some((c) => c.url.includes("?per_page=100")));
check("fastSync GET+PATCH the known gist", after.some((c) => c.method === "GET" && c.url.endsWith("/gists/gistA")) && after.some((c) => c.method === "PATCH" && c.url.endsWith("/gists/gistA")));

console.log(fails === 0 ? "ALL SYNC CHECKS PASSED" : `${fails} FAILURES`);
process.exit(fails === 0 ? 0 : 1);
