// Tasks PA — iOS home-screen widget (Scriptable)
// Shows your week as cute day cards, fed by your own private task data.
//
// ── SETUP (2 minutes) ──────────────────────────────────────────────
// 1) Fill in the two values below (from the person who runs the Worker).
// 2) In Scriptable: + → paste this whole file → name it "Tasks PA".
// 3) Long-press home screen → + → Scriptable → pick a size → add,
//    then long-press the widget → Edit Widget → Script: "Tasks PA".
// Small = today · Medium = next few days · Large = the whole week.
// Tapping the widget opens the app.

const WORKER_URL = "https://task-pa.hrishikesh-pujari.workers.dev"; // no trailing slash
const SECRET     = "PASTE-YOUR-PERSONAL-SECRET-HERE";               // your secret (not a GitHub token)
const APP_URL    = "https://hrishikeshpujari.github.io/daily-task-manager/";
const TZ         = "America/Los_Angeles";

// ── Theme palette — mirrors the web app's THEMES catalog (index.html) seed-for-seed,
// including the contrast-corrected dark accents, using the SAME mix() derivation so this
// widget renders identically to the web app and the Android widget for a given theme+mode.
// Falls back to "screener"/light when the Worker hasn't returned theme/mode yet.
function hexToRgb(h){ h=h.replace("#",""); if(h.length===3) h=h.split("").map(c=>c+c).join(""); const n=parseInt(h,16); return [(n>>16)&255,(n>>8)&255,n&255]; }
function rgbToHex(r,g,b){ return "#"+[r,g,b].map(v=>Math.max(0,Math.min(255,Math.round(v))).toString(16).padStart(2,"0")).join(""); }
function mix(a,b,t){ const p=hexToRgb(a),q=hexToRgb(b); return rgbToHex(p[0]+(q[0]-p[0])*t,p[1]+(q[1]-p[1])*t,p[2]+(q[2]-p[2])*t); }
const THEME_SEEDS = {
  screener:{light:{ink:"#231f1a",canvas:"#f9f7f2",accent:"#b82e4e"},dark:{ink:"#f3ede4",canvas:"#1a1613",accent:"#cf4d6a"}},
  summer:{light:{ink:"#1c3a3a",canvas:"#fdf8ec",accent:"#b5501a"},dark:{ink:"#eaf6f4",canvas:"#0e2626",accent:"#c76825"}},
  fall:{light:{ink:"#2e1f14",canvas:"#faf3e7",accent:"#ad5717"},dark:{ink:"#f3e6d6",canvas:"#1f150e",accent:"#c06f29"}},
  winter:{light:{ink:"#1b2733",canvas:"#f3f8fc",accent:"#2f7fd1"},dark:{ink:"#e9f2fa",canvas:"#101823",accent:"#4a89bd"}},
  spring:{light:{ink:"#243318",canvas:"#f6faf0",accent:"#3f8530"},dark:{ink:"#eaf5e2",canvas:"#141f10",accent:"#539340"}},
  halloween:{light:{ink:"#20141f",canvas:"#f2e9da",accent:"#a8540c"},dark:{ink:"#f1e6d8",canvas:"#0f0a14",accent:"#c7691b"}},
  christmas:{light:{ink:"#1b2b1f",canvas:"#f7f5ef",accent:"#b3261e"},dark:{ink:"#eef0ea",canvas:"#0e1a12",accent:"#e2564a"}},
  diwali:{light:{ink:"#2b170f",canvas:"#fdf6e8",accent:"#95611a"},dark:{ink:"#f7ead0",canvas:"#1c0f0a",accent:"#ac7628"}},
  fun:{light:{ink:"#241a3d",canvas:"#fbf7ff",accent:"#7c3aed"},dark:{ink:"#f3ecff",canvas:"#160f26",accent:"#8f77d7"}},
  girly:{light:{ink:"#3d1f2e",canvas:"#fff5f8",accent:"#c23d78"},dark:{ink:"#fbe4ef",canvas:"#230f1a",accent:"#d15698"}},
  boyish:{light:{ink:"#101c2c",canvas:"#f3f6f9",accent:"#2255c9"},dark:{ink:"#e6edf5",canvas:"#0a121e",accent:"#527ed9"}},
  professional:{light:{ink:"#20242b",canvas:"#f5f6f7",accent:"#33475b"},dark:{ink:"#e8eaed",canvas:"#15181c",accent:"#70859a"}},
  tech:{light:{ink:"#0d1b12",canvas:"#f1f7f2",accent:"#138c40"},dark:{ink:"#d7ffe4",canvas:"#0a0f0d",accent:"#1e9a50"}},
};
function paletteFor(themeId, mode) {
  const t = THEME_SEEDS[themeId] || THEME_SEEDS.screener;
  const dark = mode === "dark";
  const seed = dark ? t.dark : t.light;
  const paper = dark ? mix(seed.canvas, seed.ink, 0.07) : mix(seed.canvas, "#ffffff", 0.8);
  const muted = dark ? mix(seed.ink, seed.canvas, 0.45) : mix(seed.ink, seed.canvas, 0.56);
  return { bg: paper, text: seed.ink, dim: muted, accent: seed.accent, done: dark ? "#5cc98d" : "#2f7d52" };
}
// Fallback defaults (screener/light) — reassigned below once /week returns theme+mode.
let BG = "#FFFFFF", TEXT = "#231f1a", DIM = "#847a71", DONE = "#2f7d52", BRAND = "#b82e4e";

// Same pools as the web app's THEMES catalog — one sticker in the widget title per render.
const STICKER_POOLS = {
  screener: ["✅","✨","⭐","📌","📎","🔖"],
  summer: ["☀️","🍉","🍹","🕶️","🏖️","🌊","🍦","🐚","🌺"],
  fall: ["🍂","🎃","🦃","🌰","🍁","🧣","☕","🍎","🦔"],
  winter: ["❄️","⛄","☃️","🧣","🧤","🦌","🌨️","🧦","🔥"],
  spring: ["🌸","🌷","🐝","🦋","🌱","🐣","🌼","🐇","🌦️"],
  halloween: ["🎃","👻","🕸️","🦇","🍬","🕷️","💀","🧙","🌙"],
  christmas: ["🎄","🎅","❄️","🔔","🎁","⛄","🦌","🕯️","⭐"],
  diwali: ["🪔","✨","🎇","🌟","🕉️","💐","🎆","🧨","🙏"],
  fun: ["🎉","🎊","🌈","🎈","🦄","✨","🍭","🎨","🥳"],
  girly: ["🎀","💅","💖","🌸","✨","👛","💋","🩰","🦄","💄","👗","💕"],
  boyish: ["⚡","🏀","🎮","🚀","🔥","🏈","🤘","🛹","🥇"],
  professional: ["📎","📊","💼","📈","✅","🖇️","📅"],
  tech: ["💻","🖥️","⌨️","🔌","🤖","👾","🛰️","🔋","📡"],
};
function randomSticker(themeId) {
  const pool = STICKER_POOLS[themeId] || STICKER_POOLS.screener;
  return pool[Math.floor(Math.random() * pool.length)];
}
const DAY_STYLE = {
  Monday:    { c: "#e0443e", e: "🚗" },
  Tuesday:   { c: "#e78f2e", e: "🦁" },
  Wednesday: { c: "#3f9c48", e: "🥑" },
  Thursday:  { c: "#3f7fd9", e: "🦋" },
  Friday:    { c: "#e05d84", e: "🎟" },
  Saturday:  { c: "#9a5fd8", e: "🌸" },
  Sunday:    { c: "#2ba39a", e: "☀️" },
  Today:     { c: "#e0443e", e: "⭐" },
  Tomorrow:  { c: "#e78f2e", e: "✨" },
};

async function fetchWeek() {
  const fm = FileManager.local();
  const cachePath = fm.joinPath(fm.documentsDirectory(), "taskspa-week.json");
  try {
    const req = new Request(`${WORKER_URL}/week?tz=${encodeURIComponent(TZ)}`);
    req.headers = { "x-app-secret": SECRET };
    req.timeoutInterval = 15;
    const data = await req.loadJSON();
    if (data && data.days) { fm.writeString(cachePath, JSON.stringify(data)); return data; }
  } catch (e) {}
  if (fm.fileExists(cachePath)) { try { return JSON.parse(fm.readString(cachePath)); } catch (e) {} }
  return null;
}

const DOMAIN_EMOJI = { home:"🏠", work:"💼", health:"🏋️", errands:"🛒", shopping:"🛒", groceries:"🛒", finance:"💳", personal:"💜", travel:"✈️", family:"👪", social:"🎉", fitness:"🏋️" };
function tierColor(t) {
  if (t.important) return "#bf3737";
  if (typeof t.aiPriority === "number")
    return t.aiPriority >= 70 ? "#bf3737" : t.aiPriority >= 40 ? "#a07417" : "#2f7d52";
  return DIM;
}
function fmtTime(hm) {
  if (!hm || !/^\d{2}:\d{2}$/.test(hm)) return null;
  const h = +hm.slice(0, 2), m = hm.slice(3);
  return (((h + 11) % 12) + 1) + ":" + m + (h >= 12 ? " PM" : " AM");
}
function addTaskLine(stack, t, size) {
  const row = stack.addStack();
  row.centerAlignContent();
  const dot = row.addText(t.pinnedFor ? "🎯 " : "● ");
  dot.font = Font.systemFont(size === "large" ? 11 : 10);
  if (!t.pinnedFor) dot.textColor = new Color(tierColor(t));
  const em = DOMAIN_EMOJI[(t.domain || "").toLowerCase()];
  const txt = row.addText((em ? em + " " : "") + t.text);
  txt.font = Font.systemFont(size === "large" ? 13 : 12);
  txt.textColor = new Color(TEXT);
  txt.lineLimit = 1;
  const tm = fmtTime(t.time);
  if (tm) {
    row.addSpacer(4);
    const time = row.addText(tm);
    time.font = Font.systemFont(size === "large" ? 11 : 10);
    time.textColor = new Color(DIM);
  }
  stack.addSpacer(3);
}

function addDayHeader(stack, label, count, size) {
  const st = DAY_STYLE[label] || { c: TEXT, e: "" };
  const row = stack.addStack();
  row.centerAlignContent();
  const name = row.addText(`${label} ${st.e}`);
  name.font = Font.boldSystemFont(size === "large" ? 14 : 13);
  name.textColor = new Color(st.c);
  row.addSpacer();
  const n = row.addText(String(count));
  n.font = Font.boldSystemFont(size === "large" ? 14 : 13);
  n.textColor = new Color(count ? TEXT : DIM);
  stack.addSpacer(3);
}

function build(data) {
  const w = new ListWidget();
  w.backgroundColor = new Color(BG);
  w.url = APP_URL;
  w.setPadding(14, 14, 12, 14);
  w.refreshAfterDate = new Date(Date.now() + 10 * 60 * 1000);

  const size = config.widgetFamily || "medium";

  if (!data) {
    const t = w.addText("Open the app once, then check the widget setup 🌸");
    t.font = Font.systemFont(13); t.textColor = new Color(DIM);
    return w;
  }

  // header
  const head = w.addStack();
  head.centerAlignContent();
  const title = head.addText((size === "small" ? "Today" : "This week") + " " + randomSticker(data && data.theme));
  title.font = Font.boldSystemFont(15);
  title.textColor = new Color(TEXT);
  head.addSpacer();
  if (data.doneToday > 0) {
    const d = head.addText(`✓ ${data.doneToday}`);
    d.font = Font.boldSystemFont(13);
    d.textColor = new Color(DONE);
  } else {
    const brandDot = head.addText("●");
    brandDot.font = Font.systemFont(10);
    brandDot.textColor = new Color(BRAND);
  }
  w.addSpacer(8);

  const days = data.days || [];
  const overdue = data.overdue || [];

  if (overdue.length) {
    addDayHeader(w, "Overdue", overdue.length, size);
    for (const t of overdue.slice(0, size === "small" ? 1 : 2)) addTaskLine(w, t, size);
    w.addSpacer(5);
  }

  const maxDays  = size === "large" ? 7 : size === "medium" ? 3 : 1;
  const maxTasks = size === "large" ? 3 : 2;
  let shownAny = false;
  for (const day of days.slice(0, maxDays)) {
    if (size !== "large" && !day.tasks.length && day.label !== "Today") continue;
    addDayHeader(w, day.label, day.tasks.length, size);
    if (day.tasks.length) { for (const t of day.tasks.slice(0, maxTasks)) addTaskLine(w, t, size); shownAny = true; }
    else if (day.label === "Today" || size === "large") {
      const t = w.addText("nothing planned ✧");
      t.font = Font.italicSystemFont(11); t.textColor = new Color(DIM);
      w.addSpacer(3);
    }
    w.addSpacer(5);
  }

  if (!shownAny && !overdue.length && data.unscheduled && data.unscheduled.length) {
    addDayHeader(w, "Up next", data.unscheduled.length, size);
    for (const t of data.unscheduled.slice(0, maxTasks)) addTaskLine(w, t, size);
  }

  w.addSpacer();
  return w;
}

// ── Day widgets (the Reminders-grid look) ─────────────────────────
// Add several SMALL widgets and set each one's Parameter (long-press the widget →
// Edit Widget → Parameter) to: monday, tuesday, wednesday, thursday, friday,
// saturday, sunday, today, tomorrow, weekend (Sat+Sun combined), or someday.
// Each renders that card. Weekday params always show their own name (e.g. "Monday"),
// even when that day is today/tomorrow, so a Mon–Sun grid stays stable.
function findDay(data, param) {
  const names = ["sunday","monday","tuesday","wednesday","thursday","friday","saturday"];
  const days = data.days || [];
  if (param === "today") return days[0];
  if (param === "tomorrow") return days[1];
  const target = names.indexOf(param);
  if (target < 0) return null;
  return days.find(d => new Date(d.date + "T12:00:00").getDay() === target) || null;
}
function buildDay(data, param) {
  const w = new ListWidget();
  w.backgroundColor = new Color(BG);
  w.url = APP_URL;
  w.setPadding(14, 14, 12, 14);
  w.refreshAfterDate = new Date(Date.now() + 10 * 60 * 1000);
  const someday = param === "someday";
  const weekend = param === "weekend";
  const cap = (s) => s[0].toUpperCase() + s.slice(1);
  const day = !data ? null
    : someday ? { label: "Someday", tasks: data.unscheduled || [] }
    : weekend ? { label: "Weekend", tasks: [...((findDay(data, "saturday") || {}).tasks || []), ...((findDay(data, "sunday") || {}).tasks || [])] }
    : findDay(data, param);
  // Weekday params always show their own name (stable Mon–Sun grid); today/tomorrow keep the friendly label.
  const isWeekday = ["monday","tuesday","wednesday","thursday","friday","saturday","sunday"].includes(param);
  const label = someday ? "Someday" : weekend ? "Weekend" : isWeekday ? cap(param) : (day ? day.label : cap(param));
  const st = someday ? { c: "#9A5FD8", e: "🌸" }
    : weekend ? { c: "#9A5FD8", e: "🏖️" }
    : (DAY_STYLE[label] || DAY_STYLE[cap(param)] || { c: TEXT, e: "" });
  const head = w.addStack();
  head.centerAlignContent();
  const name = head.addText(`${label} ${st.e} ${randomSticker(data && data.theme)}`);
  name.font = Font.boldSystemFont(15);
  name.textColor = new Color(st.c);
  head.addSpacer();
  const n = head.addText(String(day ? day.tasks.length : 0));
  n.font = Font.boldSystemFont(17);
  n.textColor = new Color(TEXT);
  w.addSpacer(8);
  if (!data) {
    const t = w.addText("Open the app once 🌸");
    t.font = Font.systemFont(12); t.textColor = new Color(DIM);
  } else if (!day || !day.tasks.length) {
    const t = w.addText("No Reminders");
    t.font = Font.systemFont(13); t.textColor = new Color(DIM);
  } else {
    const max = config.widgetFamily === "large" ? 8 : config.widgetFamily === "medium" ? 5 : 4;
    for (const t of day.tasks.slice(0, max)) addTaskLine(w, t, config.widgetFamily || "small");
    if (day.tasks.length > max) {
      const more = w.addText("+" + (day.tasks.length - max) + " more");
      more.font = Font.systemFont(10); more.textColor = new Color(DIM);
    }
  }
  w.addSpacer();
  return w;
}

const PARAM = (args.widgetParameter || "").trim().toLowerCase();
const DAY_PARAMS = ["monday","tuesday","wednesday","thursday","friday","saturday","sunday","today","tomorrow","someday","weekend"];
const data = await fetchWeek();
const pal = paletteFor((data && data.theme) || "screener", (data && data.mode) || "light");
BG = pal.bg; TEXT = pal.text; DIM = pal.dim; DONE = pal.done; BRAND = pal.accent;
const widget = DAY_PARAMS.includes(PARAM) ? buildDay(data, PARAM) : build(data);
if (config.runsInWidget) Script.setWidget(widget);
else await widget.presentMedium();
Script.complete();
