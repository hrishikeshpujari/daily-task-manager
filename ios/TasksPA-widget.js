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

// Screener-app color scheme (matches the web app): ink on white, berry brand.
const BG = "#FFFFFF", TEXT = "#231f1a", DIM = "#847a71", DONE = "#2f7d52", BRAND = "#b82e4e";
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
  w.refreshAfterDate = new Date(Date.now() + 30 * 60 * 1000);

  const size = config.widgetFamily || "medium";

  if (!data) {
    const t = w.addText("Open the app once, then check the widget setup 🌸");
    t.font = Font.systemFont(13); t.textColor = new Color(DIM);
    return w;
  }

  // header
  const head = w.addStack();
  head.centerAlignContent();
  const title = head.addText(size === "small" ? "Today" : "This week");
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
// saturday, sunday, today, or tomorrow. Each renders that day's card.
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
  w.refreshAfterDate = new Date(Date.now() + 30 * 60 * 1000);
  const someday = param === "someday";
  const day = !data ? null
    : someday ? { label: "Someday", tasks: data.unscheduled || [] }
    : findDay(data, param);
  const label = day ? day.label : param[0].toUpperCase() + param.slice(1);
  const st = someday ? { c: "#9A5FD8", e: "🌸" }
    : (DAY_STYLE[label] || DAY_STYLE[param[0].toUpperCase() + param.slice(1)] || { c: TEXT, e: "" });
  const head = w.addStack();
  head.centerAlignContent();
  const name = head.addText(`${label} ${st.e}`);
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
const DAY_PARAMS = ["monday","tuesday","wednesday","thursday","friday","saturday","sunday","today","tomorrow","someday"];
const data = await fetchWeek();
const widget = DAY_PARAMS.includes(PARAM) ? buildDay(data, PARAM) : build(data);
if (config.runsInWidget) Script.setWidget(widget);
else await widget.presentMedium();
Script.complete();
