package me.hrishi.taskpa

import android.Manifest
import android.annotation.SuppressLint
import android.app.Activity
import android.content.Intent
import android.content.pm.PackageManager
import android.os.Build
import android.os.Bundle
import android.view.HapticFeedbackConstants
import android.view.View
import android.webkit.JavascriptInterface
import android.webkit.WebResourceRequest
import android.webkit.WebView
import android.webkit.WebViewClient
import androidx.core.app.ActivityCompat
import androidx.core.content.ContextCompat
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
    private var lastInsets: androidx.core.graphics.Insets? = null

    @SuppressLint("SetJavaScriptEnabled")
    override fun onCreate(savedInstanceState: Bundle?) {
        installSplashScreen() // must run before super.onCreate() per the compat library's contract
        super.onCreate(savedInstanceState)
        // targetSdk 36 means edge-to-edge is enforced by the OS (not optional past API 35) -
        // content draws behind the status/nav bars unless we explicitly pad for them.
        WindowCompat.setDecorFitsSystemWindows(window, false)
        // Debug builds only (checked via the debuggable flag, not BuildConfig - avoids needing
        // buildFeatures.buildConfig=true) - lets chrome://inspect / CDP attach to this WebView
        // for real on-device debugging instead of guessing at tap coordinates blind.
        if ((applicationInfo.flags and android.content.pm.ApplicationInfo.FLAG_DEBUGGABLE) != 0) {
            WebView.setWebContentsDebuggingEnabled(true)
        }
        web = WebView(this)
        applyThemeChrome()
        // Status-bar overlap: targetSdk 36 forces edge-to-edge, and Android WebView does NOT
        // reliably support CSS env(safe-area-inset-*) (unlike iOS Safari, where it works). So
        // rather than native view padding (which proved flaky on-device) OR CSS env() (which
        // resolves to 0 in this WebView), measure the real system-bar insets and inject them
        // as CSS custom properties the stylesheet consumes deterministically. Re-fires live
        // when the bar height changes (ongoing-call chip, rotation) and is re-injected after
        // each page load below. No native padding here on purpose - CSS owns all the insets.
        ViewCompat.setOnApplyWindowInsetsListener(web) { _, insets ->
            lastInsets = insets.getInsets(WindowInsetsCompat.Type.systemBars())
            injectInsets()
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

            override fun onPageFinished(view: WebView, url: String) {
                injectInsets() // re-apply, in case insets arrived before the page was ready to receive them
                mirror()
            }
        }
        setContentView(web)
        // A listener registered before the view is attached isn't guaranteed to fire on its
        // own on every OS version - force one explicit dispatch now that it's really attached.
        ViewCompat.requestApplyInsets(web)
        web.loadUrl(APP_URL)
        SyncWorker.schedulePeriodic(this)
        // Due-task reminders (Notifications.kt) are best-effort and silently no-op without this -
        // ask once on launch; a decline just means SyncWorker's areNotificationsEnabled() check
        // keeps skipping them, nothing else depends on the answer.
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU &&
            ContextCompat.checkSelfPermission(this, Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED) {
            ActivityCompat.requestPermissions(this, arrayOf(Manifest.permission.POST_NOTIFICATIONS), 1001)
        }
    }

    /** Push the real system-bar insets into the page as CSS vars (--sb-top/-bottom/-left/-right),
     *  converted from physical px to CSS px (÷ density). The stylesheet reads them via
     *  var(--sb-top, env(safe-area-inset-top)) — so Android uses these exact measured values,
     *  while a real iOS Safari PWA (her iPhone) still falls back to env(), which works there. */
    private fun injectInsets() {
        val b = lastInsets ?: return
        val d = resources.displayMetrics.density
        val js = "(function(s){" +
            "s.setProperty('--sb-top','${b.top / d}px');" +
            "s.setProperty('--sb-bottom','${b.bottom / d}px');" +
            "s.setProperty('--sb-left','${b.left / d}px');" +
            "s.setProperty('--sb-right','${b.right / d}px');" +
            "})(document.documentElement.style)"
        web.evaluateJavascript(js, null)
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
