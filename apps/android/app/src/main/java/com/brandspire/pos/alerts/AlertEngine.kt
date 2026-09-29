package com.brandspire.pos.alerts

import android.Manifest
import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.os.Build
import com.brandspire.pos.auth.Workspace
import com.brandspire.pos.data.OfflineDatabase
import com.brandspire.pos.ui.NotificationCenterActivity
import java.time.LocalDate
import java.time.ZoneId
import java.time.temporal.ChronoUnit

enum class AlertSeverity { INFO, WARNING, CRITICAL }

data class BrandspireAlert(
    val id: String,
    val title: String,
    val message: String,
    val severity: AlertSeverity
)

/**
 * Local-first business alert engine.
 * It intentionally uses cached operational data so alerts still work without internet.
 * Server push can be layered later without replacing this source.
 */
object AlertEngine {
    private const val CHANNEL_ID = "brandspire_business_alerts"
    private const val NOTIFICATION_ID = 1901
    private const val LOW_STOCK_THRESHOLD = 5.0

    fun collect(context: Context, workspace: Workspace): List<BrandspireAlert> {
        val db = OfflineDatabase(context)
        val lang = workspace.preferredLanguage
        val alerts = mutableListOf<BrandspireAlert>()

        val failedSync = db.failedSyncCount()
        if (failedSync > 0) {
            alerts += BrandspireAlert(
                "sync_failed",
                t(lang, "Sync needs attention", "Sync ko attention chahiye", "सिंक पर ध्यान दें"),
                t(lang, "$failedSync item(s) failed to sync. Open Sync Center and retry.", "$failedSync item sync nahi hua. Sync Center se retry karo.", "$failedSync आइटम सिंक नहीं हुए। Sync Center से दोबारा प्रयास करें।"),
                AlertSeverity.CRITICAL
            )
        } else {
            val pending = db.pendingCount()
            if (pending > 0) {
                alerts += BrandspireAlert(
                    "sync_pending",
                    t(lang, "Pending sync", "Sync pending hai", "सिंक लंबित है"),
                    t(lang, "$pending item(s) are safely queued on this device.", "$pending item device par safely queued hain.", "$pending आइटम इस डिवाइस पर सुरक्षित रूप से कतार में हैं।"),
                    AlertSeverity.INFO
                )
            }
        }

        val printQueue = db.printQueueCount()
        if (printQueue > 0) {
            alerts += BrandspireAlert(
                "print_queue",
                t(lang, "Print retry pending", "Print retry pending hai", "प्रिंट दोबारा करना बाकी है"),
                t(lang, "$printQueue receipt(s) are waiting for printer retry.", "$printQueue receipt printer retry ke liye wait kar rahe hain.", "$printQueue रसीदें प्रिंटर से दोबारा प्रिंट होने की प्रतीक्षा में हैं।"),
                AlertSeverity.WARNING
            )
        }

        val lowStock = db.cachedProducts(workspace.organizationId)
            .filter { it.stock <= LOW_STOCK_THRESHOLD }
            .sortedBy { it.stock }
        if (lowStock.isNotEmpty()) {
            val names = lowStock.take(3).joinToString(", ") { it.name }
            alerts += BrandspireAlert(
                "low_stock",
                t(lang, "Low stock", "Low stock", "कम स्टॉक"),
                t(lang, "${lowStock.size} product(s) are at 5 units or less: $names", "${lowStock.size} product 5 units ya usse kam hain: $names", "${lowStock.size} उत्पाद 5 यूनिट या उससे कम हैं: $names"),
                AlertSeverity.WARNING
            )
        }

        if (workspace.role == "OWNER") {
            val dueCustomers = db.cachedCustomers(workspace.organizationId).filter { it.outstandingBalance > 0.009 }
            if (dueCustomers.isNotEmpty()) {
                val totalDue = dueCustomers.sumOf { it.outstandingBalance }
                alerts += BrandspireAlert(
                    "customer_dues",
                    t(lang, "Customer dues", "Customer baaki", "ग्राहक बकाया"),
                    t(lang, "${dueCustomers.size} customer(s) have ₹${money(totalDue)} outstanding.", "${dueCustomers.size} customer ke ₹${money(totalDue)} baaki hain.", "${dueCustomers.size} ग्राहकों का ₹${money(totalDue)} बकाया है।"),
                    AlertSeverity.INFO
                )
            }

            subscriptionAlert(workspace)?.let(alerts::add)

            if (!workspace.adminMessage.isNullOrBlank()) {
                alerts += BrandspireAlert(
                    "admin_message",
                    t(lang, "Message from Brandspire", "Brandspire ka message", "Brandspire का संदेश"),
                    workspace.adminMessage!!.trim(),
                    AlertSeverity.INFO
                )
            }
        }

        return alerts.sortedWith(compareBy<BrandspireAlert> {
            when (it.severity) {
                AlertSeverity.CRITICAL -> 0
                AlertSeverity.WARNING -> 1
                AlertSeverity.INFO -> 2
            }
        }.thenBy { it.title })
    }

    fun publishSystemSummary(context: Context, workspace: Workspace) {
        val alerts = collect(context, workspace)
        val important = alerts.filter { it.severity != AlertSeverity.INFO }
        if (important.isEmpty()) return
        if (!canNotify(context)) return

        val fingerprint = important.joinToString("|") { "${it.id}:${it.message}" }.hashCode().toString()
        val prefs = context.getSharedPreferences("brandspire_alert_state", Context.MODE_PRIVATE)
        if (prefs.getString("last_system_fingerprint", null) == fingerprint) return

        val manager = context.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
        ensureChannel(manager)

        val openIntent = Intent(context, NotificationCenterActivity::class.java).apply {
            flags = Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP
            putWorkspace(this, workspace)
        }
        val pendingIntent = PendingIntent.getActivity(
            context,
            1901,
            openIntent,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        )

        val top = important.first()
        val title = if (important.size == 1) top.title else "Brandspire POS · ${important.size} alerts"
        val text = if (important.size == 1) top.message else important.take(2).joinToString(" • ") { it.title }

        val notification = Notification.Builder(context, CHANNEL_ID)
            .setSmallIcon(android.R.drawable.ic_dialog_alert)
            .setContentTitle(title)
            .setContentText(text)
            .setStyle(Notification.BigTextStyle().bigText(text))
            .setAutoCancel(true)
            .setContentIntent(pendingIntent)
            .setCategory(Notification.CATEGORY_STATUS)
            .build()

        manager.notify(NOTIFICATION_ID, notification)
        prefs.edit().putString("last_system_fingerprint", fingerprint).apply()
    }

    fun putWorkspace(intent: Intent, workspace: Workspace) {
        intent.putExtra("organization_id", workspace.organizationId)
        intent.putExtra("organization_name", workspace.organizationName)
        intent.putExtra("role", workspace.role)
        intent.putExtra("language", workspace.preferredLanguage)
        intent.putExtra("subscription_status", workspace.subscriptionStatus)
        intent.putExtra("ends_at", workspace.endsAt)
        intent.putExtra("admin_message", workspace.adminMessage)
    }

    private fun subscriptionAlert(workspace: Workspace): BrandspireAlert? {
        val lang = workspace.preferredLanguage
        val status = workspace.subscriptionStatus.uppercase()
        if (status in setOf("EXPIRED", "SUSPENDED", "CANCELLED", "CANCELED")) {
            return BrandspireAlert(
                "subscription_blocked",
                t(lang, "Subscription action required", "Subscription action chahiye", "सब्सक्रिप्शन पर कार्रवाई जरूरी है"),
                t(lang, "Your Brandspire POS subscription is $status.", "Aapka Brandspire POS subscription $status hai.", "आपका Brandspire POS सब्सक्रिप्शन $status है।"),
                AlertSeverity.CRITICAL
            )
        }
        if (status == "PENDING_APPROVAL") {
            return BrandspireAlert(
                "subscription_pending",
                t(lang, "Account approval pending", "Account approval pending hai", "अकाउंट अनुमोदन लंबित है"),
                t(lang, "Brandspire Admin Team is reviewing this account.", "Brandspire Admin Team account review kar rahi hai.", "Brandspire Admin Team इस अकाउंट की समीक्षा कर रही है।"),
                AlertSeverity.INFO
            )
        }

        val endDate = runCatching { workspace.endsAt?.take(10)?.let(LocalDate::parse) }.getOrNull() ?: return null
        val today = LocalDate.now(ZoneId.of("Asia/Kolkata"))
        val days = ChronoUnit.DAYS.between(today, endDate)
        return when {
            days < 0 -> BrandspireAlert(
                "subscription_expired_date",
                t(lang, "Subscription expired", "Subscription expire ho gaya", "सब्सक्रिप्शन समाप्त हो गया"),
                t(lang, "Access period ended on $endDate.", "Access period $endDate ko end ho gaya.", "एक्सेस अवधि $endDate को समाप्त हो गई।"),
                AlertSeverity.CRITICAL
            )
            days <= 3 -> BrandspireAlert(
                "subscription_expiry_critical",
                t(lang, "Subscription expiring soon", "Subscription jaldi expire hoga", "सब्सक्रिप्शन जल्द समाप्त होगा"),
                t(lang, "$days day(s) remaining. Renew to avoid interruption.", "$days din bache hain. Interruption se bachne ke liye renew karo.", "$days दिन बचे हैं। रुकावट से बचने के लिए नवीनीकरण करें।"),
                AlertSeverity.CRITICAL
            )
            days <= 7 -> BrandspireAlert(
                "subscription_expiry_warning",
                t(lang, "Renewal reminder", "Renewal reminder", "नवीनीकरण रिमाइंडर"),
                t(lang, "$days day(s) remaining in your current access period.", "Current access period me $days din bache hain.", "वर्तमान एक्सेस अवधि में $days दिन शेष हैं।"),
                AlertSeverity.WARNING
            )
            else -> null
        }
    }

    private fun canNotify(context: Context): Boolean =
        Build.VERSION.SDK_INT < 33 || context.checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS) == PackageManager.PERMISSION_GRANTED

    private fun ensureChannel(manager: NotificationManager) {
        manager.createNotificationChannel(
            NotificationChannel(
                CHANNEL_ID,
                "Brandspire POS alerts",
                NotificationManager.IMPORTANCE_DEFAULT
            ).apply {
                description = "Low stock, sync, printer and subscription alerts"
            }
        )
    }

    private fun money(value: Double): String = String.format(java.util.Locale.ENGLISH, "%,.2f", value)

    private fun t(language: String, en: String, hinglish: String, hi: String): String = when (language.lowercase()) {
        "hi", "hindi" -> hi
        "hinglish" -> hinglish
        else -> en
    }
}
