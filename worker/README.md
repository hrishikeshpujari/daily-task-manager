# Task PA — Cloudflare Worker

A tiny proxy that lets the task app call Claude without ever putting your Anthropic key in the browser. The key lives here as a server-side secret; a shared `APP_SECRET` stops anyone else from using your proxy.

## What you need first
1. **Anthropic API key** — [console.anthropic.com](https://console.anthropic.com) → API keys → Create. Add a few dollars of credit under Billing.
2. **Cloudflare account** (free) — [dash.cloudflare.com](https://dash.cloudflare.com).
3. **An `APP_SECRET`** — any random string (e.g. a long password). You'll use it here and in the app.

## Deploy — Option A: Dashboard (no CLI)
1. Cloudflare dashboard → **Workers & Pages** → **Create** → **Create Worker** → name it `task-pa` → **Deploy** (the starter).
2. **Edit code** → paste the entire contents of [`worker.js`](worker.js) over the starter → **Deploy**.
3. Worker → **Settings** → **Variables and Secrets** → add:
   - `ANTHROPIC_API_KEY` — your Anthropic key — **type: Secret**
   - `APP_SECRET` — your random string — **type: Secret**
   - `MODEL` *(optional)* — `claude-haiku-4-5-20251001` — type: Text
   - `ALLOWED_ORIGINS` *(optional)* — comma-separated browser origins allowed to call this Worker; defaults to the app's GitHub Pages origin + localhost — type: Text
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
