// GitHub Gist sync — self-healing multi-gist discovery + per-task last-write-wins merge.
// Ported from the current app; the gist file shape {v:1,tasks,theme,mode,themeUpdatedAt},
// the merge rule (LWW by updatedAt, LOCAL WINS TIES via >=, 365-day tombstone purge), and the
// canonical = oldest-by-created_at convergence are a hard contract shared with the Worker and
// the Android app — do not drift.

import type { Task } from "./types";
import {
  config, tasks, saveTasks, saveConfig, GIST_FILE, syncState, lastSync, type SyncState,
} from "./store";
import { mergeTasks } from "./merge";
import { THEMES, applyThemeVars } from "./theme";

export { mergeTasks };

const API = "https://api.github.com/gists";

function setSync(s: SyncState) {
  syncState.value = s;
}

async function gh(url: string, opts: RequestInit = {}): Promise<any> {
  const h: Record<string, string> = { Accept: "application/vnd.github+json", ...(opts.headers as Record<string, string>) };
  if (config.value.token) h.Authorization = "Bearer " + config.value.token;
  const res = await fetch(url, { ...opts, headers: h });
  if (!res.ok) throw new Error("GitHub " + res.status + ": " + (await res.text()).slice(0, 160));
  return res.json();
}

interface FoundGist {
  id: string;
  created: string;
  tasks: Task[];
  theme: string | null;
  mode: string | null;
  themeUpdatedAt: number;
}

async function discoverAppGists(): Promise<FoundGist[]> {
  const list = await gh(`${API}?per_page=100`);
  const matches = ((list as any[]) || []).filter((g) => g.files && g.files[GIST_FILE]);
  const out: FoundGist[] = [];
  for (const mm of matches) {
    let t: Task[] = [], theme: string | null = null, mode: string | null = null, themeUpdatedAt = 0;
    try {
      const g = await gh(`${API}/${mm.id}`);
      const f = g.files[GIST_FILE];
      let c = f.content;
      if (f.truncated && f.raw_url) c = await (await fetch(f.raw_url)).text();
      const p = JSON.parse(c);
      t = p.tasks || [];
      theme = p.theme || null;
      mode = p.mode || null;
      themeUpdatedAt = p.themeUpdatedAt || 0;
    } catch {}
    out.push({ id: mm.id, created: mm.created_at || "", tasks: t, theme, mode, themeUpdatedAt });
  }
  return out;
}

/** Theme LWW: adopt remote theme/mode only when strictly newer than ours. */
function adoptRemoteTheme(theme: string | null, mode: string | null, updatedAt: number) {
  if (!updatedAt || updatedAt <= (config.value.themeUpdatedAt || 0)) return;
  const c = config.value;
  if (theme && THEMES[theme]) c.theme = theme;
  if (mode === "light" || mode === "dark") c.mode = mode;
  c.themeUpdatedAt = updatedAt;
  saveConfig();
  applyThemeVars();
}

const bodyFor = () =>
  JSON.stringify({
    files: {
      [GIST_FILE]: {
        content: JSON.stringify(
          { v: 1, tasks: tasks.value, theme: config.value.theme, mode: config.value.mode, themeUpdatedAt: config.value.themeUpdatedAt },
          null,
          2
        ),
      },
    },
  });

let fullSynced = false;
let syncing = false;
let pending = false;

async function fullSync() {
  const found = await discoverAppGists();
  let merged = tasks.value;
  for (const g of found) merged = mergeTasks(merged, g.tasks);
  tasks.value = merged;
  saveTasks();
  let bestAt = 0, best: FoundGist | null = null;
  for (const g of found) if (g.themeUpdatedAt > bestAt) { bestAt = g.themeUpdatedAt; best = g; }
  if (best) adoptRemoteTheme(best.theme, best.mode, best.themeUpdatedAt);
  // canonical = oldest by created_at, tiebreak smallest id — the single convergence target
  let canonical = "";
  if (found.length) {
    const s = found.slice().sort((a, b) => (a.created < b.created ? -1 : a.created > b.created ? 1 : a.id < b.id ? -1 : 1));
    canonical = s[0].id;
  }
  if (canonical) {
    await gh(`${API}/${canonical}`, { method: "PATCH", body: bodyFor() });
  } else {
    const g = await gh(API, {
      method: "POST",
      body: JSON.stringify({ description: "Daily Task Manager data", public: false, files: { [GIST_FILE]: { content: JSON.stringify({ v: 1, tasks: merged }, null, 2) } } }),
    });
    canonical = g.id;
  }
  if (canonical !== config.value.gistId) {
    config.value.gistId = canonical;
    saveConfig();
  }
}

async function fastSync() {
  const g = await gh(`${API}/${config.value.gistId}`);
  const f = g.files && g.files[GIST_FILE];
  let remote: Task[] = [], rTheme: string | null = null, rMode: string | null = null, rAt = 0;
  if (f) {
    let c = f.content;
    if (f.truncated && f.raw_url) c = await (await fetch(f.raw_url)).text();
    try {
      const p = JSON.parse(c);
      remote = p.tasks || [];
      rTheme = p.theme || null;
      rMode = p.mode || null;
      rAt = p.themeUpdatedAt || 0;
    } catch {}
  }
  tasks.value = mergeTasks(tasks.value, remote);
  saveTasks();
  adoptRemoteTheme(rTheme, rMode, rAt);
  await gh(`${API}/${config.value.gistId}`, { method: "PATCH", body: bodyFor() });
}

export async function syncNow() {
  if (!config.value.token) { setSync("local"); return; }
  if (!navigator.onLine) { setSync("offline"); return; }
  if (syncing) { pending = true; return; }
  syncing = true;
  setSync("syncing");
  try {
    if (config.value.gistId && fullSynced) {
      try { await fastSync(); }
      catch { fullSynced = false; await fullSync(); fullSynced = true; }
    } else {
      await fullSync();
      fullSynced = true;
    }
    lastSync.value = Date.now();
    setSync("synced");
  } catch (err) {
    console.error(err);
    setSync("error");
  } finally {
    syncing = false;
    if (pending) { pending = false; }
  }
}
