package me.hrishi.taskpa

import android.content.Context
import androidx.work.BackoffPolicy
import androidx.work.Constraints
import androidx.work.CoroutineWorker
import androidx.work.ExistingPeriodicWorkPolicy
import androidx.work.ExistingWorkPolicy
import androidx.work.NetworkType
import androidx.work.OneTimeWorkRequestBuilder
import androidx.work.PeriodicWorkRequestBuilder
import androidx.work.WorkManager
import androidx.work.WorkerParameters
import androidx.work.workDataOf
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import org.json.JSONArray
import org.json.JSONObject
import java.util.concurrent.TimeUnit

/**
 * Background sync: pull the gist, merge (per-task LWW), optionally have Claude prioritize,
 * push back, refresh the widget. Used after widget quick-adds (pa=true) and on a 30-min
 * periodic schedule (pa=false).
 */
class SyncWorker(ctx: Context, params: WorkerParameters) : CoroutineWorker(ctx, params) {

    override suspend fun doWork(): Result = withContext(Dispatchers.IO) {
        val ctx = applicationContext
        val token = Store.token(ctx)
        if (token.isBlank()) {
            TaskWidget.updateAll(ctx)
            return@withContext Result.success()
        }
        try {
            var gistId = Store.gistId(ctx)
            if (gistId.isBlank()) {
                gistId = Net.discoverGistId(token) ?: ""
                if (gistId.isNotBlank()) Store.setGistId(ctx, gistId)
            }
            if (gistId.isBlank()) {
                TaskWidget.updateAll(ctx)
                return@withContext Result.success()
            }

            var merged = Store.merge(Store.loadTasks(ctx), Net.fetchTasks(token, gistId))

            if (inputData.getBoolean("pa", false)) {
                val proxy = Store.proxyUrl(ctx)
                val secret = Store.appSecret(ctx)
                if (proxy.isNotBlank() && secret.isNotBlank()) {
                    try { merged = applyPa(merged, proxy, secret) } catch (_: Exception) { /* PA optional */ }
                }
            }

            Net.pushTasks(token, gistId, merged)
            Store.saveTasks(ctx, merged)
            TaskWidget.updateAll(ctx)
            Result.success()
        } catch (e: Exception) {
            if (runAttemptCount < 3) Result.retry()
            else { TaskWidget.updateAll(ctx); Result.failure() }
        }
    }

    private fun applyPa(tasks: JSONArray, proxy: String, secret: String): JSONArray {
        val open = JSONArray()
        for (i in 0 until tasks.length()) {
            val t = tasks.optJSONObject(i) ?: continue
            if (t.optBoolean("deleted") || t.optBoolean("done")) continue
            open.put(JSONObject()
                .put("id", t.optString("id"))
                .put("text", t.optString("text"))
                .put("due", t.opt("due") ?: JSONObject.NULL)
                .put("important", t.optBoolean("important"))
                .put("createdAt", t.optLong("createdAt"))
                .put("bucket", t.optString("bucket"))
                .put("pinned", t.optString("pinnedFor") == Store.localKey()))
        }
        if (open.length() == 0) return tasks
        val result = Net.paCall(proxy, secret, SYS_PRIORITIZE, "Tasks:\n$open", 2048)
        val ranked = Net.parseLoose(result)?.optJSONArray("tasks") ?: return tasks
        val byId = HashMap<String, JSONObject>()
        for (i in 0 until ranked.length()) {
            val r = ranked.optJSONObject(i) ?: continue
            byId[r.optString("id")] = r
        }
        for (i in 0 until tasks.length()) {
            val t = tasks.optJSONObject(i) ?: continue
            val r = byId[t.optString("id")] ?: continue
            if (r.has("priority")) t.put("aiPriority", r.optInt("priority"))
            if (r.has("effortMins")) t.put("effortMins", r.optInt("effortMins"))
            val why = r.optString("why")
            if (why.isNotBlank()) t.put("why", why)
        }
        return tasks
    }

    companion object {
        // Same prompt as the web app, so rankings agree no matter where a task was added.
        const val SYS_PRIORITIZE = "You are a personal assistant prioritizing ONE user's tasks (work + personal). Input is a JSON task list (id, text, due YYYY-MM-DD or null, important, createdAt, bucket). Return ONLY JSON, no prose, no fences: {\"tasks\":[{\"id\":\"<id>\",\"priority\":<1-100>,\"effortMins\":<int>,\"why\":\"<=8 words\"}]}. Higher priority = do sooner. Weigh due-date proximity, importance, how long it has sat, and obvious dependencies. Be decisive and realistic about effort. A task with pinned:true is the user's chosen #1 for today."

        fun enqueueOnce(ctx: Context, withPa: Boolean) {
            val req = OneTimeWorkRequestBuilder<SyncWorker>()
                .setConstraints(Constraints.Builder().setRequiredNetworkType(NetworkType.CONNECTED).build())
                .setInputData(workDataOf("pa" to withPa))
                .setBackoffCriteria(BackoffPolicy.EXPONENTIAL, 30, TimeUnit.SECONDS)
                .build()
            WorkManager.getInstance(ctx).enqueueUniqueWork("sync", ExistingWorkPolicy.APPEND_OR_REPLACE, req)
        }

        fun schedulePeriodic(ctx: Context) {
            val req = PeriodicWorkRequestBuilder<SyncWorker>(30, TimeUnit.MINUTES)
                .setConstraints(Constraints.Builder().setRequiredNetworkType(NetworkType.CONNECTED).build())
                .build()
            WorkManager.getInstance(ctx).enqueueUniquePeriodicWork(
                "periodic-sync", ExistingPeriodicWorkPolicy.KEEP, req)
        }
    }
}
