package com.brandspire.pos.ui

import android.app.Activity
import android.graphics.Color
import android.graphics.Typeface
import android.graphics.drawable.GradientDrawable
import android.text.InputType
import android.view.Gravity
import android.view.View
import android.view.ViewGroup
import android.widget.Button
import android.widget.EditText
import android.widget.LinearLayout
import android.widget.TextView

internal object LaunchColors {
    val bg = Color.rgb(246, 248, 252)
    val surface = Color.WHITE
    val ink = Color.rgb(16, 24, 40)
    val inkSoft = Color.rgb(52, 64, 84)
    val muted = Color.rgb(102, 112, 133)
    val subtle = Color.rgb(148, 163, 184)
    val border = Color.rgb(228, 231, 236)
    val borderStrong = Color.rgb(208, 213, 221)
    val blue = Color.rgb(49, 85, 217)
    val blueBright = Color.rgb(73, 105, 224)
    val blueDark = Color.rgb(36, 69, 184)
    val navy = Color.rgb(11, 20, 38)
    val softBlue = Color.rgb(238, 243, 255)
    val green = Color.rgb(4, 120, 87)
    val softGreen = Color.rgb(236, 253, 245)
    val amber = Color.rgb(180, 83, 9)
    val softAmber = Color.rgb(255, 247, 237)
    val red = Color.rgb(185, 28, 28)
    val softRed = Color.rgb(254, 242, 242)
}

internal fun Activity.bsDp(value: Int): Int = (value * resources.displayMetrics.density).toInt()

internal fun Activity.bsRounded(fill: Int, radius: Int, stroke: Int? = null): GradientDrawable = GradientDrawable().apply {
    shape = GradientDrawable.RECTANGLE
    cornerRadius = bsDp(radius).toFloat()
    setColor(fill)
    if (stroke != null) setStroke(bsDp(1), stroke)
}

internal fun Activity.bsGradient(start: Int, end: Int, radius: Int): GradientDrawable = GradientDrawable(
    GradientDrawable.Orientation.TL_BR,
    intArrayOf(start, end)
).apply {
    shape = GradientDrawable.RECTANGLE
    cornerRadius = bsDp(radius).toFloat()
}

internal fun Activity.bsText(
    value: String,
    size: Float,
    color: Int = LaunchColors.ink,
    medium: Boolean = false
): TextView = TextView(this).apply {
    text = value
    textSize = size
    setTextColor(color)
    typeface = Typeface.create(if (medium) "sans-serif-medium" else "sans-serif", Typeface.NORMAL)
    includeFontPadding = false
}

internal fun Activity.bsSection(value: String): TextView = bsText(value.uppercase(), 10.5f, LaunchColors.blue, true).apply {
    letterSpacing = .14f
    setPadding(0, bsDp(22), 0, bsDp(10))
}

internal fun Activity.bsCard(padding: Int = 16): LinearLayout = LinearLayout(this).apply {
    orientation = LinearLayout.VERTICAL
    setPadding(bsDp(padding), bsDp(padding), bsDp(padding), bsDp(padding))
    background = bsRounded(LaunchColors.surface, 20, LaunchColors.border)
    elevation = bsDp(1).toFloat()
}

internal fun Activity.bsTintCard(fill: Int, stroke: Int? = null, padding: Int = 16): LinearLayout = LinearLayout(this).apply {
    orientation = LinearLayout.VERTICAL
    setPadding(bsDp(padding), bsDp(padding), bsDp(padding), bsDp(padding))
    background = bsRounded(fill, 18, stroke)
}

internal fun Activity.bsPrimaryButton(label: String, action: () -> Unit): Button = Button(this).apply {
    text = label
    isAllCaps = false
    textSize = 14f
    typeface = Typeface.create("sans-serif-medium", Typeface.NORMAL)
    setTextColor(Color.WHITE)
    minHeight = bsDp(48)
    minimumWidth = bsDp(48)
    contentDescription = label
    background = bsRounded(LaunchColors.blue, 14)
    stateListAnimator = null
    elevation = 0f
    setOnClickListener { action() }
}

internal fun Activity.bsDarkButton(label: String, action: () -> Unit): Button = Button(this).apply {
    text = label
    isAllCaps = false
    textSize = 14f
    typeface = Typeface.create("sans-serif-medium", Typeface.NORMAL)
    setTextColor(Color.WHITE)
    minHeight = bsDp(48)
    minimumWidth = bsDp(48)
    contentDescription = label
    background = bsRounded(LaunchColors.navy, 14)
    stateListAnimator = null
    elevation = 0f
    setOnClickListener { action() }
}

internal fun Activity.bsSecondaryButton(label: String, action: () -> Unit): Button = Button(this).apply {
    text = label
    isAllCaps = false
    textSize = 13f
    typeface = Typeface.create("sans-serif-medium", Typeface.NORMAL)
    setTextColor(LaunchColors.blue)
    minHeight = bsDp(48)
    minimumWidth = bsDp(48)
    contentDescription = label
    background = bsRounded(LaunchColors.softBlue, 14, Color.rgb(218, 226, 252))
    stateListAnimator = null
    elevation = 0f
    setOnClickListener { action() }
}

internal fun Activity.bsGhostButton(label: String, action: () -> Unit): Button = Button(this).apply {
    text = label
    isAllCaps = false
    textSize = 13f
    typeface = Typeface.create("sans-serif-medium", Typeface.NORMAL)
    setTextColor(LaunchColors.inkSoft)
    minHeight = bsDp(48)
    minimumWidth = bsDp(48)
    contentDescription = label
    background = bsRounded(Color.WHITE, 14, LaunchColors.border)
    stateListAnimator = null
    elevation = 0f
    setOnClickListener { action() }
}

internal fun Activity.bsDangerButton(label: String, action: () -> Unit): Button = Button(this).apply {
    text = label
    isAllCaps = false
    textSize = 13f
    typeface = Typeface.create("sans-serif-medium", Typeface.NORMAL)
    setTextColor(LaunchColors.red)
    minHeight = bsDp(48)
    minimumWidth = bsDp(48)
    contentDescription = label
    background = bsRounded(LaunchColors.softRed, 14, Color.rgb(254, 226, 226))
    stateListAnimator = null
    elevation = 0f
    setOnClickListener { action() }
}

internal fun Activity.bsInput(hintValue: String, password: Boolean = false): EditText = EditText(this).apply {
    hint = hintValue
    textSize = 15f
    setTextColor(LaunchColors.ink)
    setHintTextColor(LaunchColors.subtle)
    setPadding(bsDp(16), 0, bsDp(16), 0)
    setSingleLine(true)
    minHeight = bsDp(52)
    importantForAccessibility = View.IMPORTANT_FOR_ACCESSIBILITY_YES
    background = bsRounded(Color.WHITE, 14, LaunchColors.border)
    inputType = if (password) {
        InputType.TYPE_CLASS_TEXT or InputType.TYPE_TEXT_VARIATION_PASSWORD
    } else {
        InputType.TYPE_CLASS_TEXT
    }
}

internal fun Activity.bsLogoMark(size: Int = 48): TextView = bsText("BP", 17f, Color.WHITE, true).apply {
    gravity = Gravity.CENTER
    background = bsGradient(LaunchColors.blueBright, LaunchColors.blue, 15)
    layoutParams = LinearLayout.LayoutParams(bsDp(size), bsDp(size))
}

internal fun Activity.bsPill(label: String, online: Boolean = true): TextView = bsText(
    label,
    10.5f,
    if (online) LaunchColors.green else LaunchColors.amber,
    true
).apply {
    setPadding(bsDp(11), bsDp(7), bsDp(11), bsDp(7))
    background = bsRounded(if (online) LaunchColors.softGreen else LaunchColors.softAmber, 99)
}

internal fun Activity.bsNeutralPill(label: String): TextView = bsText(label, 10f, LaunchColors.inkSoft, true).apply {
    setPadding(bsDp(10), bsDp(6), bsDp(10), bsDp(6))
    background = bsRounded(Color.rgb(241, 245, 249), 99)
}

internal fun Activity.bsIconBadge(symbol: String, dark: Boolean = false): TextView = bsText(
    symbol,
    15f,
    if (dark) Color.WHITE else LaunchColors.blue,
    true
).apply {
    gravity = Gravity.CENTER
    background = bsRounded(if (dark) Color.argb(45, 255, 255, 255) else LaunchColors.softBlue, 13)
    layoutParams = LinearLayout.LayoutParams(bsDp(42), bsDp(42))
}

internal fun Activity.bsTopBar(title: String, subtitle: String? = null, onBack: (() -> Unit)? = null): LinearLayout = LinearLayout(this).apply {
    orientation = LinearLayout.HORIZONTAL
    gravity = Gravity.CENTER_VERTICAL
    if (onBack != null) {
        addView(bsGhostButton("←") { onBack() }.apply { contentDescription = "Back" }, LinearLayout.LayoutParams(bsDp(48), bsDp(48)).apply { marginEnd = bsDp(12) })
    }
    val copy = LinearLayout(this@bsTopBar).apply { orientation = LinearLayout.VERTICAL }
    copy.addView(bsText(title, 25f, LaunchColors.ink, true))
    if (!subtitle.isNullOrBlank()) copy.addView(bsText(subtitle, 12.5f, LaunchColors.muted).apply { setPadding(0, bsDp(4), 0, 0) })
    addView(copy, LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1f))
}

internal fun Activity.bsInfoRow(icon: String, title: String, subtitle: String, action: (() -> Unit)? = null): LinearLayout = bsCard(15).apply {
    orientation = LinearLayout.HORIZONTAL
    contentDescription = "$title. $subtitle"
    isFocusable = action != null
    gravity = Gravity.CENTER_VERTICAL
    addView(bsIconBadge(icon), LinearLayout.LayoutParams(bsDp(42), bsDp(42)).apply { marginEnd = bsDp(12) })
    val copy = LinearLayout(this@bsInfoRow).apply { orientation = LinearLayout.VERTICAL }
    copy.addView(bsText(title, 14.5f, LaunchColors.ink, true))
    copy.addView(bsText(subtitle, 11.5f, LaunchColors.muted).apply { setPadding(0, bsDp(3), 0, 0) })
    addView(copy, LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1f))
    if (action != null) {
        addView(bsText("→", 20f, LaunchColors.blue, true))
        isClickable = true
        setOnClickListener { action() }
    }
}

internal fun Activity.bsEmptyState(title: String, subtitle: String): LinearLayout = bsTintCard(Color.rgb(249, 250, 252), LaunchColors.border, 18).apply {
    gravity = Gravity.CENTER_HORIZONTAL
    addView(bsText("—", 21f, LaunchColors.subtle, true).apply { gravity = Gravity.CENTER })
    addView(bsText(title, 14f, LaunchColors.inkSoft, true).apply { gravity = Gravity.CENTER; setPadding(0, bsDp(6), 0, bsDp(3)) })
    addView(bsText(subtitle, 11.5f, LaunchColors.muted).apply { gravity = Gravity.CENTER })
}

internal fun Activity.bsApplyWindowChrome() {
    window.statusBarColor = LaunchColors.bg
    window.navigationBarColor = Color.WHITE
    @Suppress("DEPRECATION")
    window.decorView.systemUiVisibility = View.SYSTEM_UI_FLAG_LIGHT_STATUS_BAR
}

internal fun Activity.bsBottomNavItem(symbol: String, label: String, active: Boolean = false, action: () -> Unit): LinearLayout = LinearLayout(this).apply {
    orientation = LinearLayout.VERTICAL
    gravity = Gravity.CENTER
    setPadding(bsDp(5), bsDp(6), bsDp(5), bsDp(5))
    background = if (active) bsRounded(LaunchColors.softBlue, 14) else null
    addView(bsText(symbol, 16f, if (active) LaunchColors.blue else LaunchColors.muted, true).apply { gravity = Gravity.CENTER })
    addView(bsText(label, 9.5f, if (active) LaunchColors.blue else LaunchColors.muted, active).apply {
        gravity = Gravity.CENTER
        setPadding(0, bsDp(2), 0, 0)
    })
    isClickable = true
    isFocusable = true
    contentDescription = label
    minimumHeight = bsDp(48)
    setOnClickListener { action() }
}

internal fun Activity.bsBottomNav(items: List<LinearLayout>): LinearLayout = LinearLayout(this).apply {
    orientation = LinearLayout.HORIZONTAL
    gravity = Gravity.CENTER_VERTICAL
    setPadding(bsDp(8), bsDp(7), bsDp(8), bsDp(7))
    background = bsRounded(Color.WHITE, 22, LaunchColors.border)
    elevation = bsDp(10).toFloat()
    weightSum = items.size.toFloat()
    items.forEach { addView(it, LinearLayout.LayoutParams(0, bsDp(58), 1f)) }
}
