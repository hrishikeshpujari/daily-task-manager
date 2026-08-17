// Theme engine — 13 palettes, each derived at runtime from ~4 seed colors so all 26
// theme×mode combinations stay internally consistent. Seed values + mix ratios ported
// EXACTLY from the current app. Semantic colors (green/amber/red/blue) are fixed per mode
// (not per theme) on purpose — they encode priority/status. Sidebar always uses the theme's
// dark derivation. Injected --sb-* safe-area vars are consumed by the CSS (Phase 4), not set
// here. The dead `pattern:"…"` tags are intentionally dropped — patternFor() is authoritative.

import { signal } from "@preact/signals";
import type { ThemeDef } from "./types";
import { config, saveConfig, queueSync, showToast } from "./store";

function hexToRgb(h: string): [number, number, number] {
  h = h.replace("#", "");
  if (h.length === 3) h = h.split("").map((c) => c + c).join("");
  const n = parseInt(h, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
function rgbToHex(r: number, g: number, b: number): string {
  return "#" + [r, g, b].map((v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, "0")).join("");
}
export function mix(a: string, b: string, t: number): string {
  const [ar, ag, ab] = hexToRgb(a), [br, bg, bb] = hexToRgb(b);
  return rgbToHex(ar + (br - ar) * t, ag + (bg - ag) * t, ab + (bb - ab) * t);
}

export const THEMES: Record<string, ThemeDef> = {
  screener: { label: "Original", emoji: "◆", light: { ink: "#231f1a", canvas: "#f9f7f2", accent: "#b82e4e", accent2: "#cf4d6a" }, dark: { ink: "#f3ede4", canvas: "#1a1613", accent: "#cf4d6a", accent2: "#b82e4e" }, stickers: ["✅", "✨", "⭐", "📌", "📎", "🔖"] },
  summer: { label: "Summer", emoji: "☀️", light: { ink: "#1c3a3a", canvas: "#fdf8ec", accent: "#b5501a", accent2: "#00968a" }, dark: { ink: "#eaf6f4", canvas: "#0e2626", accent: "#c76825", accent2: "#2dd4c4" }, stickers: ["☀️", "🍉", "🍹", "🕶️", "🏖️", "🌊", "🍦", "🐚", "🌺"] },
  fall: { label: "Fall", emoji: "🍂", light: { ink: "#2e1f14", canvas: "#faf3e7", accent: "#ad5717", accent2: "#7a2f22" }, dark: { ink: "#f3e6d6", canvas: "#1f150e", accent: "#c06f29", accent2: "#c1543a" }, stickers: ["🍂", "🎃", "🦃", "🌰", "🍁", "🧣", "☕", "🍎", "🦔"] },
  winter: { label: "Winter", emoji: "❄️", light: { ink: "#1b2733", canvas: "#f3f8fc", accent: "#2f7fd1", accent2: "#3f6f8f" }, dark: { ink: "#e9f2fa", canvas: "#101823", accent: "#4a89bd", accent2: "#8fd0e8" }, stickers: ["❄️", "⛄", "☃️", "🧣", "🧤", "🦌", "🌨️", "🧦", "🔥"] },
  spring: { label: "Spring", emoji: "🌸", light: { ink: "#243318", canvas: "#f6faf0", accent: "#3f8530", accent2: "#b04a78" }, dark: { ink: "#eaf5e2", canvas: "#141f10", accent: "#539340", accent2: "#f090b3" }, stickers: ["🌸", "🌷", "🐝", "🦋", "🌱", "🐣", "🌼", "🐇", "🌦️"] },
  halloween: { label: "Halloween", emoji: "🎃", light: { ink: "#20141f", canvas: "#f2e9da", accent: "#a8540c", accent2: "#6b2fa0" }, dark: { ink: "#f1e6d8", canvas: "#0f0a14", accent: "#c7691b", accent2: "#9b5de5" }, stickers: ["🎃", "👻", "🕸️", "🦇", "🍬", "🕷️", "💀", "🧙", "🌙"] },
  christmas: { label: "Christmas", emoji: "🎄", light: { ink: "#1b2b1f", canvas: "#f7f5ef", accent: "#b3261e", accent2: "#1e6b3e" }, dark: { ink: "#eef0ea", canvas: "#0e1a12", accent: "#e2564a", accent2: "#2f9e5c" }, stickers: ["🎄", "🎅", "❄️", "🔔", "🎁", "⛄", "🦌", "🕯️", "⭐"] },
  diwali: { label: "Diwali", emoji: "🪔", light: { ink: "#2b170f", canvas: "#fdf6e8", accent: "#95611a", accent2: "#8a2030" }, dark: { ink: "#f7ead0", canvas: "#1c0f0a", accent: "#ac7628", accent2: "#d1445a" }, stickers: ["🪔", "✨", "🎇", "🌟", "🕉️", "💐", "🎆", "🧨", "🙏"] },
  fun: { label: "Fun", emoji: "🎉", light: { ink: "#241a3d", canvas: "#fbf7ff", accent: "#7c3aed", accent2: "#0891b2" }, dark: { ink: "#f3ecff", canvas: "#160f26", accent: "#8f77d7", accent2: "#22d3ee" }, stickers: ["🎉", "🎊", "🌈", "🎈", "🦄", "✨", "🍭", "🎨", "🥳"] },
  girly: { label: "Girly", emoji: "🎀", light: { ink: "#3d1f2e", canvas: "#fff5f8", accent: "#c23d78", accent2: "#7c4bb0" }, dark: { ink: "#fbe4ef", canvas: "#230f1a", accent: "#d15698", accent2: "#c084fc" }, stickers: ["🎀", "💅", "💖", "🌸", "✨", "👛", "💋", "🩰", "🦄", "💄", "👗", "💕"] },
  boyish: { label: "Boyish", emoji: "⚡", light: { ink: "#101c2c", canvas: "#f3f6f9", accent: "#2255c9", accent2: "#0d7d70" }, dark: { ink: "#e6edf5", canvas: "#0a121e", accent: "#527ed9", accent2: "#2dd4bf" }, stickers: ["⚡", "🏀", "🎮", "🚀", "🔥", "🏈", "🤘", "🛹", "🥇"] },
  professional: { label: "Professional", emoji: "💼", light: { ink: "#20242b", canvas: "#f5f6f7", accent: "#33475b", accent2: "#5b7691" }, dark: { ink: "#e8eaed", canvas: "#15181c", accent: "#70859a", accent2: "#9fb3c7" }, stickers: ["📎", "📊", "💼", "📈", "✅", "🖇️", "📅"] },
  tech: { label: "Tech", emoji: "💻", light: { ink: "#0d1b12", canvas: "#f1f7f2", accent: "#138c40", accent2: "#0369a1" }, dark: { ink: "#d7ffe4", canvas: "#0a0f0d", accent: "#1e9a50", accent2: "#38bdf8" }, stickers: ["💻", "🖥️", "⌨️", "🔌", "🤖", "👾", "🛰️", "🔋", "📡"] },
};

interface Derived {
  ink: string; canvas: string; accent: string; accent2: string;
  paper: string; line: string; cardline: string; thbg: string; colbg: string; hoverrow: string;
  hover: string; line2: string; muted: string; faint: string;
  accentPale: string; accentBorder: string; accentDim: string; shadow: string;
}
function deriveMode(seed: ThemeDef["light"], dark: boolean): Derived {
  const { ink, canvas, accent, accent2 } = seed;
  return dark
    ? { ink, canvas, accent, accent2, paper: mix(canvas, ink, 0.07), line: mix(canvas, ink, 0.19), cardline: mix(canvas, ink, 0.19), thbg: mix(canvas, ink, 0.1), colbg: mix(canvas, ink, 0.035), hoverrow: mix(canvas, ink, 0.1), hover: mix(canvas, ink, 0.15), line2: mix(canvas, ink, 0.25), muted: mix(ink, canvas, 0.45), faint: mix(ink, canvas, 0.62), accentPale: mix(accent, canvas, 0.78), accentBorder: mix(accent, "#ffffff", 0.35), accentDim: accent + "26", shadow: "0 4px 12px #00000040" }
    : { ink, canvas, accent, accent2, paper: mix(canvas, "#ffffff", 0.8), line: mix(canvas, ink, 0.12), cardline: mix(canvas, ink, 0.12), thbg: mix(canvas, "#ffffff", 0.4), colbg: mix(canvas, ink, 0.05), hoverrow: mix(canvas, "#ffffff", 0.45), hover: mix(canvas, ink, 0.09), line2: mix(canvas, ink, 0.19), muted: mix(ink, canvas, 0.56), faint: mix(ink, canvas, 0.66), accentPale: mix(accent, "#ffffff", 0.9), accentBorder: mix(accent, "#ffffff", 0.7), accentDim: accent + "1f", shadow: `0 4px 12px ${accent}2e` };
}

const SEMANTIC = {
  light: { green: "#2f7d52", amber: "#a07417", red: "#bf3737", blue: "#2674c7" },
  dark: { green: "#5cc98d", amber: "#e0b25c", red: "#ef7a76", blue: "#5b9fe0" },
};
function paleTint(fg: string, paper: string, dark: boolean) {
  return { bg: mix(fg, paper, dark ? 0.82 : 0.88), fg };
}
function patternFor(id: string, dark: boolean): { image: string; size: string } | null {
  if (id === "halloween" && dark) return { image: "radial-gradient(#ffffff14 1px, transparent 1.6px)", size: "26px 26px" };
  if (id === "tech") { const c = dark ? "#ffffff0a" : "#00000008"; return { image: `linear-gradient(${c} 1px, transparent 1px),linear-gradient(90deg,${c} 1px, transparent 1px)`, size: "24px 24px" }; }
  if (id === "winter") { const c = dark ? "#ffffff12" : "#2f7fd11a"; return { image: `radial-gradient(${c} 1px, transparent 1.6px)`, size: "22px 22px" }; }
  return null;
}

// Stable-slot stickers: assigned once per theme application (no per-render flicker), reshuffled
// only when the theme/mode changes. Components read this signal.
export const stickerSlots = signal<Record<string, string>>({});
export function themeStickers(): string[] {
  const t = THEMES[config.value.theme];
  return t && t.stickers && t.stickers.length ? t.stickers : ["✨"];
}
export function randomSticker(): string {
  const p = themeStickers();
  return p[Math.floor(Math.random() * p.length)];
}
function assignStickers() {
  stickerSlots.value = {
    stat1: randomSticker(), stat2: randomSticker(), stat3: randomSticker(), stat4: randomSticker(),
    panelDue: randomSticker(), panelQueue: randomSticker(), panelDone: randomSticker(), panelDomain: randomSticker(), sidebar: randomSticker(),
  };
}

export function applyThemeVars() {
  const id = THEMES[config.value.theme] ? config.value.theme : "screener";
  const t = THEMES[id];
  const dark = config.value.mode === "dark";
  document.body.classList.toggle("dark", dark);
  const m = deriveMode(dark ? t.dark : t.light, dark);
  const sb = deriveMode(t.dark, true);
  const sem = dark ? SEMANTIC.dark : SEMANTIC.light;
  const root = document.documentElement.style;
  const set = (k: string, v: string) => root.setProperty("--" + k, v);
  set("ink", m.ink); set("muted", m.muted); set("line", m.line); set("paper", m.paper); set("canvas", m.canvas);
  set("accent", m.accent); set("accent2", m.accent2); set("accent-pale", m.accentPale);
  set("thbg", m.thbg); set("colbg", m.colbg); set("hoverrow", m.hoverrow); set("cardline", m.cardline);
  set("sb-bg", sb.canvas); set("sb-ink", sb.ink); set("sb-mut", sb.muted); set("sb-line", sb.line); set("sb-hover", sb.hover);
  set("shadow", m.shadow); set("hover", m.hover); set("line2", m.line2); set("faint", m.faint); set("accentdim", m.accentDim); set("accent-border", m.accentBorder);
  set("text", m.ink); set("dim", m.muted); set("surface", m.paper); set("surface2", m.canvas); set("pa", m.accent);
  set("green", sem.green); set("amber", sem.amber); set("red", sem.red); set("blue", sem.blue);
  set("good", sem.green); set("warn", sem.amber); set("bad", sem.red); set("star", sem.amber);
  const red = paleTint(sem.red, m.paper, dark), amber = paleTint(sem.amber, m.paper, dark), green = paleTint(sem.green, m.paper, dark), blue = paleTint(sem.blue, m.paper, dark);
  const neutral = paleTint(m.muted, m.paper, dark), purple = paleTint(dark ? "#b394f2" : "#8a6a4a", m.paper, dark);
  set("pale-red-bg", red.bg); set("pale-red-fg", red.fg); set("pale-amber-bg", amber.bg); set("pale-amber-fg", amber.fg);
  set("pale-green-bg", green.bg); set("pale-green-fg", green.fg); set("pale-blue-bg", blue.bg); set("pale-blue-fg", blue.fg);
  set("pale-neutral-bg", neutral.bg); set("pale-neutral-fg", neutral.fg); set("pale-purple-bg", purple.bg); set("pale-purple-fg", purple.fg);
  const pat = patternFor(id, dark);
  document.body.style.backgroundImage = pat ? pat.image : "";
  document.body.style.backgroundSize = pat ? pat.size : "";
  document.body.dataset.theme = id;
  const tc = document.querySelector('meta[name="theme-color"]');
  if (tc) tc.setAttribute("content", m.canvas);
  assignStickers(); // reshuffle the stable slots for the new theme
}

export function setThemeId(id: string) {
  if (!THEMES[id] || id === config.value.theme) return;
  config.value.theme = id;
  config.value.themeUpdatedAt = Date.now();
  saveConfig();
  applyThemeVars();
  queueSync();
  showToast(THEMES[id].emoji + " " + THEMES[id].label + " theme");
}
export function setMode(v: "light" | "dark") {
  if (v === config.value.mode) return;
  config.value.mode = v;
  config.value.themeUpdatedAt = Date.now();
  saveConfig();
  applyThemeVars();
  queueSync();
  showToast(v === "light" ? "☀️ Day" : "🌙 Night");
}
