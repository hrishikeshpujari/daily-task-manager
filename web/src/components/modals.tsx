import { useState, useEffect } from "preact/hooks";
import type { ComponentChildren } from "preact";
import { modal, dismissModal, openModal } from "../ui";
import { config, saveConfig, findTask, clearBrief } from "../store";
import { localKey, tomorrowKey } from "../scoring";
import { fmtMins } from "../helpers";
import { THEMES, setThemeId, setMode, applyThemeVars } from "../theme";
import { saveTaskEdit, deleteTask, boardMove } from "../actions";
import { generateWeekly, weeklyText, importNow, runPrioritize, generateBrief } from "../pa";
import { syncNow } from "../sync";

/** Backdrop that plays the enter transition (mount at opacity0, add .on next tick). Unmounts on
 *  close (exit is instant — acceptable; enter is the noticeable one). Backdrop click closes. */
function ModalBackdrop({ sheet, onClose, children }: { sheet?: boolean; onClose: () => void; children: ComponentChildren }) {
  const [shown, setShown] = useState(false);
  useEffect(() => { const id = setTimeout(() => setShown(true), 10); return () => clearTimeout(id); }, []);
  return (
    <div class={`modal-backdrop${sheet ? " sheet-backdrop" : ""}${shown ? " on" : ""}`} onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      {children}
    </div>
  );
}

function TaskEditor({ id }: { id: string }) {
  const t = findTask(id);
  const [title, setTitle] = useState(t?.text || "");
  const [domain, setDomain] = useState(t?.domain || "");
  const [bucket, setBucket] = useState<"active" | "someday" | "done">(t?.done ? "done" : t?.bucket === "someday" ? "someday" : "active");
  const [due, setDue] = useState(t?.due || "");
  const [time, setTime] = useState(t?.time || "");
  const [important, setImportant] = useState(!!t?.important);
  const [pin, setPin] = useState(t?.pinnedFor === localKey());
  if (!t) return null;
  const why = [t.why ? "✦ " + t.why : "", typeof t.aiPriority === "number" ? "priority " + t.aiPriority : "", fmtMins(t.effortMins) || ""].filter(Boolean).join(" · ");
  const save = (e: Event) => {
    e.preventDefault();
    saveTaskEdit(id, { text: title.trim(), domain: domain.trim(), bucket, due: due || null, time: time || null, important, pin });
    dismissModal();
  };
  return (
    <form class="modal" onSubmit={save}>
      <h2>Task details</h2>
      <div class="form-grid">
        <div class="field full"><label>Task</label><input required value={title} onInput={(e) => setTitle((e.target as HTMLInputElement).value)} /></div>
        <div class="field"><label>Domain</label><input value={domain} placeholder="Home, Work, Health…" onInput={(e) => setDomain((e.target as HTMLInputElement).value)} /></div>
        <div class="field"><label>Status</label><select value={bucket} onChange={(e) => setBucket((e.target as HTMLSelectElement).value as any)}><option value="active">Active</option><option value="someday">Someday</option><option value="done">Done</option></select></div>
        <div class="field"><label>Due date</label><input type="date" value={due} onInput={(e) => setDue((e.target as HTMLInputElement).value)} /></div>
        <div class="field"><label>Time</label><input type="time" value={time} onInput={(e) => setTime((e.target as HTMLInputElement).value)} /></div>
        <div class="field full"><label>Quick due</label><div class="chiprow">
          <button type="button" class="chipbtn" onClick={() => setDue(localKey())}>Today</button>
          <button type="button" class="chipbtn" onClick={() => setDue(tomorrowKey())}>Tomorrow</button>
          <button type="button" class="chipbtn" onClick={() => setDue("")}>No date</button>
          <button type="button" class="chipbtn" onClick={() => setImportant(!important)}>★ Important{important ? " ✓" : ""}</button>
          <button type="button" class="chipbtn" onClick={() => setPin(!pin)}>🎯 Today's #1{pin ? " ✓" : ""}</button>
        </div></div>
        {why ? <div class="field full"><label>Claude's read</label><p class="meta" style="margin:0">{why}</p></div> : null}
      </div>
      <div class="modal-actions">
        <button type="button" class="danger" onClick={() => { deleteTask(id); dismissModal(); }}>Delete task</button>
        <div style="display:flex;gap:8px"><button type="button" class="ghost" onClick={dismissModal}>Cancel</button> <button class="primary" type="submit">Save changes</button></div>
      </div>
    </form>
  );
}

function Settings() {
  const c = config.value;
  const [token, setToken] = useState(c.token);
  const [gistId, setGistId] = useState(c.gistId);
  const [proxyUrl, setProxyUrl] = useState(c.proxyUrl);
  const [appSecret, setAppSecret] = useState(c.appSecret);
  const dark = config.value.mode === "dark";
  const save = () => {
    const cur = config.value;
    cur.token = token.trim(); cur.gistId = gistId.trim(); cur.proxyUrl = proxyUrl.trim(); cur.appSecret = appSecret.trim();
    saveConfig();
    dismissModal();
    syncNow();
    if (cur.proxyUrl && cur.appSecret) { runPrioritize(); generateBrief(false); }
  };
  const disconnect = () => {
    const cur = config.value;
    cur.token = ""; cur.gistId = ""; cur.proxyUrl = ""; cur.appSecret = "";
    saveConfig();
    clearBrief();
    applyThemeVars();
    dismissModal();
  };
  return (
    <div class="modal">
      <h2>Preferences</h2>
      <div class="sec">Cross-device sync</div>
      <div class="field"><label>GitHub token (gist scope)</label><input type="password" value={token} placeholder="github_pat_… or ghp_…" onInput={(e) => setToken((e.target as HTMLInputElement).value)} /></div>
      <div class="field" style="margin-top:10px"><label>Gist ID (optional — auto-discovered)</label><input type="text" value={gistId} placeholder="leave blank; it self-heals" onInput={(e) => setGistId((e.target as HTMLInputElement).value)} /></div>
      <div class="sec">Claude PA (optional)</div>
      <div class="field"><label>Worker URL</label><input type="text" value={proxyUrl} placeholder="https://task-pa.<you>.workers.dev" onInput={(e) => setProxyUrl((e.target as HTMLInputElement).value)} /></div>
      <div class="field" style="margin-top:10px"><label>App secret</label><input type="password" value={appSecret} placeholder="your personal secret from the Worker" onInput={(e) => setAppSecret((e.target as HTMLInputElement).value)} /></div>
      <div class="sec">Theme</div>
      <div class="themegrid">
        {Object.entries(THEMES).map(([id, t]) => {
          const seed = dark ? t.dark : t.light;
          return (
            <button type="button" key={id} class={`themeswatch${id === config.value.theme ? " on" : ""}`} onClick={() => setThemeId(id)}>
              <span class="dot" style={`background:linear-gradient(135deg,${seed.accent2},${seed.accent});border:2px solid ${seed.canvas}`} />
              <span>{t.emoji} {t.label}</span>
              <span class="swatch-stickers">{(t.stickers || []).slice(0, 3).join(" ")}</span>
            </button>
          );
        })}
      </div>
      <div class="sec">Mode</div>
      <div class="chiprow"><button type="button" class="chipbtn" onClick={() => setMode("dark")}>🌙 Night</button><button type="button" class="chipbtn" onClick={() => setMode("light")}>☀️ Day</button></div>
      <div class="sec">Migrate</div>
      <button type="button" class="chipbtn" style="width:100%" onClick={() => openModal({ kind: "import" })}>⇪ Import from Apple Notes / Google Keep</button>
      <div class="modal-actions">
        <button type="button" class="danger" onClick={disconnect}>Disconnect this device</button>
        <div style="display:flex;gap:8px"><button type="button" class="ghost" onClick={dismissModal}>Close</button> <button type="button" class="primary" onClick={save}>Save</button></div>
      </div>
      <p class="help">Token: <a href="https://github.com/settings/tokens/new?scopes=gist" target="_blank" rel="noopener">create one</a> with only the <b>gist</b> scope. PA: deploy the Worker (repo's <b>worker/</b> folder) and paste its URL + your personal secret. Without the PA fields, prioritization uses built-in rules.</p>
    </div>
  );
}

function WeekModal() {
  const [text, setText] = useState("✨ Drafting your weekly summary…");
  useEffect(() => {
    let live = true;
    setText(weeklyText());
    generateWeekly().then((t) => { if (live) setText(t); });
    return () => { live = false; };
  }, []);
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try { await navigator.clipboard.writeText(text); } catch { /* ignore */ }
    setCopied(true); setTimeout(() => setCopied(false), 1500);
  };
  return (
    <div class="modal">
      <h2>Weekly update</h2>
      <div class="field"><textarea spellcheck={false} value={text} onInput={(e) => setText((e.target as HTMLTextAreaElement).value)} /></div>
      <div class="modal-actions"><span></span>
        <div style="display:flex;gap:8px"><button type="button" class="ghost" onClick={dismissModal}>Close</button> <button type="button" class="primary" onClick={copy}>{copied ? "Copied ✓" : "Copy"}</button></div>
      </div>
      <p class="help">Covers what you finished this week + what's in progress. Paste into your Monday manager email; edit before copying.</p>
    </div>
  );
}

function ImportModal() {
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const run = async () => {
    setBusy(true);
    await importNow(text);
    dismissModal();
  };
  return (
    <div class="modal">
      <h2>Import your lists</h2>
      <div class="field"><textarea spellcheck={false} value={text} placeholder="Paste everything — Apple Notes lists, Google Keep, day-name lists with emoji, whatever. Claude sorts it into tasks with dates." onInput={(e) => setText((e.target as HTMLTextAreaElement).value)} /></div>
      <div class="modal-actions"><span></span>
        <div style="display:flex;gap:8px"><button type="button" class="ghost" onClick={dismissModal}>Cancel</button> <button type="button" class="primary" onClick={run}>{busy ? "Importing…" : "Import"}</button></div>
      </div>
      <p class="help">Day names like "Thursday" become the upcoming Thursday. Checked-off items are skipped. Without the PA configured, each line simply becomes a task.</p>
    </div>
  );
}

const MOVE_COLS: { key: "todo" | "today" | "someday" | "done"; label: string }[] = [
  { key: "todo", label: "To do" }, { key: "today", label: "Today" }, { key: "someday", label: "Someday" }, { key: "done", label: "Done" },
];
function MoveSheet({ id }: { id: string }) {
  const t = findTask(id);
  if (!t) return null;
  const cur = t.done ? "done" : t.bucket === "someday" ? "someday" : t.due === localKey() || t.pinnedFor === localKey() ? "today" : "todo";
  return (
    <div class="sheet">
      <div class="sheet-title">Move "{t.text}"</div>
      {MOVE_COLS.map((c) => <button type="button" key={c.key} onClick={() => { boardMove(id, c.key); dismissModal(); }}>{c.label}{c.key === cur ? " · here" : ""}</button>)}
      <button type="button" class="cancel" onClick={dismissModal}>Cancel</button>
    </div>
  );
}

/** Renders whichever modal is open (keyed so it remounts with fresh state per open). */
export function ModalHost() {
  const m = modal.value;
  if (!m) return null;
  if (m.kind === "move") return <ModalBackdrop sheet onClose={dismissModal}><MoveSheet id={m.id!} key={m.id} /></ModalBackdrop>;
  return (
    <ModalBackdrop onClose={dismissModal}>
      {m.kind === "task" ? <TaskEditor id={m.id!} key={m.id} /> : null}
      {m.kind === "settings" ? <Settings /> : null}
      {m.kind === "week" ? <WeekModal /> : null}
      {m.kind === "import" ? <ImportModal /> : null}
    </ModalBackdrop>
  );
}
