package com.brandspire.pos.ui

import android.app.Activity
import android.content.Intent
import android.os.Bundle
import android.view.Gravity
import android.view.ViewGroup
import android.widget.LinearLayout
import android.widget.TextView
import com.brandspire.pos.auth.SecureSessionStore
import com.brandspire.pos.data.LocalBillRecord
import com.brandspire.pos.data.OfflineDatabase
import com.brandspire.pos.network.SupabaseHttpClient
import com.brandspire.pos.sync.SyncScheduler
import com.brandspire.pos.sync.isOnline
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import org.json.JSONArray
import java.text.NumberFormat
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale

class BillsActivity : Activity() {
    private val scope = CoroutineScope(Dispatchers.Main)
    private lateinit var organizationId: String
    private lateinit var language: String
    private lateinit var content: LinearLayout
    private lateinit var serverContent: LinearLayout
    private lateinit var status: TextView
    private lateinit var db: OfflineDatabase

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        bsApplyWindowChrome()
        organizationId = intent.getStringExtra("organization_id").orEmpty()
        language = MobileText.language(intent.getStringExtra("language"))
        if (organizationId.isBlank()) { finish(); return }
        db = OfflineDatabase(this)
        render()
        renderLocalReceipts()
        loadBills()
    }

    override fun onResume() {
        super.onResume()
        if (::content.isInitialized) renderLocalReceipts()
    }

    private fun render() {
        val (scroll, root) = ospScreen(
            tx("Bills", "Bills", "बिल"),
            tx("Recent invoices, local receipts and safe sync status.", "Recent invoices, local receipts aur safe sync status.", "हाल के इनवॉइस, लोकल रसीदें और सुरक्षित सिंक स्थिति।")
        )
        setContentView(scroll)

        val pending = db.pendingCount()
        val pendingCard = bsTintCard(
            if (pending > 0) LaunchColors.softAmber else LaunchColors.softGreen,
            if (pending > 0) ColorUtils.amberBorder else ColorUtils.greenBorder,
            16
        ).apply {
            orientation = LinearLayout.HORIZONTAL
            gravity = Gravity.CENTER_VERTICAL
            val copy = LinearLayout(this@BillsActivity).apply { orientation = LinearLayout.VERTICAL }
            copy.addView(bsText(
                if (pending > 0) tx("$pending bill(s) waiting to sync", "$pending bill(s) sync ke liye pending", "$pending बिल सिंक के लिए लंबित")
                else tx("Everything is synced", "Sab synced hai", "सब कुछ सिंक है"),
                13.5f,
                if (pending > 0) LaunchColors.amber else LaunchColors.green,
                true
            ))
            copy.addView(bsText(
                if (pending > 0) tx("Bills remain safe on this device until sync completes.", "Sync hone tak bills device par safe rahenge.", "सिंक पूरा होने तक बिल इस डिवाइस पर सुरक्षित रहेंगे।")
                else tx("No local billing changes are waiting.", "Koi local billing change pending nahi hai.", "कोई लोकल बिलिंग बदलाव लंबित नहीं है।"),
                10.8f,
                if (pending > 0) LaunchColors.amber else LaunchColors.green
            ).apply { setPadding(0, bsDp(3), 0, 0) })
            addView(copy, LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1f))
            addView(bsGhostButton(tx("Sync", "Sync Karo", "सिंक करें")) {
                SyncScheduler.syncNow(this@BillsActivity)
                renderLocalReceipts()
                loadBills()
            }, LinearLayout.LayoutParams(bsDp(92), bsDp(44)))
        }
        root.addView(pendingCard, LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT).apply { topMargin = bsDp(16) })

        root.addView(bsSection(tx("This device", "Is device ke receipts", "इस डिवाइस की रसीदें")))
        content = LinearLayout(this).apply { orientation = LinearLayout.VERTICAL }
        root.addView(content)

        status = bsText("", 11.5f, LaunchColors.muted).apply { setPadding(bsDp(2), bsDp(14), bsDp(2), bsDp(2)) }
        root.addView(status)
        root.addView(bsSection(tx("Server history", "Server bill history", "सर्वर बिल इतिहास")))
        serverContent = LinearLayout(this).apply { orientation = LinearLayout.VERTICAL }
        root.addView(serverContent)
    }

    private fun renderLocalReceipts() {
        if (!::content.isInitialized) return
        content.removeAllViews()
        val rows = db.recentLocalBills(organizationId, 12)
        if (rows.isEmpty()) {
            content.addView(bsEmptyState(
                tx("No receipts on this device", "Is device par koi receipt nahi hai", "इस डिवाइस पर कोई रसीद नहीं है"),
                tx("Create a bill to see it here.", "Bill banao, yahan dikh jayega.", "बिल बनाएं, यहां दिखाई देगा।")
            ))
            return
        }
        rows.forEach { bill ->
            content.addView(localCard(bill), LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT).apply { bottomMargin = bsDp(8) })
        }
    }

    private fun localCard(bill: LocalBillRecord): LinearLayout = bsCard(15).apply {
        val top = LinearLayout(this@BillsActivity).apply { orientation = LinearLayout.HORIZONTAL; gravity = Gravity.CENTER_VERTICAL }
        val copy = LinearLayout(this@BillsActivity).apply { orientation = LinearLayout.VERTICAL }
        copy.addView(bsText(bill.serverInvoiceNumber ?: "Offline ${bill.clientInvoiceId.take(8).uppercase()}", 14.5f, LaunchColors.ink, true))
        copy.addView(bsText(
            "${bill.paymentMethod} · ${SimpleDateFormat("dd MMM, hh:mm a", Locale.ENGLISH).format(Date(bill.createdAt))}",
            10.5f,
            LaunchColors.muted
        ).apply { setPadding(0, bsDp(3), 0, 0) })
        top.addView(copy, LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1f))
        top.addView(bsText(money(bill.total), 16f, LaunchColors.ink, true))
        addView(top)
        val actionRow = LinearLayout(this@BillsActivity).apply { orientation = LinearLayout.HORIZONTAL; gravity = Gravity.CENTER_VERTICAL; setPadding(0, bsDp(10), 0, 0) }
        val synced = bill.syncStatus == "SYNCED"
        actionRow.addView(bsText(
            bill.syncStatus,
            9.5f,
            if (synced) LaunchColors.green else LaunchColors.amber,
            true
        ).apply {
            setPadding(bsDp(9), bsDp(6), bsDp(9), bsDp(6))
            background = bsRounded(if (synced) LaunchColors.softGreen else LaunchColors.softAmber, 99)
        }, LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1f))
        actionRow.addView(bsSecondaryButton(tx("Open / Reprint", "Open / Reprint", "खोलें / रीप्रिंट")) {
            startActivity(Intent(this@BillsActivity, BillSuccessActivity::class.java).apply {
                putExtra("client_invoice_id", bill.clientInvoiceId)
                putExtra("organization_id", organizationId)
                putExtra("language", language)
            })
        }, LinearLayout.LayoutParams(bsDp(126), bsDp(42)))
        addView(actionRow)
    }

    private fun loadBills() {
        if (!::serverContent.isInitialized) return
        serverContent.removeAllViews()
        if (!isOnline()) {
            status.text = tx("Offline: server history needs internet.", "Offline: server history ke liye internet chahiye.", "ऑफलाइन: सर्वर इतिहास के लिए इंटरनेट चाहिए।")
            return
        }
        val session = SecureSessionStore(this).read() ?: return
        status.text = tx("Loading server bills…", "Server bills load ho rahe hain…", "सर्वर बिल लोड हो रहे हैं…")
        scope.launch {
            val result = withContext(Dispatchers.IO) { runCatching { SupabaseHttpClient().fetchInvoices(session.accessToken, organizationId) } }
            result.onSuccess { rows -> renderServerBills(rows) }
                .onFailure { status.text = it.message ?: tx("Could not load bills", "Bills load nahi hue", "बिल लोड नहीं हो सके") }
        }
    }

    private fun renderServerBills(rows: JSONArray) {
        status.text = tx("${rows.length()} recent server bill(s)", "${rows.length()} recent server bill(s)", "${rows.length()} हाल के सर्वर बिल")
        if (rows.length() == 0) {
            serverContent.addView(bsEmptyState(
                tx("No server bills yet", "Server par abhi koi bill nahi", "सर्वर पर अभी कोई बिल नहीं है"),
                tx("Synced invoices will appear here.", "Synced invoices yahan dikhengi.", "सिंक किए गए इनवॉइस यहां दिखाई देंगे।")
            ))
            return
        }
        repeat(rows.length()) { i ->
            val r = rows.getJSONObject(i)
            val card = bsCard(15).apply {
                val top = LinearLayout(this@BillsActivity).apply { orientation = LinearLayout.HORIZONTAL; gravity = Gravity.CENTER_VERTICAL }
                val copy = LinearLayout(this@BillsActivity).apply { orientation = LinearLayout.VERTICAL }
                copy.addView(bsText(r.optString("invoice_number", "Bill"), 14.5f, LaunchColors.ink, true))
                copy.addView(bsText(
                    "${r.optString("payment_status")} · ${r.optString("invoice_date").take(16).replace('T', ' ')}",
                    10.5f,
                    LaunchColors.muted
                ).apply { setPadding(0, bsDp(3), 0, 0) })
                top.addView(copy, LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1f))
                top.addView(bsText(money(r.optDouble("grand_total", 0.0)), 16f, LaunchColors.ink, true))
                addView(top)
            }
            serverContent.addView(card, LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT).apply { bottomMargin = bsDp(8) })
        }
    }

    private object ColorUtils {
        val amberBorder = android.graphics.Color.rgb(252, 211, 157)
        val greenBorder = android.graphics.Color.rgb(167, 243, 208)
    }

    private fun money(v: Double) = NumberFormat.getCurrencyInstance(Locale("en", "IN")).format(v)
    private fun tx(en: String, hg: String, hi: String) = MobileText.get(language, en, hg, hi)
}
