# Task PA — Cloudflare Worker (hub)

Three jobs:
1. **`POST /`** — Claude relay for the web app (`{system, prompt, max_tokens}` → `{result}`).
2. **`POST /capture`** — phone capture: `{text}` → Claude cleans it into a structured task → written into the **caller's own gist**. Used by Siri Shortcuts / voice capture. If Claude is down, the raw text is saved as-is — capture never fails.
3. **`GET /week`** — the caller's next 7 days grouped by day (JSON). Feeds the iOS Scriptable widget, the Android widget, and Shortcuts. Optional `?tz=` (IANA zone).

**Per-person model:** each person has their own secret (`x-app-secret` header, or `?s=` for widgets) mapped server-side to their own GitHub gist token — fully separate datastores in the same app. `/capture` and `/week` require a per-person secret; the legacy `APP_SECRET` still works for the relay only.

## What you need first
1. **Anthropic API key** — [console.anthropic.com](https://console.anthropic.com) → API keys → Create. Add a few dollars of credit under Billing.
2. **Cloudflare account** (free) — [dash.cloudflare.com](https://dash.cloudflare.com).
3. **An `APP_SECRET`** — any random string (e.g. a long password). You'll use it here and in the app.

## Deploy — Option A: Dashboard (no CLI)
1. Cloudflare dashboard → **Workers & Pages** → **Create** → **Create Worker** → name it `task-pa` → **Deploy** (the starter).
2. **Edit code** → paste the entire contents of [`worker.js`](worker.js) over the starter → **Deploy**.
3. Worker → **Settings** → **Variables and Secrets** → add:
   - `ANTHROPIC_API_KEY` — your Anthropic key — **type: Secret**
   - `APP_SECRET` — legacy relay secret (keep if already set) — **type: Secret**
   - `SECRET_H` / `GH_TOKEN_H` — person 1's secret + their gist-scoped GitHub token — **type: Secret**
   - `SECRET_K` / `GH_TOKEN_K` — person 2's secret + their gist-scoped GitHub token — **type: Secret**
   - `GIST_H` / `GIST_K` *(optional)* — pin gist ids; else auto-discovered — type: Text
   - `MODEL` *(optional)* — `claude-haiku-4-5-20251001` — type: Text
   - `ALLOWED_ORIGINS` *(optional)* — comma-separated browser origins allowed to call the relay; defaults to the app's GitHub Pages origin + localhost — type: Text
4. Copy your Worker URL: `https://task-pa.<your-subdomain>.workers.dev`.

## Deploy — Option B: Wrangler CLI
```bash
npm install -g wrangler
wrangler login
# from this /worker folder:
wrangler secret put ANTHROPIC_API_KEY   # paste your Anthropic key
wrangler secret put APP_SECRET          # paste your random string
wrangler deploy
```
The deploy prints your Worker URL.

## Wire it into the app
In the app's settings, paste the **Worker URL** and the **same `APP_SECRET`**. Done — Claude features turn on. (Without these, the app just uses its built-in rule-based prioritization.)

## Notes
- **Security:** the Anthropic key and `APP_SECRET` are server-side secrets — never in the app or this repo. Requests without the right `APP_SECRET` are rejected.
- **Cost:** Haiku is cheap; typical personal use is well under $1/month. Watch usage at console.anthropic.com.
- **Model:** set `MODEL` to a Sonnet id for smarter (pricier) briefings.
