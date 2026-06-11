package me.hrishi.taskpa

import android.content.Context
import android.content.SharedPreferences
import org.json.JSONArray
import org.json.JSONObject
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale

/**
 * Local mirror of the web app's data. The GitHub gist stays the single source of truth;
 * this is the widget's working copy, refreshed by SyncWorker and by MainActivity's
 * localStorage mirror. Task JSON objects are kept whole so fields this app doesn't know
 * about survive round-trips.
 */
object Store {
    const val DAY = 86400000L

    fun prefs(ctx: Context): SharedPreferences = ctx.getSharedPreferences("store", Context.MODE_PRIVATE)

    fun token(ctx: Context) = prefs(ctx).getString("token", "") ?: ""
    fun gistId(ctx: Context) = prefs(ctx).getString("gistId", "") ?: ""
    fun proxyUrl(ctx: Context) = prefs(ctx).getString("proxyUrl", "") ?: ""
    fun appSecret(ctx: Context) = prefs(ctx).getString("appSecret", "") ?: ""
    fun setGistId(ctx: Context, id: String) = prefs(ctx).edit().putString("gistId", id).apply()

    fun localKey(ts: Long = System.currentTimeMillis()): String =
        SimpleDateFormat("yyyy-MM-dd", Locale.US).format(Date(ts))

    fun loadTasks(ctx: Context): JSONArray =
        try { JSONArray(prefs(ctx).getString("tasks", "[]") ?: "[]") } catch (e: Exception) { JSONArray() }

    fun saveTasks(ctx: Context, arr: JSONArray) = prefs(ctx).edit().putString("tasks", arr.toString()).apply()

    fun briefLine(ctx: Context): String {
        if ((prefs(ctx).getString("briefDate", "") ?: "") != localKey()) return ""
        return prefs(ctx).getString("briefSummary", "") ?: ""
    }

    /** Pull config/tasks/brief out of the WebView's localStorage values. */
    fun mirrorFromWeb(ctx: Context, cfg: String?, tasks: String?, brief: String?) {
        val e = prefs(ctx).edit()
        try {
            if (!cfg.isNullOrBlank()) {
                val c = JSONObject(cfg)
                e.putString("token", c.optString("token"))
                e.putString("gistId", c.optString("gistId"))
                e.putString("proxyUrl", c.optString("proxyUrl"))
                e.putString("appSecret", c.optString("appSecret"))
            }
        } catch (_: Exception) {}
        try {
            if (!brief.isNullOrBlank()) {
                val b = JSONObject(brief)
                e.putString("briefDate", b.optString("date"))
                e.putString("briefSummary", b.optString("summary"))
            }
        } catch (_: Exception) {}
        e.apply()
        try {
            if (!tasks.isNullOrBlank()) saveTasks(ctx, merge(loadTasks(ctx), JSONArray(tasks)))
        } catch (_: Exception) {}
    }

    /** Same merge as the web app: per-task last-write-wins by updatedAt, old tombstones dropped. */
    fun merge(local: JSONArray, remote: JSONArray): JSONArray {
        val m = LinkedHashMap<String, JSONObject>()
        for (i in 0 until remote.length()) {
            val t = remote.optJSONObject(i) ?: continue
            m[t.optString("id")] = t
        }
        for (i in 0 until local.length()) {
            val t = local.optJSONObject(i) ?: continue
            val existing = m[t.optString("id")]
            if (existing == null || t.optLong("updatedAt") >= existing.optLong("updatedAt")) m[t.optString("id")] = t
        }
        val cutoff = System.currentTimeMillis() - 365 * DAY
        val out = JSONArray()
        for (t in m.values) if (!(t.optBoolean("deleted") && t.optLong("updatedAt") < cutoff)) out.put(t)
        return out
    }

    /** Same priority as the web app: pinned-for-today -> 1000, else Claude's score, else rules. */
    fun effScore(t: JSONObject): Int {
        if (t.optString("pinnedFor") == localKey()) return 1000
        if (t.has("aiPriority") && !t.isNull("aiPriority")) return t.optInt("aiPriority")
        var s = 0
        val due = if (t.isNull("due")) "" else t.optString("due", "")
        if (due.isNotBlank()) {
            try {
                val fmt = SimpleDateFormat("yyyy-MM-dd", Locale.US)
                val dd = Math.round((fmt.parse(due)!!.time - fmt.parse(localKey())!!.time).toDouble() / DAY).toInt()
                s += when {
                    dd < 0 -> 100 + minOf(-dd, 30) * 5
                    dd == 0 -> 80
                    dd == 1 -> 60
                    dd <= 3 -> 40
                    dd <= 7 -> 20
                    else -> 5
                }
            } catch (_: Exception) {}
        }
        if (t.optBoolean("important")) s += 50
        val staleDays = ((System.currentTimeMillis() - t.optLong("updatedAt")) / DAY).toInt()
        s += minOf(staleDays, 20) * 3
        return minOf(s, 100)
    }

    fun openActive(arr: JSONArray): List<JSONObject> {
        val list = ArrayList<JSONObject>()
        for (i in 0 until arr.length()) {
            val t = arr.optJSONObject(i) ?: continue
            if (!t.optBoolean("deleted") && !t.optBoolean("done") && t.optString("bucket", "active") == "active") list.add(t)
        }
        list.sortWith(compareByDescending<JSONObject> { effScore(it) }.thenBy { it.optLong("createdAt") })
        return list
    }

    fun doneToday(arr: JSONArray): Int {
        var n = 0
        for (i in 0 until arr.length()) {
            val t = arr.optJSONObject(i) ?: continue
            if (!t.optBoolean("deleted") && t.optBoolean("done") &&
                t.optLong("completedAt") > 0 && localKey(t.optLong("completedAt")) == localKey()) n++
        }
        return n
    }

    fun addTask(ctx: Context, text: String) {
        val now = System.currentTimeMillis()
        val rnd = Integer.toString((Math.random() * 1679616).toInt(), 36)
        val t = JSONObject()
            .put("id", "t_" + java.lang.Long.toString(now, 36) + rnd)
            .put("text", text)
            .put("createdAt", now).put("updatedAt", now)
            .put("due", JSONObject.NULL).put("important", false)
            .put("done", false).put("completedAt", JSONObject.NULL)
            .put("bucket", "active").put("deleted", false)
        val arr = loadTasks(ctx)
        arr.put(t)
        saveTasks(ctx, arr)
    }

    fun markDone(ctx: Context, id: String) {
        val arr = loadTasks(ctx)
        for (i in 0 until arr.length()) {
            val t = arr.optJSONObject(i) ?: continue
            if (t.optString("id") == id) {
                val now = System.currentTimeMillis()
                t.put("done", true).put("completedAt", now).put("updatedAt", now)
            }
        }
        saveTasks(ctx, arr)
    }
}
