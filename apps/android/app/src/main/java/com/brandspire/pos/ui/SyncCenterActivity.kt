package com.brandspire.pos.ui

import android.app.Activity
import android.os.Bundle
import android.view.Gravity
import android.view.ViewGroup
import android.widget.LinearLayout
import android.widget.ScrollView
import android.widget.TextView
import android.widget.Toast
import com.brandspire.pos.data.OfflineDatabase
import com.brandspire.pos.data.PendingSyncRecord
import com.brandspire.pos.printer.PrinterPreferences
import com.brandspire.pos.printer.ReceiptPrinter
import com.brandspire.pos.sync.SyncScheduler
import com.brandspire.pos.sync.isOnline
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext

class SyncCenterActivity : Activity() {
    private val scope = CoroutineScope(Dispatchers.Main)
    private lateinit var db: OfflineDatabase
    private lateinit var organizationId: String
    private lateinit var language: String
    private lateinit var content: LinearLayout
    private lateinit var stateText: TextView

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        bsApplyWindowChrome()
        organizationId = intent.getStringExtra("organization_id").orEmpty()
        language = MobileText.language(intent.getStringExtra("language"))
        if (organizationId.isBlank()) { finish(); return }
        db = OfflineDatabase(this)
        renderShell()
    }

    override fun onResume() {
        super.onResume()
        if (::content.isInitialized) refresh()
    }

    private fun renderShell() {
        val scroll = ScrollView(this).apply { setBackgroundColor(LaunchColors.bg); clipToPadding = false }
        val root = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            setPadding(bsDp(20), bsDp(20), bsDp(20), bsDp(34))
        }
        scroll.addView(root)
        setContentView(scroll)

        root.addView(bsTopBar(
            tx("Sync Center", "Sync Center", "सिंक सेंटर"),
            tx("See what is saved locally, pending, failed or waiting to print.", "Local saved, pending, failed aur print queue sab yahan dikhega.", "लोकल सेव, लंबित, विफल और प्रिंट कतार सब यहां दिखेगा।")
        ) { finish() })

        stateText = bsText("", 11.5f, LaunchColors.muted).apply { setPadding(bsDp(2), bsDp(14), bsDp(2), bsDp(2)) }
        root.addView(stateText)

        val actions = LinearLayout(this).apply { orientation = LinearLayout.HORIZONTAL; weightSum = 2f }
        actions.addView(bsPrimaryButton(tx("Retry Sync", "Sync Retry Karo", "सिंक दोबारा करें")) {
            if (!isOnline()) {
                Toast.makeText(this@SyncCenterActivity, tx("Internet is required to sync", "Sync ke liye internet chahiye", "सिंक के लिए इंटरनेट आवश्यक है"), Toast.LENGTH_LONG).show()
            } else {
                SyncScheduler.syncNow(this@SyncCenterActivity)
                stateText.text = tx("Sync retry scheduled…", "Sync retry schedule ho gaya…", "सिंक रीट्राई निर्धारित हुआ…")
            }
        }, LinearLayout.LayoutParams(0, bsDp(50), 1f).apply { marginEnd = bsDp(6) })
        actions.addView(bsSecondaryButton(tx("Retry Prints", "Print Retry Karo", "प्रिंट दोबारा करें")) { retryPrints() }, LinearLayout.LayoutParams(0, bsDp(50), 1f).apply { marginStart = bsDp(6) })
        root.addView(actions, LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, bsDp(50)).apply { topMargin = bsDp(12) })

        root.addView(bsSecondaryButton(tx("Refresh Status", "Status Refresh Karo", "स्थिति रीफ्रेश करें")) { refresh() }, LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, bsDp(46)).apply { topMargin = bsDp(8) })

        content = LinearLayout(this).apply { orientation = LinearLayout.VERTICAL; setPadding(0, bsDp(10), 0, 0) }
        root.addView(content)
        refresh()
    }

    private fun refresh() {
        content.removeAllViews()
        val pendingBills = db.pendingInvoiceCount()
        val pendingCustomers = db.pendingCustomerCount()
        val pendingProducts = db.pendingProductCount()
        val printJobs = db.printQueueCount()
        val failed = db.failedSyncCount()
        stateText.text = tx(
            "${if (isOnline()) "Online" else "Offline"} · ${db.pendingCount()} sync pending · $printJobs print pending",
            "${if (isOnline()) "Online" else "Offline"} · ${db.pendingCount()} sync pending · $printJobs print pending",
            "${if (isOnline()) "ऑनलाइन" else "ऑफलाइन"} · ${db.pendingCount()} सिंक लंबित · $printJobs प्रिंट लंबित"
        )

        content.addView(bsSection(tx("Queue Summary", "Queue Summary", "कतार सारांश")))
        val row = LinearLayout(this).apply { orientation = LinearLayout.HORIZONTAL; weightSum = 3f }
        row.addView(stat(tx("Bills", "Bills", "बिल"), pendingBills.toString()), LinearLayout.LayoutParams(0, bsDp(82), 1f).apply { marginEnd = bsDp(6) })
        row.addView(stat(tx("Products", "Products", "उत्पाद"), pendingProducts.toString()), LinearLayout.LayoutParams(0, bsDp(82), 1f).apply { marginEnd = bsDp(6) })
        row.addView(stat(tx("Customers", "Customers", "ग्राहक"), pendingCustomers.toString()), LinearLayout.LayoutParams(0, bsDp(82), 1f))
        content.addView(row)
        if (failed > 0) content.addView(bsTintCard(LaunchColors.softRed, LaunchColors.border, 14).apply {
            addView(bsText(tx("$failed sync item(s) failed", "$failed sync item(s) fail hue", "$failed सिंक आइटम विफल"), 12f, LaunchColors.red, true))
            addView(bsText(tx("Retry after checking internet, subscription and stock conflicts.", "Internet, subscription aur stock conflict check karke retry karo.", "इंटरनेट, सब्सक्रिप्शन और स्टॉक कॉन्फ्लिक्ट जांचकर दोबारा करें।"), 10.8f, LaunchColors.muted).apply { setPadding(0, bsDp(4), 0, 0) })
        }, LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT).apply { topMargin = bsDp(10) })

        content.addView(bsSection(tx("Pending Sync", "Pending Sync", "लंबित सिंक")))
        val items = db.pendingSyncRecords(organizationId)
        if (items.isEmpty()) {
            content.addView(bsEmptyState(tx("Everything is synced", "Sab sync hai", "सब सिंक है"), tx("No pending customer, product or bill.", "Koi customer, product ya bill pending nahi hai.", "कोई ग्राहक, उत्पाद या बिल लंबित नहीं है।")))
        } else {
            items.forEach { content.addView(syncCard(it), LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT).apply { bottomMargin = bsDp(8) }) }
        }

        content.addView(bsSection(tx("Print Retry Queue", "Print Retry Queue", "प्रिंट रीट्राई कतार")))
        val jobs = db.pendingPrintJobs()
        if (jobs.isEmpty()) {
            content.addView(bsEmptyState(tx("No failed prints", "Koi failed print nahi hai", "कोई विफल प्रिंट नहीं है"), tx("Printer retry queue is clear.", "Printer retry queue clear hai.", "प्रिंटर रीट्राई कतार साफ है।")))
        } else {
            jobs.forEach { job ->
                val bill = db.localBill(job.clientInvoiceId)
                content.addView(bsInfoRow(
                    "P",
                    bill?.serverInvoiceNumber ?: "Offline ${job.clientInvoiceId.take(8).uppercase()}",
                    tx("${job.status} · attempts ${job.attemptCount}${job.lastError?.let { " · $it" } ?: ""}", "${job.status} · attempts ${job.attemptCount}${job.lastError?.let { " · $it" } ?: ""}", "${job.status} · प्रयास ${job.attemptCount}${job.lastError?.let { " · $it" } ?: ""}")
                ) { retrySinglePrint(job.id, job.clientInvoiceId) }, LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT).apply { bottomMargin = bsDp(8) })
            }
        }
    }

    private fun syncCard(item: PendingSyncRecord): LinearLayout = bsCard(14).apply {
        val top = LinearLayout(this@SyncCenterActivity).apply { orientation = LinearLayout.HORIZONTAL; gravity = Gravity.CENTER_VERTICAL }
        top.addView(bsIconBadge(when (item.kind) { "PRODUCT" -> "PR"; "CUSTOMER" -> "CU"; else -> "BI" }), LinearLayout.LayoutParams(bsDp(40), bsDp(40)).apply { marginEnd = bsDp(10) })
        val copy = LinearLayout(this@SyncCenterActivity).apply { orientation = LinearLayout.VERTICAL }
        copy.addView(bsText(item.title, 13.5f, LaunchColors.ink, true))
        copy.addView(bsText("${item.kind} · ${item.status} · attempts ${item.attemptCount}", 10.5f, if (item.status == "SYNC_FAILED") LaunchColors.red else LaunchColors.amber, true).apply { setPadding(0, bsDp(3), 0, 0) })
        item.lastError?.takeIf { it.isNotBlank() }?.let { copy.addView(bsText(it, 10f, LaunchColors.muted).apply { setPadding(0, bsDp(4), 0, 0) }) }
        top.addView(copy, LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1f))
        addView(top)
    }

    private fun stat(label: String, value: String) = bsCard(12).apply {
        gravity = Gravity.CENTER_VERTICAL
        addView(bsText(value, 20f, LaunchColors.ink, true))
        addView(bsText(label, 9.5f, LaunchColors.muted).apply { setPadding(0, bsDp(4), 0, 0) })
    }

    private fun retryPrints() {
        val jobs = db.pendingPrintJobs()
        if (jobs.isEmpty()) { Toast.makeText(this, tx("Print queue is empty", "Print queue empty hai", "प्रिंट कतार खाली है"), Toast.LENGTH_SHORT).show(); return }
        val saved = PrinterPreferences(this).read()
        if (saved == null) { Toast.makeText(this, tx("Select a default printer first", "Pehle default printer select karo", "पहले डिफ़ॉल्ट प्रिंटर चुनें"), Toast.LENGTH_LONG).show(); return }
        stateText.text = tx("Retrying prints…", "Print retry ho raha hai…", "प्रिंट दोबारा हो रहा है…")
        scope.launch {
            withContext(Dispatchers.IO) {
                jobs.forEach { job ->
                    val bill = db.localBill(job.clientInvoiceId)
                    if (bill == null) db.markPrintDone(job.id)
                    else {
                        val result = ReceiptPrinter.print(this@SyncCenterActivity, bill, saved)
                        if (result.success) db.markPrintDone(job.id) else db.markPrintFailed(job.id, result.message)
                    }
                }
            }
            refresh()
        }
    }

    private fun retrySinglePrint(jobId: Long, clientId: String) {
        val saved = PrinterPreferences(this).read()
        if (saved == null) { Toast.makeText(this, tx("Select a default printer first", "Pehle default printer select karo", "पहले डिफ़ॉल्ट प्रिंटर चुनें"), Toast.LENGTH_LONG).show(); return }
        val bill = db.localBill(clientId) ?: run { db.markPrintDone(jobId); refresh(); return }
        scope.launch {
            val result = withContext(Dispatchers.IO) { ReceiptPrinter.print(this@SyncCenterActivity, bill, saved) }
            if (result.success) db.markPrintDone(jobId) else db.markPrintFailed(jobId, result.message)
            Toast.makeText(this@SyncCenterActivity, if (result.success) tx("Receipt printed", "Receipt print ho gayi", "रसीद प्रिंट हो गई") else result.message, Toast.LENGTH_SHORT).show()
            refresh()
        }
    }

    private fun tx(en: String, hg: String, hi: String) = MobileText.get(language, en, hg, hi)
}
