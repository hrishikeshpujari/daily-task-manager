// Single source of truth for the data shapes. These MUST stay wire-compatible with the
// current app: the gist JSON, the localStorage values, and what the native Android shell
// (MainActivity.mirror) reads. See the plan's "Non-negotiable invariants".

export interface Task {
  id: string; // "t_" + base36(ms) + 5 base36 rand chars
  text: string;
  createdAt: number;
  updatedAt: number; // LWW clock for sync merge
  due: string | null; // "YYYY-MM-DD" (local) or null
  important: boolean;
  done: boolean;
  completedAt: number | null;
  bucket: "active" | "someday";
  deleted: boolean; // tombstone; purged from merges after 365 days
  // Optional fields use PRESENCE semantics — absent means "unset". domain/time are DELETED
  // (not nulled/emptied) when cleared in the editor; treat "key missing" as unset.
  domain?: string;
  time?: string; // "HH:MM" 24h
  pinnedFor?: string; // "YYYY-MM-DD" this task is the #1 for
  aiPriority?: number; // 1-100 from Claude; overrides the rule score
  effortMins?: number;
  why?: string; // <=8 word Claude rationale
  raw?: boolean; // Android widget quick-adds only; the web app never sets it, but preserves it on round-trip
}

export interface Config {
  token: string; // GitHub PAT, gist scope
  gistId: string; // canonical gist id (auto-discovered / self-healed / user-pinned)
  proxyUrl: string; // Cloudflare Worker base URL
  appSecret: string; // per-person secret, sent as x-app-secret
  theme: string; // one of ThemeId
  mode: "light" | "dark";
  themeUpdatedAt: number; // LWW clock for theme/mode sync
}

export interface BriefFocus {
  id: string;
  action?: string;
  minutes?: number;
}
export interface Brief {
  date: string; // "YYYY-MM-DD"
  summary: string;
  focus: BriefFocus[];
  skip: string[];
}

export type Mode = "light" | "dark";

export interface ThemeSeed {
  ink: string;
  canvas: string;
  accent: string;
  accent2: string;
}
export interface ThemeDef {
  label: string;
  emoji: string;
  light: ThemeSeed;
  dark: ThemeSeed;
  stickers: string[];
}

export type View = "today" | "week" | "board" | "month" | "all" | "history";
