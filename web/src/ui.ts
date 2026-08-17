// Modal state + hardware-back history integration + view navigation. Reproduces the old
// pushModalHistory/dismissModal/popstate contract: opening any modal pushes ONE history entry;
// every UI-driven close consumes it via history.back(); Android's hardware/gesture back triggers
// popstate which closes whichever modal is open (instead of exiting the app).
import { signal } from "@preact/signals";
import { view, q, domFilter } from "./store";
import type { View } from "./types";

export type ModalKind = "task" | "settings" | "week" | "import" | "move";
export interface ModalState {
  kind: ModalKind;
  id?: string; // task id for the editor; task id for the move sheet
}
export const modal = signal<ModalState | null>(null);

let modalOpen = false;
export function openModal(m: ModalState) {
  if (!modalOpen) {
    modalOpen = true;
    history.pushState({ modal: true }, "");
  }
  modal.value = m; // swapping (e.g. settings -> import) reuses the single pushed entry
}
export function dismissModal() {
  modal.value = null;
  if (modalOpen) {
    modalOpen = false;
    history.back(); // consume the pushed entry so back doesn't need two presses
  }
}
addEventListener("popstate", () => {
  modalOpen = false;
  modal.value = null;
});

export function setView(v: View) {
  view.value = v;
}
export function openSearch() {
  view.value = "all";
  // focus handled by the All view's search input on mount
}

/** Jump to a task: switch to Today, find it; if not there, clear filters + go to All, then flash. */
export function jumpToTask(id: string) {
  setView("today");
  const flash = () => {
    let el = document.querySelector<HTMLElement>(`.task[data-id="${id}"]`);
    if (!el) {
      q.value = "";
      domFilter.value = "";
      setView("all");
      setTimeout(() => {
        el = document.querySelector<HTMLElement>(`.task[data-id="${id}"]`);
        if (el) doFlash(el);
      }, 40);
      return;
    }
    doFlash(el);
  };
  setTimeout(flash, 40);
}
function doFlash(el: HTMLElement) {
  el.style.transition = "background .3s";
  el.style.background = "var(--accent-pale)";
  setTimeout(() => (el.style.background = ""), 700);
  el.scrollIntoView({ behavior: "smooth", block: "center" });
}
