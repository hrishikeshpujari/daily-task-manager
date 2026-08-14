package me.hrishi.taskpa

/**
 * Theme palette shared by TaskWidget (row/card colors) and MainActivity (WebView background +
 * status bar, to kill the flash-of-wrong-color before the page's own CSS applies). Mirrors the
 * web app's THEMES catalog (index.html) seed-for-seed, including the contrast-corrected dark
 * accents. Semantic priority colors (used directly in TaskWidget's tierColor) intentionally stay
 * fixed across every theme; only these tokens follow the person's pick.
 */
object ThemePalette {
    data class Seed(val ink: Int, val canvas: Int, val accent: Int)
    data class Palette(val ink: Int, val canvas: Int, val paper: Int, val muted: Int, val accent: Int, val line2: Int)

    fun h(s: String): Int = android.graphics.Color.parseColor(s)

    fun mixC(a: Int, b: Int, t: Double): Int {
        val ar = (a shr 16) and 0xFF; val ag = (a shr 8) and 0xFF; val ab = a and 0xFF
        val br = (b shr 16) and 0xFF; val bg = (b shr 8) and 0xFF; val bb = b and 0xFF
        val r = (ar + (br - ar) * t).toInt().coerceIn(0, 255)
        val g = (ag + (bg - ag) * t).toInt().coerceIn(0, 255)
        val bl = (ab + (bb - ab) * t).toInt().coerceIn(0, 255)
        return (0xFF shl 24) or (r shl 16) or (g shl 8) or bl
    }

    private val THEME_SEEDS: Map<String, Pair<Seed, Seed>> = mapOf(
        "screener" to (Seed(h("#231f1a"), h("#f9f7f2"), h("#b82e4e")) to Seed(h("#f3ede4"), h("#1a1613"), h("#cf4d6a"))),
        "summer" to (Seed(h("#1c3a3a"), h("#fdf8ec"), h("#b5501a")) to Seed(h("#eaf6f4"), h("#0e2626"), h("#c76825"))),
        "fall" to (Seed(h("#2e1f14"), h("#faf3e7"), h("#ad5717")) to Seed(h("#f3e6d6"), h("#1f150e"), h("#c06f29"))),
        "winter" to (Seed(h("#1b2733"), h("#f3f8fc"), h("#2f7fd1")) to Seed(h("#e9f2fa"), h("#101823"), h("#4a89bd"))),
        "spring" to (Seed(h("#243318"), h("#f6faf0"), h("#3f8530")) to Seed(h("#eaf5e2"), h("#141f10"), h("#539340"))),
        "halloween" to (Seed(h("#20141f"), h("#f2e9da"), h("#a8540c")) to Seed(h("#f1e6d8"), h("#0f0a14"), h("#c7691b"))),
        "christmas" to (Seed(h("#1b2b1f"), h("#f7f5ef"), h("#b3261e")) to Seed(h("#eef0ea"), h("#0e1a12"), h("#e2564a"))),
        "diwali" to (Seed(h("#2b170f"), h("#fdf6e8"), h("#95611a")) to Seed(h("#f7ead0"), h("#1c0f0a"), h("#ac7628"))),
        "fun" to (Seed(h("#241a3d"), h("#fbf7ff"), h("#7c3aed")) to Seed(h("#f3ecff"), h("#160f26"), h("#8f77d7"))),
        "girly" to (Seed(h("#3d1f2e"), h("#fff5f8"), h("#c23d78")) to Seed(h("#fbe4ef"), h("#230f1a"), h("#d15698"))),
        "boyish" to (Seed(h("#101c2c"), h("#f3f6f9"), h("#2255c9")) to Seed(h("#e6edf5"), h("#0a121e"), h("#527ed9"))),
        "professional" to (Seed(h("#20242b"), h("#f5f6f7"), h("#33475b")) to Seed(h("#e8eaed"), h("#15181c"), h("#70859a"))),
        "tech" to (Seed(h("#0d1b12"), h("#f1f7f2"), h("#138c40")) to Seed(h("#d7ffe4"), h("#0a0f0d"), h("#1e9a50"))),
    )

    val STICKER_POOLS: Map<String, List<String>> = mapOf(
        "screener" to listOf("✅", "✨", "⭐", "📌", "📎", "🔖"),
        "summer" to listOf("☀️", "🍉", "🍹", "🕶️", "🏖️", "🌊", "🍦", "🐚", "🌺"),
        "fall" to listOf("🍂", "🎃", "🦃", "🌰", "🍁", "🧣", "☕", "🍎", "🦔"),
        "winter" to listOf("❄️", "⛄", "☃️", "🧣", "🧤", "🦌", "🌨️", "🧦", "🔥"),
        "spring" to listOf("🌸", "🌷", "🐝", "🦋", "🌱", "🐣", "🌼", "🐇", "🌦️"),
        "halloween" to listOf("🎃", "👻", "🕸️", "🦇", "🍬", "🕷️", "💀", "🧙", "🌙"),
        "christmas" to listOf("🎄", "🎅", "❄️", "🔔", "🎁", "⛄", "🦌", "🕯️", "⭐"),
        "diwali" to listOf("🪔", "✨", "🎇", "🌟", "🕉️", "💐", "🎆", "🧨", "🙏"),
        "fun" to listOf("🎉", "🎊", "🌈", "🎈", "🦄", "✨", "🍭", "🎨", "🥳"),
        "girly" to listOf("🎀", "💅", "💖", "🌸", "✨", "👛", "💋", "🩰", "🦄", "💄", "👗", "💕"),
        "boyish" to listOf("⚡", "🏀", "🎮", "🚀", "🔥", "🏈", "🤘", "🛹", "🥇"),
        "professional" to listOf("📎", "📊", "💼", "📈", "✅", "🖇️", "📅"),
        "tech" to listOf("💻", "🖥️", "⌨️", "🔌", "🤖", "👾", "🛰️", "🔋", "📡"),
    )

    fun paletteFor(themeId: String, mode: String): Palette {
        val pair = THEME_SEEDS[themeId] ?: THEME_SEEDS.getValue("screener")
        val dark = mode == "dark"
        val seed = if (dark) pair.second else pair.first
        val paper = if (dark) mixC(seed.canvas, seed.ink, 0.07) else mixC(seed.canvas, h("#ffffff"), 0.8)
        val muted = if (dark) mixC(seed.ink, seed.canvas, 0.45) else mixC(seed.ink, seed.canvas, 0.56)
        val line2 = if (dark) mixC(seed.canvas, seed.ink, 0.25) else mixC(seed.canvas, seed.ink, 0.19)
        return Palette(ink = seed.ink, canvas = seed.canvas, paper = paper, muted = muted, accent = seed.accent, line2 = line2)
    }

    fun randomSticker(themeId: String): String {
        val pool = STICKER_POOLS[themeId] ?: STICKER_POOLS.getValue("screener")
        return pool.random()
    }
}
