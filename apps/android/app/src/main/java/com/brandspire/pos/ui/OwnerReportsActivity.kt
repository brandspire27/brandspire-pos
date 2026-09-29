package com.brandspire.pos.ui

import android.app.Activity
import android.graphics.Typeface
import android.os.Bundle
import android.view.ViewGroup
import android.widget.LinearLayout
import android.widget.TextView
import android.widget.Toast
import com.brandspire.pos.auth.SecureSessionStore
import com.brandspire.pos.network.SupabaseHttpClient
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import org.json.JSONArray
import org.json.JSONObject
import java.time.Instant
import java.time.temporal.ChronoUnit

class OwnerReportsActivity : Activity() {
    private val scope = CoroutineScope(Dispatchers.Main)
    private lateinit var root: LinearLayout
    private val organizationId by lazy { intent.getStringExtra("organization_id").orEmpty() }
    private val language by lazy { intent.getStringExtra("language") ?: "en" }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        val (scroll, content) = ospScreen(
            MobileText.get(language, "Reports", "Reports", "रिपोर्ट"),
            MobileText.get(language, "Sales, payments, GST and low-stock summary.", "Sales, payments, GST aur low-stock summary.", "बिक्री, भुगतान, जीएसटी और कम स्टॉक का सारांश।")
        )
        root = content
        setContentView(scroll)
        val range = LinearLayout(this).apply { orientation = LinearLayout.HORIZONTAL }
        listOf(7, 30, 90).forEach { days ->
            range.addView(ospSecondaryButton("$days ${MobileText.get(language,"Days","Days","दिन")}") { load(days) }, LinearLayout.LayoutParams(0, ospDp(44), 1f).apply { marginEnd = ospDp(6) })
        }
        root.addView(range, LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT).apply { bottomMargin = ospDp(14) })
        load(30)
    }

    private fun load(days: Int) {
        val session = SecureSessionStore(this).read() ?: return finish()
        val to = Instant.now()
        val from = to.minus(days.toLong(), ChronoUnit.DAYS)
        scope.launch {
            val result = withContext(Dispatchers.IO) { runCatching {
                val api = SupabaseHttpClient()
                api.ownerReportSummary(session.accessToken, organizationId, from.toString(), to.toString()) to
                    api.ownerGstReportSummary(session.accessToken, organizationId, from.toString(), to.toString())
            } }
            result.onSuccess { renderReport(days, it.first, it.second) }
                .onFailure { Toast.makeText(this@OwnerReportsActivity, it.message ?: "Report failed", Toast.LENGTH_LONG).show() }
        }
    }

    private fun renderReport(days: Int, report: JSONObject, gst: JSONObject) {
        while (root.childCount > 3) root.removeViewAt(3)
        root.addView(TextView(this).apply {
            text = MobileText.get(language, "Last $days days", "Last $days days", "पिछले $days दिन")
            textSize = 13f; setTypeface(typeface, Typeface.BOLD); setTextColor(ospBlue()); setPadding(0, 0, 0, ospDp(8))
        })
        val summary = report.optJSONObject("summary") ?: JSONObject()
        val summaryCard = ospCard()
        listOf(
            MobileText.get(language,"Sales","Sales","बिक्री") to summary.optDouble("sales",0.0),
            MobileText.get(language,"Collected","Collected","प्राप्त") to summary.optDouble("collected",0.0),
            MobileText.get(language,"Due","Due","बकाया") to summary.optDouble("due",0.0),
            MobileText.get(language,"Average Bill","Average Bill","औसत बिल") to summary.optDouble("averageBill",0.0)
        ).forEach { (label, value) -> summaryCard.addView(metricRow(label, "₹%.2f".format(value))) }
        summaryCard.addView(metricRow(MobileText.get(language,"Bills","Bills","बिल"), summary.optLong("billCount",0).toString()))
        root.addView(summaryCard, ospCardParams())

        val gstSummary = gst.optJSONObject("summary") ?: JSONObject()
        val gstCard = ospCard()
        gstCard.addView(TextView(this).apply { text = "GST"; textSize=16f; setTypeface(typeface, Typeface.BOLD); setTextColor(ospInk()) })
        gstCard.addView(metricRow("CGST", "₹%.2f".format(gstSummary.optDouble("cgst",0.0))))
        gstCard.addView(metricRow("SGST", "₹%.2f".format(gstSummary.optDouble("sgst",0.0))))
        gstCard.addView(metricRow("IGST", "₹%.2f".format(gstSummary.optDouble("igst",0.0))))
        gstCard.addView(metricRow(MobileText.get(language,"Taxable Sales","Taxable Sales","कर योग्य बिक्री"), "₹%.2f".format(gstSummary.optDouble("taxableSales",0.0))))
        root.addView(gstCard, ospCardParams())

        addArraySection(MobileText.get(language,"Payment Breakdown","Payment Breakdown","भुगतान विवरण"), report.optJSONArray("paymentBreakdown") ?: JSONArray()) { row ->
            "${row.optString("method","OTHER")}  ·  ₹%.2f".format(row.optDouble("amount",0.0))
        }
        addArraySection(MobileText.get(language,"Top Products","Top Products","शीर्ष उत्पाद"), report.optJSONArray("topProducts") ?: JSONArray()) { row ->
            "${row.optString("name","Product")}  ·  ₹%.2f".format(row.optDouble("sales",0.0))
        }
        addArraySection(MobileText.get(language,"Low Stock","Low Stock","कम स्टॉक"), report.optJSONArray("lowStock") ?: JSONArray()) { row ->
            "${row.optString("name","Product")}  ·  ${row.optDouble("stock",0.0)}"
        }
    }

    private fun metricRow(label: String, value: String): LinearLayout = LinearLayout(this).apply {
        orientation = LinearLayout.HORIZONTAL
        addView(TextView(this@OwnerReportsActivity).apply { text=label; textSize=13f; setTextColor(ospMuted()) }, LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1f))
        addView(TextView(this@OwnerReportsActivity).apply { text=value; textSize=14f; setTypeface(typeface, Typeface.BOLD); setTextColor(ospInk()) })
        setPadding(0, ospDp(4), 0, ospDp(4))
    }

    private fun addArraySection(title: String, rows: JSONArray, formatter: (JSONObject)->String) {
        val card = ospCard()
        card.addView(TextView(this).apply { text=title; textSize=16f; setTypeface(typeface, Typeface.BOLD); setTextColor(ospInk()); setPadding(0,0,0,ospDp(6)) })
        if (rows.length()==0) card.addView(TextView(this).apply { text=MobileText.get(language,"No data","No data","कोई डेटा नहीं"); setTextColor(ospMuted()) })
        repeat(rows.length()) { i -> card.addView(TextView(this).apply { text=formatter(rows.getJSONObject(i)); textSize=13f; setTextColor(ospMuted()); setPadding(0,ospDp(4),0,ospDp(4)) }) }
        root.addView(card, ospCardParams())
    }
}
