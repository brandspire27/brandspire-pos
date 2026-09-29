package com.brandspire.pos.ui

import android.app.Activity
import android.graphics.Typeface
import android.os.Bundle
import android.view.ViewGroup
import android.widget.ArrayAdapter
import android.widget.EditText
import android.widget.LinearLayout
import android.widget.Spinner
import android.widget.TextView
import android.widget.Toast
import com.brandspire.pos.auth.SecureSessionStore
import com.brandspire.pos.network.SupabaseHttpClient
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import org.json.JSONArray

class DuesPaymentsActivity : Activity() {
    private val scope = CoroutineScope(Dispatchers.Main)
    private lateinit var root: LinearLayout
    private val organizationId by lazy { intent.getStringExtra("organization_id").orEmpty() }
    private val language by lazy { intent.getStringExtra("language") ?: "en" }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        renderShell()
        load()
    }

    private fun renderShell() {
        val (scroll, content) = ospScreen(
            MobileText.get(language, "Dues & Payments", "Dues & Payments", "बकाया और भुगतान"),
            MobileText.get(language, "Collect pending invoice payments safely.", "Pending invoice payments safely receive karo.", "लंबित बिलों का भुगतान सुरक्षित रूप से प्राप्त करें।")
        )
        root = content
        setContentView(scroll)
        showMessage(MobileText.get(language, "Loading pending bills…", "Pending bills load ho rahe hain…", "लंबित बिल लोड हो रहे हैं…"))
    }

    private fun load() {
        val session = SecureSessionStore(this).read() ?: return finish()
        scope.launch {
            val result = withContext(Dispatchers.IO) { runCatching { SupabaseHttpClient().fetchDueInvoices(session.accessToken, organizationId) } }
            result.onSuccess { renderRows(it) }.onFailure { showError(it.message) }
        }
    }

    private fun renderRows(rows: JSONArray) {
        while (root.childCount > 2) root.removeViewAt(2)
        if (rows.length() == 0) {
            showMessage(MobileText.get(language, "No pending payments.", "Abhi koi payment pending nahi hai.", "अभी कोई भुगतान लंबित नहीं है।"))
            return
        }
        repeat(rows.length()) { index ->
            val row = rows.getJSONObject(index)
            val due = row.optDouble("amount_due", 0.0)
            val card = ospCard()
            card.addView(TextView(this).apply {
                text = row.optString("invoice_number", "Invoice")
                textSize = 17f
                setTypeface(typeface, Typeface.BOLD)
                setTextColor(ospInk())
            })
            card.addView(TextView(this).apply {
                text = "₹%.2f %s · ₹%.2f %s".format(
                    due,
                    MobileText.get(language, "due", "baaki", "बकाया"),
                    row.optDouble("amount_paid", 0.0),
                    MobileText.get(language, "paid", "paid", "भुगतान")
                )
                textSize = 13f
                setTextColor(ospMuted())
                setPadding(0, ospDp(4), 0, ospDp(10))
            })
            val amount = EditText(this).apply {
                hint = MobileText.get(language, "Amount received", "Received amount", "प्राप्त राशि")
                inputType = android.text.InputType.TYPE_CLASS_NUMBER or android.text.InputType.TYPE_NUMBER_FLAG_DECIMAL
                setText("%.2f".format(due))
            }
            val method = Spinner(this).apply {
                adapter = ArrayAdapter(this@DuesPaymentsActivity, android.R.layout.simple_spinner_dropdown_item, listOf("CASH", "UPI", "CARD", "OTHER"))
            }
            val note = EditText(this).apply { hint = MobileText.get(language, "Note (optional)", "Note (optional)", "नोट (वैकल्पिक)") }
            card.addView(amount)
            card.addView(method)
            card.addView(note)
            card.addView(ospPrimaryButton(MobileText.get(language, "Receive Payment", "Payment Receive Karo", "भुगतान प्राप्त करें")) {
                val value = amount.text.toString().toDoubleOrNull()
                if (value == null || value <= 0 || value > due) {
                    Toast.makeText(this, MobileText.get(language, "Enter a valid amount up to the due balance.", "Valid amount enter karo jo due se zyada na ho.", "बकाया राशि तक वैध राशि दर्ज करें।"), Toast.LENGTH_LONG).show()
                } else collect(row.getString("id"), value, method.selectedItem.toString(), note.text.toString())
            }, LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ospDp(48)).apply { topMargin = ospDp(10) })
            root.addView(card, ospCardParams())
        }
    }

    private fun collect(invoiceId: String, amount: Double, method: String, note: String) {
        val session = SecureSessionStore(this).read() ?: return finish()
        scope.launch {
            val result = withContext(Dispatchers.IO) { runCatching { SupabaseHttpClient().collectInvoicePayment(session.accessToken, organizationId, invoiceId, amount, method, note) } }
            result.onSuccess {
                Toast.makeText(this@DuesPaymentsActivity, MobileText.get(language, "Payment recorded.", "Payment record ho gaya.", "भुगतान दर्ज हो गया।"), Toast.LENGTH_SHORT).show()
                load()
            }.onFailure { showError(it.message) }
        }
    }

    private fun showMessage(message: String) {
        root.addView(TextView(this).apply { text = message; textSize = 14f; setTextColor(ospMuted()); setPadding(0, ospDp(8), 0, ospDp(8)) })
    }
    private fun showError(message: String?) { Toast.makeText(this, message ?: "Request failed", Toast.LENGTH_LONG).show() }
}
