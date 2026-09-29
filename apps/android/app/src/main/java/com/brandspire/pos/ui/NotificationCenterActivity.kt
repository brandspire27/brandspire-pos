package com.brandspire.pos.ui

import android.Manifest
import android.content.Intent
import android.content.pm.PackageManager
import android.graphics.Color
import android.os.Build
import android.os.Bundle
import android.view.Gravity
import android.view.ViewGroup
import android.widget.LinearLayout
import android.widget.TextView
import com.brandspire.pos.alerts.AlertEngine
import com.brandspire.pos.alerts.AlertSeverity
import com.brandspire.pos.auth.Workspace

class NotificationCenterActivity : android.app.Activity() {
    private lateinit var workspace: Workspace
    private lateinit var root: LinearLayout

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        workspace = Workspace(
            organizationId = intent.getStringExtra("organization_id").orEmpty(),
            organizationName = intent.getStringExtra("organization_name") ?: "Brandspire POS",
            role = intent.getStringExtra("role") ?: "STAFF",
            preferredLanguage = intent.getStringExtra("language") ?: "en",
            subscriptionStatus = intent.getStringExtra("subscription_status") ?: "UNKNOWN",
            endsAt = intent.getStringExtra("ends_at"),
            adminMessage = intent.getStringExtra("admin_message")
        )
        render()
    }

    override fun onResume() {
        super.onResume()
        if (::root.isInitialized) renderAlerts()
    }

    private fun render() {
        val (scroll, body) = ospScreen(
            txt("Notifications & Alerts", "Notifications & Alerts", "सूचनाएं और अलर्ट"),
            txt("Important business items in one place", "Important business items ek jagah", "महत्वपूर्ण व्यवसायिक सूचनाएं एक जगह")
        )
        root = body
        setContentView(scroll)

        val header = ospSummaryHero(
            txt("Business attention", "Business attention", "व्यवसाय पर ध्यान"),
            AlertEngine.collect(this, workspace).size.toString(),
            txt("Alerts refresh from your latest cached data.", "Alerts latest cached data se refresh hote hain.", "अलर्ट नवीनतम कैश किए गए डेटा से रीफ्रेश होते हैं।")
        )
        root.addView(header, ospCardParams().apply { topMargin = bsDp(18) })

        if (Build.VERSION.SDK_INT >= 33 && checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED) {
            root.addView(bsTintCard(LaunchColors.softBlue, Color.rgb(218, 226, 252), 16).apply {
                addView(bsText(txt("Enable device alerts", "Device alerts enable karo", "डिवाइस अलर्ट चालू करें"), 15f, LaunchColors.ink, true))
                addView(bsText(txt("Allow Brandspire POS to show low-stock, sync, printer and subscription alerts outside the app.", "Brandspire POS ko app ke bahar low-stock, sync, printer aur subscription alerts dikhane ki permission do.", "Brandspire POS को ऐप के बाहर कम स्टॉक, सिंक, प्रिंटर और सब्सक्रिप्शन अलर्ट दिखाने की अनुमति दें।"), 11.5f, LaunchColors.muted).apply { setPadding(0, bsDp(5), 0, bsDp(12)) })
                addView(bsPrimaryButton(txt("Enable alerts", "Alerts enable karo", "अलर्ट चालू करें")) {
                    requestPermissions(arrayOf(Manifest.permission.POST_NOTIFICATIONS), 1902)
                }, LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, bsDp(48)))
            }, ospCardParams())
        }

        root.addView(bsSection(txt("Current alerts", "Current alerts", "वर्तमान अलर्ट")))
        renderAlerts()
    }

    private fun renderAlerts() {
        val alerts = AlertEngine.collect(this, workspace)
        val existing = root.findViewWithTag<LinearLayout>("alert_dynamic")
        if (existing != null) root.removeView(existing)

        val dynamic = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            tag = "alert_dynamic"
        }
        if (alerts.isEmpty()) {
            dynamic.addView(bsEmptyState(
                txt("All clear", "Sab clear hai", "सब ठीक है"),
                txt("No business alerts need attention right now.", "Abhi kisi business alert ko attention nahi chahiye.", "अभी किसी व्यवसायिक अलर्ट पर ध्यान देने की आवश्यकता नहीं है।")
            ))
        } else {
            alerts.forEach { alert ->
                val palette = when (alert.severity) {
                    AlertSeverity.CRITICAL -> Triple(LaunchColors.softRed, LaunchColors.red, "!")
                    AlertSeverity.WARNING -> Triple(LaunchColors.softAmber, LaunchColors.amber, "!")
                    AlertSeverity.INFO -> Triple(LaunchColors.softBlue, LaunchColors.blue, "i")
                }
                val card = LinearLayout(this).apply {
                    orientation = LinearLayout.HORIZONTAL
                    gravity = Gravity.TOP
                    setPadding(bsDp(15), bsDp(15), bsDp(15), bsDp(15))
                    background = bsRounded(palette.first, 17)
                }
                card.addView(bsText(palette.third, 15f, palette.second, true).apply {
                    gravity = Gravity.CENTER
                    background = bsRounded(Color.WHITE, 12)
                }, LinearLayout.LayoutParams(bsDp(38), bsDp(38)).apply { marginEnd = bsDp(12) })
                val copy = LinearLayout(this).apply { orientation = LinearLayout.VERTICAL }
                copy.addView(bsText(alert.title, 14.5f, LaunchColors.ink, true))
                copy.addView(bsText(alert.message, 11.5f, LaunchColors.muted).apply { setPadding(0, bsDp(4), 0, 0) })
                card.addView(copy, LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1f))
                dynamic.addView(card, LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT).apply { bottomMargin = bsDp(10) })
            }
        }

        dynamic.addView(bsSecondaryButton(txt("Open Sync Center", "Sync Center kholo", "Sync Center खोलें")) {
            startActivity(Intent(this, SyncCenterActivity::class.java).apply {
                putExtra("organization_id", workspace.organizationId)
                putExtra("language", workspace.preferredLanguage)
            })
        }, LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, bsDp(48)).apply { topMargin = bsDp(6) })
        root.addView(dynamic)
    }

    override fun onRequestPermissionsResult(requestCode: Int, permissions: Array<out String>, grantResults: IntArray) {
        super.onRequestPermissionsResult(requestCode, permissions, grantResults)
        if (requestCode == 1902 && grantResults.firstOrNull() == PackageManager.PERMISSION_GRANTED) {
            AlertEngine.publishSystemSummary(this, workspace)
            render()
        }
    }

    private fun txt(en: String, hinglish: String, hi: String): String = when (workspace.preferredLanguage.lowercase()) {
        "hi", "hindi" -> hi
        "hinglish" -> hinglish
        else -> en
    }
}
