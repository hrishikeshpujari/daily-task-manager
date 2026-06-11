package me.hrishi.taskpa

import android.annotation.SuppressLint
import android.app.Activity
import android.content.Intent
import android.graphics.Color
import android.os.Bundle
import android.webkit.WebResourceRequest
import android.webkit.WebView
import android.webkit.WebViewClient
import org.json.JSONObject
import org.json.JSONTokener

/**
 * Thin shell around the live web app. The web app stays the single UI; this activity's
 * job is (a) full-screen WebView and (b) mirroring localStorage (config/tasks/brief) into
 * SharedPreferences so the widget and background sync share the same credentials and data
 * without the user entering anything twice.
 */
class MainActivity : Activity() {
    private lateinit var web: WebView

    @SuppressLint("SetJavaScriptEnabled")
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        web = WebView(this)
        web.setBackgroundColor(Color.parseColor("#0e0f13"))
        web.settings.javaScriptEnabled = true
        web.settings.domStorageEnabled = true
        web.webViewClient = object : WebViewClient() {
            override fun shouldOverrideUrlLoading(view: WebView, request: WebResourceRequest): Boolean {
                // Keep the app in the WebView; external links (e.g. the GitHub token page) open in the browser.
                return if (request.url.host == APP_HOST) false
                else {
                    try { startActivity(Intent(Intent.ACTION_VIEW, request.url)) } catch (_: Exception) {}
                    true
                }
            }

            override fun onPageFinished(view: WebView, url: String) = mirror()
        }
        setContentView(web)
        web.loadUrl(APP_URL)
        SyncWorker.schedulePeriodic(this)
    }

    private fun mirror() {
        web.evaluateJavascript(
            "(function(){try{return JSON.stringify({cfg:localStorage.getItem('dtm.config')," +
                "tasks:localStorage.getItem('dtm.tasks'),brief:localStorage.getItem('dtm.brief')})}" +
                "catch(e){return null}})()"
        ) { raw ->
            try {
                val s = JSONTokener(raw).nextValue() as? String ?: return@evaluateJavascript
                val o = JSONObject(s)
                Store.mirrorFromWeb(
                    this,
                    if (o.isNull("cfg")) null else o.optString("cfg"),
                    if (o.isNull("tasks")) null else o.optString("tasks"),
                    if (o.isNull("brief")) null else o.optString("brief")
                )
                TaskWidget.updateAll(this)
            } catch (_: Exception) {}
        }
    }

    override fun onPause() {
        mirror()
        super.onPause()
    }

    @Deprecated("Deprecated in Java")
    override fun onBackPressed() {
        if (web.canGoBack()) web.goBack() else super.onBackPressed()
    }

    companion object {
        const val APP_HOST = "hrishikeshpujari.github.io"
        const val APP_URL = "https://hrishikeshpujari.github.io/daily-task-manager/"
    }
}
