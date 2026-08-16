package me.hrishi.taskpa

import android.annotation.SuppressLint
import android.app.Activity
import android.content.Intent
import android.os.Bundle
import android.view.HapticFeedbackConstants
import android.view.View
import android.webkit.JavascriptInterface
import android.webkit.WebResourceRequest
import android.webkit.WebView
import android.webkit.WebViewClient
import androidx.core.splashscreen.SplashScreen.Companion.installSplashScreen
import androidx.core.view.ViewCompat
import androidx.core.view.WindowCompat
import androidx.core.view.WindowInsetsCompat
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
        installSplashScreen() // must run before super.onCreate() per the compat library's contract
        super.onCreate(savedInstanceState)
        // targetSdk 36 means edge-to-edge is enforced by the OS (not optional past API 35) -
        // content draws behind the status/nav bars unless we explicitly pad for them.
        WindowCompat.setDecorFitsSystemWindows(window, false)
        web = WebView(this)
        applyThemeChrome()
        ViewCompat.setOnApplyWindowInsetsListener(web) { view, insets ->
            val bars = insets.getInsets(WindowInsetsCompat.Type.systemBars())
            view.setPadding(bars.left, bars.top, bars.right, bars.bottom)
            insets
        }
        // Safe here specifically because this WebView only ever loads APP_URL (a fixed,
        // trusted, same-origin page) - shouldOverrideUrlLoading below sends anything else to
        // an external browser instead of loading it here, so untrusted content never runs
        // with this interface exposed to it.
        web.addJavascriptInterface(HapticBridge(web), "Android")
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
        // A listener registered before the view is attached isn't guaranteed to fire on its
        // own on every OS version - force one explicit dispatch now that it's really attached.
        ViewCompat.requestApplyInsets(web)
        web.loadUrl(APP_URL)
        SyncWorker.schedulePeriodic(this)
    }

    /** Matches the WebView background + status/nav bar to the last-known theme, using
     *  whatever's already cached in Store — kills the flash of the wrong color before the
     *  page's own CSS applies, especially noticeable on the darker themes. Re-run after
     *  mirror() too, in case a sync just landed a theme picked on another device. */
    private fun applyThemeChrome() {
        val pal = ThemePalette.paletteFor(Store.theme(this), Store.themeMode(this))
        val dark = Store.themeMode(this) == "dark"
        web.setBackgroundColor(pal.canvas)
        window.statusBarColor = pal.canvas
        window.navigationBarColor = pal.canvas
        @Suppress("DEPRECATION")
        run {
            val lightBits = View.SYSTEM_UI_FLAG_LIGHT_STATUS_BAR or View.SYSTEM_UI_FLAG_LIGHT_NAVIGATION_BAR
            val flags = window.decorView.systemUiVisibility
            window.decorView.systemUiVisibility = if (dark) flags and lightBits.inv() else flags or lightBits
        }
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
                applyThemeChrome()
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

/** window.Android.haptic() from the web layer — task-complete and board-move calls this so
 *  the phone actually vibrates on the app's most common interactions. performHapticFeedback
 *  (not raw Vibrator) needs no permission and respects the user's system haptics setting.
 *  JavascriptInterface methods run on a background thread, so the actual call is posted back
 *  to the view's UI thread. */
private class HapticBridge(private val view: View) {
    @JavascriptInterface
    fun haptic(kind: String?) {
        val constant = if (kind == "confirm") HapticFeedbackConstants.CONFIRM else HapticFeedbackConstants.VIRTUAL_KEY
        view.post { view.performHapticFeedback(constant) }
    }
}
