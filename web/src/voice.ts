// Voice capture (Web Speech API — Chrome/Edge/Android; iOS Safari has none and falls back to
// the keyboard mic). Ported from the current app. `listening` drives the .micbtn pulse; the
// captured text goes through the same addTask path so ingest/prioritize fire as usual.
import { signal } from "@preact/signals";
import { addTask, showToast } from "./store";

const SR: any = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
export const listening = signal(false);

export function startVoice(focusInput: () => void) {
  if (!SR) {
    focusInput();
    showToast("No in-app voice here — tap the keyboard's 🎤 instead");
    return;
  }
  let done = false;
  const r = new SR();
  r.lang = navigator.language || "en-US";
  r.interimResults = false;
  r.maxAlternatives = 1;
  listening.value = true;
  r.onresult = (ev: any) => {
    done = true;
    const txt = ev.results[0][0].transcript;
    if (txt && txt.trim()) {
      addTask(txt); // store fires the afterCapture hook (ingest / prioritize) internally
      showToast("🎤 " + txt.trim().slice(0, 60));
    }
  };
  r.onerror = (ev: any) => {
    done = true;
    showToast(ev.error === "not-allowed" ? "Mic permission denied — allow it in the browser" : "🎤 Didn't catch that — try again");
  };
  r.onend = () => {
    listening.value = false;
    if (!done) showToast("🎤 Didn't catch that — try again");
  };
  try { r.start(); } catch { listening.value = false; }
}
