package com.brandspire.pos.ui

import android.app.Activity
import android.content.Intent
import android.graphics.Color
import android.os.Bundle
import android.view.Gravity
import android.view.ViewGroup
import android.widget.LinearLayout
import android.widget.ScrollView
import android.widget.TextView
import android.widget.Toast
import com.brandspire.pos.data.LocalBillRecord
import com.brandspire.pos.data.OfflineDatabase
import com.brandspire.pos.printer.PrinterPreferences
import com.brandspire.pos.printer.ReceiptPrinter
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import java.text.NumberFormat
import java.util.Locale

class BillSuccessActivity : Activity() {
    private val scope = CoroutineScope(Dispatchers.Main)
    private lateinit var bill: LocalBillRecord
    private lateinit var language: String
    private lateinit var status: TextView
    private var autoPrintAttempted = false

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        bsApplyWindowChrome()
        language = MobileText.language(intent.getStringExtra("language"))
        val clientId = intent.getStringExtra("client_invoice_id").orEmpty()
        val found = OfflineDatabase(this).localBill(clientId)
        if (found == null) {
            Toast.makeText(this, tx("Bill receipt not found", "Bill receipt nahi mila", "बिल रसीद नहीं मिली"), Toast.LENGTH_LONG).show()
            finish()
            return
        }
        bill = found
        render()
    }

    override fun onResume() {
        super.onResume()
        if (::bill.isInitialized) {
            OfflineDatabase(this).localBill(bill.clientInvoiceId)?.let { bill = it }
            if (!autoPrintAttempted) {
                autoPrintAttempted = true
                if (PrinterPreferences(this).read()?.autoPrint == true) printDefault(false)
            }
        }
    }

    private fun render() {
        val scroll = ScrollView(this).apply { setBackgroundColor(LaunchColors.bg); clipToPadding = false }
        val root = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            setPadding(bsDp(20), bsDp(24), bsDp(20), bsDp(34))
        }
        scroll.addView(root)
        setContentView(scroll)

        val success = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            gravity = Gravity.CENTER_HORIZONTAL
            setPadding(bsDp(22), bsDp(26), bsDp(22), bsDp(24))
            background = bsGradient(Color.rgb(5, 116, 91), Color.rgb(4, 142, 104), 26)
        }
        success.addView(bsText("✓", 28f, Color.WHITE, true).apply {
            gravity = Gravity.CENTER
            background = bsRounded(Color.argb(45, 255, 255, 255), 99)
        }, LinearLayout.LayoutParams(bsDp(58), bsDp(58)))
        success.addView(bsText(tx("Bill saved", "Bill save ho gaya", "बिल सेव हो गया"), 25f, Color.WHITE, true).apply {
            gravity = Gravity.CENTER
            setPadding(0, bsDp(15), 0, bsDp(5))
        })
        success.addView(bsText(
            tx("Safe first. Print and share next.", "Pehle bill safe hua. Ab print ya share karo.", "पहले बिल सुरक्षित हुआ। अब प्रिंट या शेयर करें।"),
            12f,
            Color.rgb(214, 241, 232)
        ).apply { gravity = Gravity.CENTER })
        root.addView(success)

        val number = bill.serverInvoiceNumber ?: "Offline Ref ${bill.clientInvoiceId.take(8).uppercase()}"
        val amount = bsCard(18).apply {
            val top = LinearLayout(this@BillSuccessActivity).apply { orientation = LinearLayout.HORIZONTAL; gravity = Gravity.CENTER_VERTICAL }
            val copy = LinearLayout(this@BillSuccessActivity).apply { orientation = LinearLayout.VERTICAL }
            copy.addView(bsText(number, 13f, LaunchColors.ink, true))
            copy.addView(bsText("${bill.paymentMethod} · ${syncLabel()}", 10.5f, if (bill.syncStatus == "SYNCED") LaunchColors.green else LaunchColors.amber, true).apply { setPadding(0, bsDp(4), 0, 0) })
            top.addView(copy, LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1f))
            top.addView(bsText(money(bill.total), 24f, LaunchColors.ink, true))
            addView(top)
        }
        root.addView(amount, LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT).apply { topMargin = bsDp(14) })

        status = bsText("", 11.5f, LaunchColors.muted).apply {
            gravity = Gravity.CENTER
            setPadding(bsDp(6), bsDp(12), bsDp(6), bsDp(3))
        }
        root.addView(status)

        root.addView(bsSection(tx("Next action", "Next action", "अगला कदम")))
        val primary = bsInfoRow(
            "P",
            tx("Print receipt", "Receipt Print Karo", "रसीद प्रिंट करें"),
            tx("Use your saved 58mm or 80mm printer.", "Saved 58mm ya 80mm printer use hoga.", "सेव किए गए 58mm या 80mm प्रिंटर का उपयोग होगा।")
        ) { printDefault(true) }
        primary.background = bsRounded(LaunchColors.softBlue, 20, Color.rgb(218, 226, 252))
        root.addView(primary, LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT).apply { bottomMargin = bsDp(8) })

        root.addView(bsInfoRow(
            "▤",
            tx("Receipt Preview", "Receipt Preview Dekho", "रसीद प्रीव्यू देखें"),
            tx("Check the thermal receipt before reprinting.", "Reprint se pehle thermal receipt check karo.", "दोबारा प्रिंट से पहले थर्मल रसीद देखें।")
        ) {
            startActivity(Intent(this, ReceiptPreviewActivity::class.java).apply {
                putExtra("client_invoice_id", bill.clientInvoiceId)
                putExtra("language", language)
            })
        }, LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT).apply { bottomMargin = bsDp(8) })

        root.addView(bsInfoRow(
            "A4",
            tx("Share A4 PDF", "A4 PDF Share Karo", "A4 PDF साझा करें"),
            tx("Share the invoice through Android apps.", "Android apps se invoice share karo.", "Android ऐप्स से इनवॉइस साझा करें।")
        ) { sharePdf() }, LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT).apply { bottomMargin = bsDp(8) })

        root.addView(bsInfoRow(
            "⚙",
            tx("Printer Setup", "Printer Setup", "प्रिंटर सेटअप"),
            tx("Change default printer, paper size or auto-print.", "Default printer, paper size ya auto-print change karo.", "डिफ़ॉल्ट प्रिंटर, पेपर साइज़ या ऑटो-प्रिंट बदलें।")
        ) {
            startActivity(Intent(this, PrinterSetupActivity::class.java).apply { putExtra("language", language) })
        }, LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT).apply { bottomMargin = bsDp(8) })

        root.addView(bsPrimaryButton(tx("Done", "Done", "पूर्ण")) { finish() }, LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, bsDp(52)).apply { topMargin = bsDp(8) })

        if (bill.serverInvoiceNumber == null) {
            root.addView(bsTintCard(LaunchColors.softAmber, Color.rgb(252, 211, 157), 15).apply {
                addView(bsText(tx("Offline receipt", "Offline receipt", "ऑफलाइन रसीद"), 11f, LaunchColors.amber, true))
                addView(bsText(tx(
                    "The final invoice number will be assigned after safe server sync. This local bill remains saved and duplicate-safe.",
                    "Final invoice number safe server sync ke baad milega. Local bill safe hai aur duplicate nahi hoga.",
                    "अंतिम इनवॉइस नंबर सुरक्षित सर्वर सिंक के बाद मिलेगा। लोकल बिल सुरक्षित है और डुप्लिकेट नहीं होगा।"
                ), 11.5f, LaunchColors.amber).apply { setPadding(0, bsDp(5), 0, 0) })
            }, LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT).apply { topMargin = bsDp(14) })
        }
    }

    private fun printDefault(showSetupHint: Boolean) {
        val saved = PrinterPreferences(this).read()
        if (saved == null) {
            if (showSetupHint) Toast.makeText(this, tx("Select a default printer first", "Pehle default printer select karo", "पहले डिफ़ॉल्ट प्रिंटर चुनें"), Toast.LENGTH_LONG).show()
            return
        }
        status.text = tx("Connecting to ${saved.name}…", "${saved.name} se connect ho raha hai…", "${saved.name} से कनेक्ट हो रहा है…")
        scope.launch {
            val result = withContext(Dispatchers.IO) { ReceiptPrinter.print(this@BillSuccessActivity, bill, saved) }
            val db = OfflineDatabase(this@BillSuccessActivity)
            if (result.success) {
                db.clearPrintJob(bill.clientInvoiceId)
                status.text = tx("Receipt printed", "Receipt print ho gayi", "रसीद प्रिंट हो गई")
            } else {
                db.enqueuePrintJob(bill.clientInvoiceId, result.message)
                status.text = tx(
                    "Print failed · saved in retry queue: ${result.message}",
                    "Print fail hua · retry queue mein save hai: ${result.message}",
                    "प्रिंट विफल · रीट्राई कतार में सेव है: ${result.message}"
                )
            }
        }
    }

    private fun sharePdf() {
        runCatching {
            val uri = A4InvoicePdf.create(this, bill)
            startActivity(Intent.createChooser(Intent(Intent.ACTION_SEND).apply {
                type = "application/pdf"
                putExtra(Intent.EXTRA_STREAM, uri)
                putExtra(Intent.EXTRA_SUBJECT, "Brandspire POS ${bill.serverInvoiceNumber ?: "Receipt"}")
                addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
            }, tx("Share invoice", "Invoice share karo", "इनवॉइस साझा करें")))
        }.onFailure { Toast.makeText(this, it.message ?: "Could not create PDF", Toast.LENGTH_LONG).show() }
    }

    private fun syncLabel() = when (bill.syncStatus) {
        "SYNCED" -> tx("SYNCED", "SYNCED", "सिंक हो गया")
        "SYNC_FAILED" -> tx("SYNC FAILED", "SYNC FAILED", "सिंक विफल")
        else -> tx("PENDING SYNC", "PENDING SYNC", "सिंक लंबित")
    }

    private fun money(v: Double) = NumberFormat.getCurrencyInstance(Locale("en", "IN")).format(v)
    private fun tx(en: String, hg: String, hi: String) = MobileText.get(language, en, hg, hi)
}
