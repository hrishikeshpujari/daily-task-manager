import { useEffect } from "preact/hooks";
import { view, paReady, registerHooks, queuePrioritize } from "./store";
import { syncNow } from "./sync";
import { runPrioritize, afterCapture, generateBrief, setPA } from "./pa";
import { applyThemeVars } from "./theme";
import { openModal, openSearch } from "./ui";
import { Sidebar, BottomNav, TopHeader, CaptureBar, StatCards, Aside, Banner, Brief, WrapUp, Toast } from "./components/shell";
import { TodayView, WeekView, BoardView, MonthView, AllView, HistoryView } from "./components/views";
import { ModalHost } from "./components/modals";

// Wire the store's hooks to the sync/pa layer (breaks the import cycle; mirrors the old globals).
registerHooks({ sync: syncNow, prioritize: runPrioritize, afterCapture });
// Apply the theme tokens before first paint (reads config already loaded from localStorage).
applyThemeVars();

function Content() {
  switch (view.value) {
    case "week": return <WeekView />;
    case "board": return <BoardView />;
    case "month": return <MonthView />;
    case "all": return <AllView />;
    case "history": return <HistoryView onWeekly={() => openModal({ kind: "week" })} />;
    default: return <TodayView />;
  }
}

export function App() {
  useEffect(() => {
    const canHover = matchMedia("(hover:hover) and (pointer:fine)").matches;
    // boot: initial sync (no-ops to "local" without a token) + today's brief
    syncNow();
    generateBrief(false);
    if (paReady.value) setPA("ready");
    if (canHover) document.getElementById("captureInput")?.focus();

    const onOnline = () => { syncNow(); queuePrioritize(); };
    const onVisible = () => { if (document.visibilityState === "visible") { syncNow(); generateBrief(false); } };
    const onFocus = () => { if (canHover && document.activeElement === document.body) document.getElementById("captureInput")?.focus(); };
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && (e.key === "j" || e.key === "J")) { e.preventDefault(); const i = document.getElementById("captureInput"); i?.scrollIntoView({ block: "start", behavior: "smooth" }); i?.focus(); }
      else if ((e.ctrlKey || e.metaKey) && (e.key === "k" || e.key === "K")) { e.preventDefault(); openSearch(); }
    };
    addEventListener("online", onOnline);
    addEventListener("visibilitychange", onVisible);
    addEventListener("focus", onFocus);
    addEventListener("keydown", onKey);
    return () => {
      removeEventListener("online", onOnline);
      removeEventListener("visibilitychange", onVisible);
      removeEventListener("focus", onFocus);
      removeEventListener("keydown", onKey);
    };
  }, []);

  return (
    <>
      <div class="shell">
        <Sidebar />
        <main class="main">
          <TopHeader />
          <CaptureBar />
          <StatCards />
          <section class="layout">
            <div style="min-width:0">
              {view.value === "today" ? <><WrapUp /><Brief /></> : null}
              <Banner />
              {/* keyed by view so it re-mounts and replays the contentIn fade on view change */}
              <div id="content" key={view.value}><Content /></div>
            </div>
            <Aside />
          </section>
        </main>
      </div>
      <BottomNav />
      <ModalHost />
      <Toast />
    </>
  );
}
