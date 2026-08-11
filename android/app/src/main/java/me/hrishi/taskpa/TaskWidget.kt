package me.hrishi.taskpa

import android.app.PendingIntent
import android.appwidget.AppWidgetManager
import android.appwidget.AppWidgetProvider
import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.net.Uri
import android.view.View
import android.widget.RemoteViews

/**
 * Home-screen widget: today's top 5 (Claude-ranked, 🎯 #1 first), the daily-brief line,
 * done-today count, one-tap done circles, and a ➕ quick-add. Top-5 rows are fixed views
 * (not a collection) so every element can carry its own PendingIntent.
 */
class TaskWidget : AppWidgetProvider() {

    override fun onUpdate(context: Context, manager: AppWidgetManager, ids: IntArray) {
        for (id in ids) manager.updateAppWidget(id, build(context))
    }

    override fun onEnabled(context: Context) {
        SyncWorker.schedulePeriodic(context)
        SyncWorker.enqueueOnce(context, withPa = false)
    }

    override fun onReceive(context: Context, intent: Intent) {
        super.onReceive(context, intent)
        when (intent.action) {
            ACTION_DONE -> {
                val id = intent.data?.lastPathSegment ?: return
                Store.markDone(context, id)
                updateAll(context)
                SyncWorker.enqueueOnce(context, withPa = false)
            }
            ACTION_REFRESH -> SyncWorker.enqueueOnce(context, withPa = false)
        }
    }

    companion object {
        const val ACTION_DONE = "me.hrishi.taskpa.DONE"
        const val ACTION_REFRESH = "me.hrishi.taskpa.REFRESH"

        private val ROWS = intArrayOf(R.id.row1, R.id.row2, R.id.row3, R.id.row4, R.id.row5)
        private val CHECKS = intArrayOf(R.id.check1, R.id.check2, R.id.check3, R.id.check4, R.id.check5)
        private val TEXTS = intArrayOf(R.id.text1, R.id.text2, R.id.text3, R.id.text4, R.id.text5)
        private val WHYS = intArrayOf(R.id.why1, R.id.why2, R.id.why3, R.id.why4, R.id.why5)

        fun updateAll(context: Context) {
            val mgr = AppWidgetManager.getInstance(context)
            val ids = mgr.getAppWidgetIds(ComponentName(context, TaskWidget::class.java))
            for (id in ids) mgr.updateAppWidget(id, build(context))
        }

        /** Priority tier color for the leading dot (matches the web app's High/Med/Low). */
        private fun tierColor(t: org.json.JSONObject): Int {
            if (t.optBoolean("important")) return 0xFFEF4444.toInt()
            if (t.has("aiPriority") && !t.isNull("aiPriority")) {
                val p = t.optInt("aiPriority")
                return when { p >= 70 -> 0xFFEF4444.toInt(); p >= 40 -> 0xFFF59E0B.toInt(); else -> 0xFF22C55E.toInt() }
            }
            return 0xFF969CAD.toInt()
        }

        /** "14:30" -> "2:30 PM" for the sub line; empty when the task has no time. */
        private fun timeChip(t: org.json.JSONObject): String {
            val hm = if (t.isNull("time")) "" else t.optString("time", "")
            if (!Regex("^\\d{2}:\\d{2}$").matches(hm)) return ""
            return try {
                val d = java.text.SimpleDateFormat("HH:mm", java.util.Locale.US).parse(hm)!!
                "🕐 " + java.text.SimpleDateFormat("h:mm a", java.util.Locale.US).format(d)
            } catch (e: Exception) { "" }
        }

        /** Short day label for a task's due date: "⚠ late", "Today", "Tmrw", or "Thu". */
        private fun dayChip(t: org.json.JSONObject): String {
            val due = if (t.isNull("due")) "" else t.optString("due", "")
            if (due.isBlank()) return ""
            val today = Store.localKey()
            if (due < today) return "⚠ late"
            if (due == today) return "Today"
            if (due == Store.localKey(System.currentTimeMillis() + Store.DAY)) return "Tmrw"
            return try {
                val d = java.text.SimpleDateFormat("yyyy-MM-dd", java.util.Locale.US).parse(due)!!
                java.text.SimpleDateFormat("EEE", java.util.Locale.US).format(d)
            } catch (e: Exception) { "" }
        }

        private fun broadcast(context: Context, intent: Intent, req: Int): PendingIntent =
            PendingIntent.getBroadcast(context, req, intent,
                PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)

        fun build(context: Context): RemoteViews {
            val v = RemoteViews(context.packageName, R.layout.widget_task)
            val tasks = Store.loadTasks(context)
            val open = Store.openActive(tasks)

            v.setTextViewText(R.id.doneCount, "✓ " + Store.doneToday(tasks) + " today")

            val brief = Store.briefLine(context)
            if (brief.isNotBlank()) {
                v.setViewVisibility(R.id.brief, View.VISIBLE)
                v.setTextViewText(R.id.brief, "✨ $brief")
            } else v.setViewVisibility(R.id.brief, View.GONE)

            val openApp = PendingIntent.getActivity(context, 1,
                Intent(context, MainActivity::class.java).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK),
                PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)

            for (i in ROWS.indices) {
                if (i < open.size) {
                    val t = open[i]
                    v.setViewVisibility(ROWS[i], View.VISIBLE)
                    val pinned = t.optString("pinnedFor") == Store.localKey()
                    if (pinned) v.setTextViewText(TEXTS[i], "🎯 " + t.optString("text"))
                    else {
                        val sp = android.text.SpannableString("● " + t.optString("text"))
                        sp.setSpan(android.text.style.ForegroundColorSpan(tierColor(t)), 0, 1,
                            android.text.Spanned.SPAN_EXCLUSIVE_EXCLUSIVE)
                        v.setTextViewText(TEXTS[i], sp)
                    }
                    val why = t.optString("why")
                    val day = dayChip(t)
                    val sub = listOf(day, timeChip(t), if (why.isNotBlank()) "✦ $why" else "")
                        .filter { it.isNotBlank() }.joinToString("  ")
                    if (sub.isNotBlank()) {
                        v.setViewVisibility(WHYS[i], View.VISIBLE)
                        v.setTextViewText(WHYS[i], sub)
                    } else v.setViewVisibility(WHYS[i], View.GONE)

                    val done = Intent(context, TaskWidget::class.java)
                        .setAction(ACTION_DONE)
                        .setData(Uri.parse("taskpa://done/" + t.optString("id")))
                    v.setOnClickPendingIntent(CHECKS[i], broadcast(context, done, 100 + i))
                    v.setOnClickPendingIntent(ROWS[i], openApp)
                } else v.setViewVisibility(ROWS[i], View.GONE)
            }

            v.setViewVisibility(R.id.empty, if (open.isEmpty()) View.VISIBLE else View.GONE)
            v.setOnClickPendingIntent(R.id.header, openApp)
            v.setOnClickPendingIntent(R.id.empty, openApp)

            val quickAdd = PendingIntent.getActivity(context, 2,
                Intent(context, QuickAddActivity::class.java).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK),
                PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)
            v.setOnClickPendingIntent(R.id.addBtn, quickAdd)

            val refresh = Intent(context, TaskWidget::class.java).setAction(ACTION_REFRESH)
            v.setOnClickPendingIntent(R.id.refreshBtn, broadcast(context, refresh, 3))

            return v
        }
    }
}
