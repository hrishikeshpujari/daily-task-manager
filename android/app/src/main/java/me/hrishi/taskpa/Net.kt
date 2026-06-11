package me.hrishi.taskpa

import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody
import org.json.JSONArray
import org.json.JSONObject
import java.io.IOException
import java.util.concurrent.TimeUnit

/** GitHub gist + Claude-PA proxy calls. Mirrors the web app's API usage exactly. */
object Net {
    const val GIST_FILE = "daily-tasks.json"
    private val JSON = "application/json; charset=utf-8".toMediaType()
    private val client = OkHttpClient.Builder()
        .connectTimeout(20, TimeUnit.SECONDS)
        .readTimeout(90, TimeUnit.SECONDS)
        .build()

    private fun gh(token: String, url: String, method: String = "GET", body: String? = null): String {
        val b = Request.Builder().url(url)
            .header("Accept", "application/vnd.github+json")
            .header("Authorization", "Bearer $token")
        if (body != null) b.method(method, body.toRequestBody(JSON))
        client.newCall(b.build()).execute().use { r ->
            if (!r.isSuccessful) throw IOException("GitHub ${r.code}")
            return r.body?.string() ?: ""
        }
    }

    /** Find the home gist the same way the web app does: oldest gist holding the data file. */
    fun discoverGistId(token: String): String? {
        val arr = JSONArray(gh(token, "https://api.github.com/gists?per_page=100"))
        var bestId: String? = null
        var bestCreated: String? = null
        for (i in 0 until arr.length()) {
            val g = arr.optJSONObject(i) ?: continue
            if (g.optJSONObject("files")?.has(GIST_FILE) != true) continue
            val created = g.optString("created_at")
            if (bestCreated == null || created < bestCreated!! ||
                (created == bestCreated && g.optString("id") < bestId!!)) {
                bestId = g.optString("id"); bestCreated = created
            }
        }
        return bestId
    }

    fun fetchTasks(token: String, gistId: String): JSONArray {
        val g = JSONObject(gh(token, "https://api.github.com/gists/$gistId"))
        val f = g.optJSONObject("files")?.optJSONObject(GIST_FILE) ?: return JSONArray()
        var content = f.optString("content")
        if (f.optBoolean("truncated") && f.optString("raw_url").isNotBlank()) {
            client.newCall(Request.Builder().url(f.optString("raw_url")).build()).execute().use { r ->
                content = r.body?.string() ?: content
            }
        }
        return try { JSONObject(content).optJSONArray("tasks") ?: JSONArray() } catch (e: Exception) { JSONArray() }
    }

    fun pushTasks(token: String, gistId: String, tasks: JSONArray) {
        val content = JSONObject().put("v", 1).put("tasks", tasks).toString(2)
        val body = JSONObject()
            .put("files", JSONObject().put(GIST_FILE, JSONObject().put("content", content)))
            .toString()
        gh(token, "https://api.github.com/gists/$gistId", "PATCH", body)
    }

    fun paCall(proxyUrl: String, secret: String, system: String, prompt: String, maxTokens: Int): String {
        val body = JSONObject()
            .put("system", system).put("prompt", prompt).put("max_tokens", maxTokens)
            .toString()
        val req = Request.Builder().url(proxyUrl)
            .header("x-app-secret", secret)
            .post(body.toRequestBody(JSON))
            .build()
        client.newCall(req).execute().use { r ->
            if (!r.isSuccessful) throw IOException("PA ${r.code}")
            return JSONObject(r.body?.string() ?: "{}").optString("result")
        }
    }

    /** Same loose JSON parsing as the web app (strips fences, slices to outer braces). */
    fun parseLoose(s: String): JSONObject? {
        var t = s.trim()
        val a = t.indexOf('{')
        val b = t.lastIndexOf('}')
        if (a >= 0 && b > a) t = t.substring(a, b + 1)
        return try { JSONObject(t) } catch (e: Exception) { null }
    }
}
