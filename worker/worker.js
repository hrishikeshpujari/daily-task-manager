// Cloudflare Worker — hub for the task manager. Three jobs:
//   1) POST /            generic Claude relay for the web app ({system, prompt, max_tokens})
//   2) POST /capture     phone-side capture: raw text -> Claude ingest -> written into the
//                        CALLER'S gist (identified by their per-person secret)
//   3) GET  /week        the caller's next 7 days grouped by day — feeds home-screen widgets
//                        (Scriptable on iOS, the Android widget) and Shortcuts
//
// Per-person model: each person has their own secret and their own GitHub gist token, so
// each has a fully separate datastore in the same app. Secrets/tokens live here as env
// secrets — never in a widget script or Shortcut.
//
// Env (Settings → Variables and Secrets):
//   ANTHROPIC_API_KEY  (secret)          — shared Claude key (one payer)
//   MODEL              (var, optional)   — default claude-haiku-4-5-20251001
//   ALLOWED_ORIGINS    (var, optional)   — CSV of browser origins for the relay
//   APP_SECRET         (secret, legacy)  — still accepted for the relay only
//   SECRET_H, GH_TOKEN_H                 — person 1: secret + their gist-scoped GitHub token
//   SECRET_K, GH_TOKEN_K                 — person 2: same
//   GIST_H, GIST_K     (var, optional)   — pin a gist id; else auto-discovered (oldest with the data file)

const GIST_FILE = "daily-tasks.json";

const SYS_INGEST = `You clean up ONE raw task capture (often messy voice-to-text) into a structured task. Input is the raw string plus today's date. Return ONLY JSON, no prose, no fences: {"text":"<clean concise task title, filler words removed>","due":"<YYYY-MM-DD or null>","important":<true|false>,"domain":"<short area label or null>","bucket":"<active|someday>"}. Strip filler (um, uh, like, so, basically). Resolve relative dates against today (tomorrow, tonight, next Monday become a date; if only a clock time is mentioned, use today). Set important:true only if the user signals urgency or importance. Infer domain only if obvious (e.g. Home, Work, Health, Errands, Finance); else null. Use bucket "someday" only for clearly vague someday/maybe ideas; else "active". Stay faithful to intent — if the input is already a clean short task, return it nearly unchanged.`;

export default {
  async fetch(request, env) {
    const allowed = (env.ALLOWED_ORIGINS || "https://hrishikeshpujari.github.io,http://localhost:4178")
      .split(",").map(s => s.trim());
    const origin = request.headers.get("Origin") || "";
    const cors = {
      "Access-Control-Allow-Origin": allowed.includes(origin) ? origin : allowed[0],
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, x-app-secret",
      "Vary": "Origin",
    };
    if (request.method === "OPTIONS") return new Response(null, { headers: cors });

    const url = new URL(request.url);
    const secret = request.headers.get("x-app-secret") || url.searchParams.get("s") || "";
    const user = resolveUser(env, secret);
    const relayOk = user || (env.APP_SECRET && secret === env.APP_SECRET);

    try {
      if (url.pathname === "/capture" && request.method === "POST") {
        if (!user) return json({ error: "unauthorized: /capture needs a per-person secret" }, 401, cors);
        let body; try { body = await request.json(); } catch { return json({ error: "bad json" }, 400, cors); }
        const raw = String(body.text || "").trim();
        if (!raw) return json({ error: "empty text" }, 400, cors);
        const today = localDateStr(body.tz || "America/Los_Angeles");

        let fields = { text: raw, due: null, important: false, domain: null, bucket: "active" };
        try {
          const ai = parseLoose(await claude(env, SYS_INGEST, "Today is " + today + ". Raw capture:\n" + raw, 400));
          if (ai) {
            if (ai.text && String(ai.text).trim()) fields.text = String(ai.text).trim();
            if (ai.due && /^\d{4}-\d{2}-\d{2}$/.test(ai.due)) fields.due = ai.due;
            if (typeof ai.important === "boolean") fields.important = ai.important;
            if (ai.domain && String(ai.domain).trim() && String(ai.domain).toLowerCase() !== "null") fields.domain = String(ai.domain).trim();
            if (ai.bucket === "someday") fields.bucket = "someday";
          }
        } catch (e) { /* AI down -> save the raw text as-is; capture must never fail */ }

        const now = Date.now();
        const task = {
          id: "t_" + now.toString(36) + Math.random().toString(36).slice(2, 7),
          text: fields.text, createdAt: now, updatedAt: now, due: fields.due,
          important: fields.important, done: false, completedAt: null,
          bucket: fields.bucket, deleted: false,
        };
        if (fields.domain) task.domain = fields.domain;

        const { gistId, tasks } = await loadTasks(env, user);
        tasks.push(task);
        await saveTasks(user, gistId, tasks);
        return json({ ok: true, task }, 200, cors);
      }

      if (url.pathname === "/week" && request.method === "GET") {
        if (!user) return json({ error: "unauthorized: /week needs a per-person secret" }, 401, cors);
        const tz = url.searchParams.get("tz") || "America/Los_Angeles";
        const { tasks } = await loadTasks(env, user);
        return json(weekView(tasks, tz), 200, cors);
      }

      // default: generic Claude relay (legacy shape, unchanged for the web app)
      if (request.method !== "POST") return json({ error: "POST only" }, 405, cors);
      if (!relayOk) return json({ error: "unauthorized" }, 401, cors);
      let body; try { body = await request.json(); } catch { return json({ error: "bad json" }, 400, cors); }
      const text = await claude(env, String(body.system || ""), String(body.prompt || ""),
        Math.min(Math.max(parseInt(body.max_tokens, 10) || 1024, 64), 4096));
      return json({ result: text }, 200, cors);
    } catch (e) {
      return json({ error: String(e && e.message || e) }, 502, cors);
    }
  },
};

function resolveUser(env, secret) {
  if (!secret) return null;
  if (env.SECRET_H && secret === env.SECRET_H && env.GH_TOKEN_H)
    return { name: "H", token: env.GH_TOKEN_H, gistId: env.GIST_H || "" };
  if (env.SECRET_K && secret === env.SECRET_K && env.GH_TOKEN_K)
    return { name: "K", token: env.GH_TOKEN_K, gistId: env.GIST_K || "" };
  return null;
}

async function claude(env, system, prompt, maxTokens) {
  const resp = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": env.ANTHROPIC_API_KEY,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: env.MODEL || "claude-haiku-4-5-20251001",
      max_tokens: maxTokens, system,
      messages: [{ role: "user", content: prompt }],
    }),
  });
  if (!resp.ok) throw new Error("anthropic " + resp.status + ": " + (await resp.text()).slice(0, 200));
  const data = await resp.json();
  return (data.content || []).map(c => c.text || "").join("");
}

function parseLoose(s) {
  let t = String(s || "").trim();
  const a = t.indexOf("{"), b = t.lastIndexOf("}");
  if (a >= 0 && b > a) t = t.slice(a, b + 1);
  try { return JSON.parse(t); } catch { return null; }
}

async function gh(token, url, method, body) {
  const r = await fetch(url, {
    method: method || "GET",
    headers: {
      "Accept": "application/vnd.github+json",
      "Authorization": "Bearer " + token,
      "User-Agent": "task-pa-worker",
      ...(body ? { "content-type": "application/json" } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!r.ok) throw new Error("github " + r.status);
  return r.json();
}

async function loadTasks(env, user) {
  let gistId = user.gistId;
  if (!gistId) {
    const list = await gh(user.token, "https://api.github.com/gists?per_page=100");
    const withFile = (list || []).filter(g => g.files && g.files[GIST_FILE])
      .sort((a, b) => a.created_at < b.created_at ? -1 : a.created_at > b.created_at ? 1 : (a.id < b.id ? -1 : 1));
    if (withFile.length) gistId = withFile[0].id;
  }
  if (!gistId) {
    const g = await gh(user.token, "https://api.github.com/gists", "POST", {
      description: "Daily Task Manager data", public: false,
      files: { [GIST_FILE]: { content: JSON.stringify({ v: 1, tasks: [] }, null, 2) } },
    });
    return { gistId: g.id, tasks: [] };
  }
  const g = await gh(user.token, "https://api.github.com/gists/" + gistId);
  const f = g.files && g.files[GIST_FILE];
  let content = f ? f.content : "";
  if (f && f.truncated && f.raw_url) content = await (await fetch(f.raw_url)).text();
  let tasks = [];
  try { tasks = JSON.parse(content).tasks || []; } catch {}
  return { gistId, tasks };
}

async function saveTasks(user, gistId, tasks) {
  await gh(user.token, "https://api.github.com/gists/" + gistId, "PATCH", {
    files: { [GIST_FILE]: { content: JSON.stringify({ v: 1, tasks }, null, 2) } },
  });
}

// ---- /week: the widget feed ----
function localDateStr(tz, offsetDays) {
  const d = new Date(Date.now() + (offsetDays || 0) * 86400000);
  const p = new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit" }).format(d);
  return p; // en-CA formats as YYYY-MM-DD
}
function dayLabel(tz, offsetDays) {
  if (offsetDays === 0) return "Today";
  if (offsetDays === 1) return "Tomorrow";
  return new Intl.DateTimeFormat("en-US", { timeZone: tz, weekday: "long" })
    .format(new Date(Date.now() + offsetDays * 86400000));
}
function weekView(tasks, tz) {
  const open = tasks.filter(t => !t.deleted && !t.done && (t.bucket || "active") === "active");
  const today = localDateStr(tz, 0);
  const score = t => {
    let s = 0;
    if (t.due) { s += t.due < today ? 200 : 50; }
    if (t.important) s += 50;
    if (typeof t.aiPriority === "number") s += t.aiPriority;
    return s;
  };
  const overdue = open.filter(t => t.due && t.due < today)
    .sort((a, b) => a.due < b.due ? -1 : 1)
    .map(slim);
  const days = [];
  for (let i = 0; i < 7; i++) {
    const key = localDateStr(tz, i);
    days.push({
      date: key,
      label: dayLabel(tz, i),
      tasks: open.filter(t => t.due === key).sort((a, b) => score(b) - score(a)).map(slim),
    });
  }
  const dated = new Set([...overdue.map(t => t.id)]);
  days.forEach(d => d.tasks.forEach(t => dated.add(t.id)));
  const unscheduled = open.filter(t => !dated.has(t.id))
    .sort((a, b) => score(b) - score(a)).slice(0, 5).map(slim);
  const doneToday = tasks.filter(t => !t.deleted && t.done && t.completedAt &&
    localDateStrFromMs(t.completedAt, tz) === today).length;
  return { generatedAt: new Date().toISOString(), timeZone: tz, overdue, days, unscheduled, doneToday };
}
function localDateStrFromMs(ms, tz) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(ms));
}
function slim(t) {
  const o = { id: t.id, text: t.text };
  if (t.important) o.important = true;
  if (t.pinnedFor) o.pinnedFor = t.pinnedFor;
  if (t.domain) o.domain = t.domain;
  if (t.due) o.due = t.due;
  if (typeof t.effortMins === "number") o.effortMins = t.effortMins;
  return o;
}

function json(obj, status, cors) {
  return new Response(JSON.stringify(obj), { status, headers: { "content-type": "application/json", ...cors } });
}
