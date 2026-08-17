package me.hrishi.taskpa

import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.os.Build
import androidx.core.app.NotificationCompat
import androidx.core.app.NotificationManagerCompat
import org.json.JSONArray

/**
 * Due-today / overdue reminders, checked at the end of every SyncWorker run (periodic or
 * quick-add-triggered - doesn't matter which, it just looks at current task state). Each task
 * notifies once per (reason, due-date) via Store.notifiedKeys - rescheduling a task changes its
 * due value, which naturally produces a fresh key instead of needing explicit invalidation.
 */
object Notifications {
    const val CHANNEL_ID = "task_reminders"
    private const val NOTIF_DUE_TODAY = 1001
    private const val NOTIF_OVERDUE = 1002

    private fun ensureChannel(ctx: Context) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return
        val mgr = ctx.getSystemService(NotificationManager::class.java) ?: return
        if (mgr.getNotificationChannel(CHANNEL_ID) != null) return
        val channel = NotificationChannel(CHANNEL_ID, "Task reminders", NotificationManager.IMPORTANCE_DEFAULT)
        channel.description = "Due-today and overdue task reminders"
        mgr.createNotificationChannel(channel)
    }

    fun checkAndNotify(ctx: Context, tasks: JSONArray) {
        if (!NotificationManagerCompat.from(ctx).areNotificationsEnabled()) return
        val today = Store.localKey()
        val already = Store.notifiedKeys(ctx)
        val newKeys = ArrayList<String>()
        val dueToday = ArrayList<String>()
        val overdue = ArrayList<String>()
        for (i in 0 until tasks.length()) {
            val t = tasks.optJSONObject(i) ?: continue
            if (t.optBoolean("deleted") || t.optBoolean("done")) continue
            val due = if (t.isNull("due")) "" else t.optString("due", "")
            if (due.isBlank()) continue
            val reason = when { due < today -> "overdue"; due == today -> "today"; else -> null } ?: continue
            val key = "${t.optString("id")}:$reason:$due"
            if (key in already) continue
            newKeys.add(key)
            (if (reason == "today") dueToday else overdue).add(t.optString("text"))
        }
        if (newKeys.isEmpty()) return
        ensureChannel(ctx)
        if (dueToday.isNotEmpty()) post(ctx, NOTIF_DUE_TODAY, "📅", "due today", dueToday)
        if (overdue.isNotEmpty()) post(ctx, NOTIF_OVERDUE, "⚠️", "overdue", overdue)
        Store.addNotifiedKeys(ctx, newKeys)
    }

    private fun post(ctx: Context, id: Int, emoji: String, label: String, texts: List<String>) {
        val title = if (texts.size == 1) "$emoji ${texts[0]}" else "$emoji ${texts.size} tasks $label"
        val body = if (texts.size == 1) "Tap to open Daily Task Manager"
            else texts.take(4).joinToString(" · ") + if (texts.size > 4) "…" else ""
        val openApp = PendingIntent.getActivity(ctx, 900 + id,
            Intent(ctx, MainActivity::class.java).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK),
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)
        val notif = NotificationCompat.Builder(ctx, CHANNEL_ID)
            .setSmallIcon(R.drawable.ic_launcher_foreground)
            .setContentTitle(title)
            .setContentText(body)
            .setAutoCancel(true)
            .setContentIntent(openApp)
            .build()
        try { NotificationManagerCompat.from(ctx).notify(id, notif) } catch (_: SecurityException) { /* permission revoked mid-flight */ }
    }
}
