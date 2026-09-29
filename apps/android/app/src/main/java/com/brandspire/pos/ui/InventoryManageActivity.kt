package com.brandspire.pos.ui

import android.app.Activity
import android.graphics.Typeface
import android.os.Bundle
import android.view.ViewGroup
import android.widget.EditText
import android.widget.LinearLayout
import android.widget.TextView
import android.widget.Toast
import com.brandspire.pos.auth.SecureSessionStore
import com.brandspire.pos.data.OfflineDatabase
import com.brandspire.pos.network.SupabaseHttpClient
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext

class InventoryManageActivity : Activity() {
    private val scope = CoroutineScope(Dispatchers.Main)
    private lateinit var root: LinearLayout
    private val organizationId by lazy { intent.getStringExtra("organization_id").orEmpty() }
    private val language by lazy { intent.getStringExtra("language") ?: "en" }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        val (scroll, content) = ospScreen(
            MobileText.get(language, "Inventory", "Inventory", "इन्वेंटरी"),
            MobileText.get(language, "Owner-only stock in/out with audit logging.", "Owner-only stock in/out, audit log ke saath.", "केवल मालिक के लिए स्टॉक इन/आउट, ऑडिट लॉग के साथ।")
        )
        root = content
        setContentView(scroll)
        refreshCatalog()
    }

    private fun refreshCatalog() {
        val session = SecureSessionStore(this).read() ?: return finish()
        scope.launch {
            val result = withContext(Dispatchers.IO) { runCatching {
                val api = SupabaseHttpClient()
                val rows = api.fetchProducts(session.accessToken, organizationId)
                OfflineDatabase(this@InventoryManageActivity).cacheProducts(organizationId, rows)
            } }
            result.onSuccess { renderProducts() }.onFailure { renderProducts(); Toast.makeText(this@InventoryManageActivity, it.message ?: "Using cached products", Toast.LENGTH_LONG).show() }
        }
    }

    private fun renderProducts() {
        while (root.childCount > 2) root.removeViewAt(2)
        val products = OfflineDatabase(this).cachedProducts(organizationId)
        if (products.isEmpty()) {
            root.addView(TextView(this).apply { text = MobileText.get(language, "No cached products. Sync products first.", "Cached products nahi mile. Pehle sync karo.", "कैश किए गए उत्पाद नहीं मिले। पहले सिंक करें।"); setTextColor(ospMuted()) })
            return
        }
        products.forEach { product ->
            val card = ospCard()
            card.addView(TextView(this).apply { text = product.name; textSize = 17f; setTypeface(typeface, Typeface.BOLD); setTextColor(ospInk()) })
            card.addView(TextView(this).apply { text = "${MobileText.get(language,"Stock","Stock","स्टॉक")}: ${product.stock}"; textSize = 13f; setTextColor(ospMuted()) })
            val qty = EditText(this).apply {
                hint = MobileText.get(language, "Quantity", "Quantity", "मात्रा")
                inputType = android.text.InputType.TYPE_CLASS_NUMBER or android.text.InputType.TYPE_NUMBER_FLAG_DECIMAL
            }
            val note = EditText(this).apply { hint = MobileText.get(language, "Reason / note", "Reason / note", "कारण / नोट") }
            card.addView(qty); card.addView(note)
            val buttons = LinearLayout(this).apply { orientation = LinearLayout.HORIZONTAL }
            buttons.addView(ospSecondaryButton(MobileText.get(language, "Stock In", "Stock In", "स्टॉक इन")) { submit(product.id, qty, note, positive = true) }, LinearLayout.LayoutParams(0, ospDp(46), 1f).apply { marginEnd = ospDp(6) })
            buttons.addView(ospPrimaryButton(MobileText.get(language, "Stock Out", "Stock Out", "स्टॉक आउट")) { submit(product.id, qty, note, positive = false) }, LinearLayout.LayoutParams(0, ospDp(46), 1f))
            card.addView(buttons, LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT).apply { topMargin = ospDp(10) })
            root.addView(card, ospCardParams())
        }
    }

    private fun submit(productId: String, qtyField: EditText, noteField: EditText, positive: Boolean) {
        val amount = qtyField.text.toString().toDoubleOrNull()
        if (amount == null || amount <= 0) return Toast.makeText(this, MobileText.get(language, "Enter a valid quantity.", "Valid quantity enter karo.", "वैध मात्रा दर्ज करें।"), Toast.LENGTH_SHORT).show()
        val session = SecureSessionStore(this).read() ?: return finish()
        scope.launch {
            val result = withContext(Dispatchers.IO) { runCatching {
                val api = SupabaseHttpClient()
                api.adjustProductStock(session.accessToken, organizationId, productId, if (positive) amount else -amount, noteField.text.toString())
                OfflineDatabase(this@InventoryManageActivity).cacheProducts(organizationId, api.fetchProducts(session.accessToken, organizationId))
            } }
            result.onSuccess {
                Toast.makeText(this@InventoryManageActivity, MobileText.get(language, "Stock updated.", "Stock update ho gaya.", "स्टॉक अपडेट हो गया।"), Toast.LENGTH_SHORT).show()
                renderProducts()
            }.onFailure { Toast.makeText(this@InventoryManageActivity, it.message ?: "Stock update failed", Toast.LENGTH_LONG).show() }
        }
    }
}
