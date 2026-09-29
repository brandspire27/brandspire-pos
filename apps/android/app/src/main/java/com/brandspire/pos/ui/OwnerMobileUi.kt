package com.brandspire.pos.ui

import android.app.Activity
import android.graphics.Color
import android.view.Gravity
import android.view.ViewGroup
import android.widget.Button
import android.widget.LinearLayout
import android.widget.ScrollView

internal fun Activity.ospDp(value: Int): Int = bsDp(value)
internal fun ospInk() = LaunchColors.ink
internal fun ospMuted() = LaunchColors.muted
internal fun ospBlue() = LaunchColors.blue
internal fun ospBg() = LaunchColors.bg
internal fun Activity.ospRounded(fill: Int, radius: Int, stroke: Int? = null) = bsRounded(fill, radius, stroke)

internal fun Activity.ospScreen(title: String, subtitle: String? = null): Pair<ScrollView, LinearLayout> {
    bsApplyWindowChrome()
    val scroll = ScrollView(this).apply {
        setBackgroundColor(LaunchColors.bg)
        clipToPadding = false
    }
    val root = LinearLayout(this).apply {
        orientation = LinearLayout.VERTICAL
        setPadding(bsDp(20), bsDp(20), bsDp(20), bsDp(36))
    }
    root.addView(bsTopBar(title, subtitle) { finish() })
    scroll.addView(root)
    return scroll to root
}

internal fun Activity.ospCard(): LinearLayout = bsCard(17)

internal fun Activity.ospPrimaryButton(textValue: String, onClick: () -> Unit): Button = bsPrimaryButton(textValue, onClick)

internal fun Activity.ospSecondaryButton(textValue: String, onClick: () -> Unit): Button = bsSecondaryButton(textValue, onClick)

internal fun Activity.ospCardParams() = LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT).apply {
    bottomMargin = bsDp(10)
}

internal fun Activity.ospSummaryHero(title: String, value: String, subtitle: String): LinearLayout = LinearLayout(this).apply {
    orientation = LinearLayout.VERTICAL
    setPadding(bsDp(18), bsDp(18), bsDp(18), bsDp(18))
    background = bsGradient(LaunchColors.navy, LaunchColors.blueDark, 20)
    addView(bsText(title.uppercase(), 9.5f, Color.rgb(189, 201, 222), true).apply { letterSpacing = .12f })
    addView(bsText(value, 28f, Color.WHITE, true).apply { setPadding(0, bsDp(7), 0, bsDp(5)) })
    addView(bsText(subtitle, 11.5f, Color.rgb(205, 214, 230)))
}
