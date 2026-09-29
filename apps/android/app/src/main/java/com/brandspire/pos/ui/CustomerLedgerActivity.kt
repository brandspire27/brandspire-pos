package com.brandspire.pos.ui

import android.app.Activity
import android.graphics.Typeface
import android.os.Bundle
import android.view.ViewGroup
import android.widget.LinearLayout
import android.widget.TextView
import android.widget.Toast
import com.brandspire.pos.auth.SecureSessionStore
import com.brandspire.pos.data.CachedCustomer
import com.brandspire.pos.data.OfflineDatabase
import com.brandspire.pos.network.SupabaseHttpClient
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import org.json.JSONArray

class CustomerLedgerActivity : Activity() {
    private val scope = CoroutineScope(Dispatchers.Main)
    private val organizationId by lazy { intent.getStringExtra("organization_id").orEmpty() }
    private val language by lazy { intent.getStringExtra("language") ?: "en" }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        showCustomers()
    }

    private fun showCustomers() {
        val (scroll, root) = ospScreen(
            MobileText.get(language, "Customer Ledger", "Customer Ledger", "ग्राहक खाता"),
            MobileText.get(language, "Invoices, collections, credit notes and running balance.", "Invoices, payments, credit notes aur running balance.", "बिल, भुगतान, क्रेडिट नोट और चालू शेष।")
        )
        setContentView(scroll)
        val customers = OfflineDatabase(this).cachedCustomers(organizationId)
        if (customers.isEmpty()) {
            root.addView(TextView(this).apply { text=MobileText.get(language,"No cached customers. Sync first.","Cached customers nahi mile. Pehle sync karo.","कैश किए गए ग्राहक नहीं मिले। पहले सिंक करें।"); setTextColor(ospMuted()) })
            return
        }
        customers.forEach { customer ->
            val card=ospCard()
            card.addView(TextView(this).apply { text=customer.name; textSize=16f; setTypeface(typeface, Typeface.BOLD); setTextColor(ospInk()) })
            card.addView(TextView(this).apply { text="${MobileText.get(language,"Outstanding","Baaki","बकाया")}: ₹%.2f".format(customer.outstandingBalance); textSize=13f; setTextColor(ospMuted()); setPadding(0,ospDp(4),0,ospDp(8)) })
            card.addView(ospSecondaryButton(MobileText.get(language,"View Ledger","Ledger Dekho","खाता देखें")) { loadLedger(customer) })
            root.addView(card, ospCardParams())
        }
    }

    private fun loadLedger(customer: CachedCustomer) {
        val session=SecureSessionStore(this).read() ?: return finish()
        scope.launch {
            val result=withContext(Dispatchers.IO){ runCatching { SupabaseHttpClient().customerLedger(session.accessToken, organizationId, customer.id) } }
            result.onSuccess { showLedger(customer, it) }.onFailure { Toast.makeText(this@CustomerLedgerActivity,it.message ?: "Ledger failed",Toast.LENGTH_LONG).show() }
        }
    }

    private fun showLedger(customer: CachedCustomer, rows: JSONArray) {
        val (scroll, root)=ospScreen(customer.name, MobileText.get(language,"Customer Ledger","Customer Ledger","ग्राहक खाता"))
        setContentView(scroll)
        root.addView(ospSecondaryButton(MobileText.get(language,"Back to Customers","Customers Par Wapas","ग्राहकों पर वापस")) { showCustomers() }, LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ospDp(44)).apply { bottomMargin=ospDp(12) })
        if(rows.length()==0){ root.addView(TextView(this).apply{text=MobileText.get(language,"No ledger entries.","Ledger entries nahi hain.","कोई खाता प्रविष्टि नहीं है।");setTextColor(ospMuted())});return }
        repeat(rows.length()){i->
            val row=rows.getJSONObject(i)
            val card=ospCard()
            card.addView(TextView(this).apply{text="${row.optString("event_type")} · ${row.optString("reference")}";textSize=14f;setTypeface(typeface,Typeface.BOLD);setTextColor(ospInk())})
            card.addView(TextView(this).apply{text=row.optString("description");textSize=12f;setTextColor(ospMuted());setPadding(0,ospDp(3),0,ospDp(5))})
            card.addView(TextView(this).apply{text="Debit ₹%.2f   Credit ₹%.2f   Balance ₹%.2f".format(row.optDouble("debit",0.0),row.optDouble("credit",0.0),row.optDouble("running_balance",0.0));textSize=12f;setTextColor(ospMuted())})
            root.addView(card,ospCardParams())
        }
    }
}
