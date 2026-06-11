// Cloudflare Worker — thin, secured relay to the Anthropic API.
// Holds your Anthropic key server-side (env.ANTHROPIC_API_KEY) and gates access with a
// shared secret (env.APP_SECRET). The app sends the system + user prompt, so prompt
// changes in the app never require redeploying this Worker.
//
// Env vars to set in Cloudflare (see README):
//   ANTHROPIC_API_KEY  (secret)  — your Anthropic key
//   APP_SECRET         (secret)  — any random string; also entered in the app
//   MODEL              (var, optional) — defaults to claude-haiku-4-5-20251001

export default {
  async fetch(request, env) {
    // Only the app's origin may call this from a browser (override via env.ALLOWED_ORIGINS,
    // comma-separated). localhost is allowed for local testing.
    const allowed = (env.ALLOWED_ORIGINS || "https://hrishikeshpujari.github.io,http://localhost:4178")
      .split(",").map(s => s.trim());
    const origin = request.headers.get("Origin") || "";
    const cors = {
      "Access-Control-Allow-Origin": allowed.includes(origin) ? origin : allowed[0],
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, x-app-secret",
      "Vary": "Origin",
    };
    if (request.method === "OPTIONS") return new Response(null, { headers: cors });
    if (request.method !== "POST") return json({ error: "POST only" }, 405, cors);
    if (request.headers.get("x-app-secret") !== env.APP_SECRET) return json({ error: "unauthorized" }, 401, cors);

    let body;
    try { body = await request.json(); } catch { return json({ error: "bad json" }, 400, cors); }

    const max = Math.min(Math.max(parseInt(body.max_tokens, 10) || 1024, 64), 4096);
    const model = env.MODEL || "claude-haiku-4-5-20251001";

    let resp;
    try {
      resp = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-api-key": env.ANTHROPIC_API_KEY,
          "anthropic-version": "2023-06-01",
        },
        body: JSON.stringify({
          model,
          max_tokens: max,
          system: String(body.system || ""),
          messages: [{ role: "user", content: String(body.prompt || "") }],
        }),
      });
    } catch (e) {
      return json({ error: "fetch failed", detail: String(e) }, 502, cors);
    }
    if (!resp.ok) return json({ error: "anthropic " + resp.status, detail: await resp.text() }, 502, cors);

    const data = await resp.json();
    const text = (data.content || []).map(c => c.text || "").join("");
    return json({ result: text }, 200, cors);
  },
};

function json(obj, status, cors) {
  return new Response(JSON.stringify(obj), { status, headers: { "content-type": "application/json", ...cors } });
}
