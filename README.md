# Daily Task Manager

A single-page, zero-build task manager that runs in any browser, **installs to your home screen / desktop**, works **offline**, and **syncs across all your devices** via a private GitHub Gist.

Built to be the **missing daily layer** between your brain-dump and your weekly manager email — not another app you have to remember to open.

## What it does
- **Frictionless capture** — one always-focused box at the top. Type, press Enter, saved. No categorizing.
- **Auto-prioritization** — every task gets a score from (a) due-date proximity, (b) an importance star, and (c) **staleness** (older untouched tasks float up and get a `🕓 untouched` flag).
- **Three views** — **Today** (top 5, ranked 1–5, default), **This Week** (full active list), **Someday** (backlog).
- **One-tap done** — big circle on each row, plus a live **"Done today"** counter in the header.
- **Weekly email button** — outputs a paste-ready summary of everything completed in the last 7 days for your Monday manager email.

---

## Setup (about 10 minutes, all free)

### 1. Put it on GitHub Pages
1. Create a new **public** repo on GitHub (e.g. `tasks`). *(Pages is free on public repos. Your data does NOT live here — it goes in a separate private gist — so a public repo is fine.)*
2. Upload the four files in this folder: `index.html`, `manifest.webmanifest`, `sw.js`, `icon.svg`.
3. Repo → **Settings → Pages** → Source: **Deploy from a branch** → `main` / `root` → **Save**.
4. After ~1 minute your app is live at `https://<your-username>.github.io/tasks/`.

> Tip: name the repo `<your-username>.github.io` and it serves from the root URL with no subpath.

### 2. Turn on cross-device sync (do this once per device)
1. Create a token: **[github.com/settings/tokens/new?scopes=gist](https://github.com/settings/tokens/new?scopes=gist)** — give it **only the `gist` scope**, generate, and copy it.
2. Open the app, tap the **sync pill** (top-right) → paste the token → **Save & sync**.
3. The first device creates a private gist automatically. On every other device, **just paste the same token** (leave Gist ID blank). Sync is self-healing: it reads every gist that holds your data, merges them, and writes back to one stable "home" gist — so even if devices ever land on separate gists, they reconverge on their own. You never touch a Gist ID.

**Security:** the token is stored in that device's browser only (localStorage) and is sent **only to GitHub**. It's never committed to the repo. With the `gist` scope, the worst case if it leaks is access to your gists — nothing else. To revoke, delete the token on GitHub or hit **Disconnect** in the app.

> Note: a "secret" gist is *unlisted*, not access-controlled — anyone with its long random URL could read it. Fine for task text; don't store anything sensitive.

---

## Make it unavoidable (the whole point)

**Android (Samsung Internet / Chrome):**
- Open the app → browser menu → **Add to Home screen**. It installs as a standalone icon (no address bar).
- Set it as your browser homepage: Settings → Homepage → paste the URL.

**Desktop (Chrome / Edge):**
- Click the **install** icon in the address bar → opens in its own window.
- Make it your startup page: Settings → "On startup" → **Open a specific page** → add the URL. Also set it as your homepage.
- Want it as the literal new-tab page? Use a "new tab redirect" extension pointed at the URL (Chrome reserves the true new-tab page for extensions).

Pair it with your existing **9:00am** and **4:30pm** alarms — the alarm is the trigger, this is the surface you land on.

---

## How the priority score works
```
score = due-proximity + importance + staleness
  due:  overdue 100+   · today 80 · tomorrow 60 · ≤3d 40 · ≤7d 20 · later 5
  importance star: +50
  staleness: +3 per untouched day (capped at +60); flagged after 4 days
```
Tweak the numbers in the `score()` function in `index.html` to match how you actually feel urgency.

## Notes
- **Offline:** the service worker caches the app so it opens with no signal; changes save locally and sync when you're back online.
- **Conflicts:** edits merge per-task by last-write-wins (each task carries an `updatedAt`), so editing on phone and desktop won't clobber the whole list.
- **No build step, no dependencies, no tracking, no cost.**
