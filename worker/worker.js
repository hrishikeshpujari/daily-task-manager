// Cloudflare Worker — proxy between the task app and the Anthropic API.
// It holds your Anthropic key as a server-side secret (env.ANTHROPIC_API_KEY), so the key
// never lives in the browser. A shared secret (env.APP_SECRET) gates access so this can't be
// used as an open proxy that burns your credits.
//
// Env vars to set in Cloudflare (see README):
//   ANTHROPIC_API_KEY  (secret)  — your Anthropic key
//   APP_SECRET         (secret)  — any random string; also entered in the app
//   MODEL              (var, optional) — defaults to claude-haiku-4-5-20251001

export default {
  async fetch(request, env) {
    const cors = {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, x-app-secret",
    };
    if (request.method === "OPTIONS") return new Response(null, { headers: cors });
    if (request.method !== "POST") return json({ error: "POST only" }, 405, cors);

    // Shared-secret gate.
    if (request.headers.get("x-app-secret") !== env.APP_SECRET) {
      return json({ error: "unauthorized" }, 401, cors);
    }

    let body;
    try { body = await request.json(); } catch { return json({ error: "bad json" }, 400, cors); }

    const model = env.MODEL || "claude-haiku-4-5-20251001";
    const system = body.action === "brief" ? BRIEF_SYS : PRIORITIZE_SYS;
    const userMsg = JSON.stringify({
      action: body.action,
      now: body.now || null,
      tasks: body.tasks || [],
      newTask: body.newTask || null,
      context: body.context || null,
    });

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
          max_tokens: 2048,
          system,
          messages: [{ role: "user", content: userMsg }],
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

const PRIORITIZE_SYS = `You are a personal assistant prioritizing ONE user's tasks (a mix of work and personal).
Input is JSON: the full task list, and optionally a newly added task to pay special attention to.
Each task has: id, text, due (YYYY-MM-DD or null), important (bool), createdAt, bucket.
Return ONLY a JSON object, no prose, no markdown fences:
{"tasks":[{"id":"<id>","priority":<1-100>,"effortMins":<int>,"why":"<≤8 words>"}],"note":"<one short overall note>"}
Higher priority = do sooner. Weigh due-date proximity, importance, how long it's been sitting, and obvious dependencies. Be decisive and realistic about effort.`;

const BRIEF_SYS = `You are a personal assistant giving ONE user a short daily briefing (work + personal tasks).
Input is JSON with the current task list (id, text, due, important, bucket).
Return ONLY a JSON object, no prose, no markdown fences:
{"focus":[{"id":"<id>","action":"<what to do, ≤12 words>","minutes":<int>}],"skip":["<id>"],"summary":"<2-3 sentences: what to do today and roughly how much time>"}
Pick the 3-5 things that matter most today. Be realistic about total time. Direct and encouraging, not fluffy.`;
