package me.hrishi.taskpa

import android.app.Activity
import android.appwidget.AppWidgetManager
import android.content.Intent
import android.graphics.Color
import android.graphics.Typeface
import android.os.Bundle
import android.view.Gravity
import android.widget.Button
import android.widget.LinearLayout
import android.widget.ScrollView
import android.widget.TextView

/**
 * Shown when a new widget is placed: pick what this instance shows. "Today" keeps the
 * classic top-5; weekday modes make a day card (the Reminders-grid look); "Someday"
 * shows the idea backlog. Choice is stored per widget id.
 */
class WidgetConfigActivity : Activity() {

    private var widgetId = AppWidgetManager.INVALID_APPWIDGET_ID

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        widgetId = intent?.extras?.getInt(
            AppWidgetManager.EXTRA_APPWIDGET_ID, AppWidgetManager.INVALID_APPWIDGET_ID
        ) ?: AppWidgetManager.INVALID_APPWIDGET_ID
        setResult(RESULT_CANCELED, Intent().putExtra(AppWidgetManager.EXTRA_APPWIDGET_ID, widgetId))
        if (widgetId == AppWidgetManager.INVALID_APPWIDGET_ID) { finish(); return }

        val options = listOf(
            "today" to "⭐ Today (top tasks)",
            "week" to "📋 This week",
            "mon" to "🚗 Monday", "tue" to "🦁 Tuesday", "wed" to "🥑 Wednesday",
            "thu" to "🦋 Thursday", "fri" to "🎟 Friday", "sat" to "🌸 Saturday",
            "sun" to "☀️ Sunday",
            "someday" to "💭 Someday (ideas)",
        )

        val root = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            setBackgroundResource(R.drawable.panel_bg)
            val p = (16 * resources.displayMetrics.density).toInt()
            setPadding(p, p, p, p)
        }
        root.addView(TextView(this).apply {
            text = "What should this widget show?"
            setTextColor(Color.parseColor("#111827"))
            textSize = 16f
            typeface = Typeface.DEFAULT_BOLD
            gravity = Gravity.CENTER
            val m = (10 * resources.displayMetrics.density).toInt()
            setPadding(0, 0, 0, m)
        })
        for ((key, label) in options) {
            root.addView(Button(this).apply {
                text = label
                isAllCaps = false
                textSize = 15f
                setTextColor(Color.parseColor("#111827"))
                setBackgroundResource(R.drawable.input_bg)
                setOnClickListener { pick(key) }
            }, LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.MATCH_PARENT, LinearLayout.LayoutParams.WRAP_CONTENT
            ).apply { topMargin = (6 * resources.displayMetrics.density).toInt() })
        }
        setContentView(ScrollView(this).apply { addView(root) })
    }

    private fun pick(mode: String) {
        Store.setWidgetMode(this, widgetId, mode)
        val mgr = AppWidgetManager.getInstance(this)
        mgr.updateAppWidget(widgetId, TaskWidget.build(this, widgetId))
        setResult(RESULT_OK, Intent().putExtra(AppWidgetManager.EXTRA_APPWIDGET_ID, widgetId))
        finish()
    }
}
