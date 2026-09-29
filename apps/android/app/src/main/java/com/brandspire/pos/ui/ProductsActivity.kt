package com.brandspire.pos.ui

import android.app.Activity
import android.os.Bundle
import android.text.Editable
import android.text.InputType
import android.text.TextWatcher
import android.view.Gravity
import android.view.ViewGroup
import android.widget.EditText
import android.widget.LinearLayout
import android.widget.TextView
import android.widget.Toast
import com.brandspire.pos.auth.SecureSessionStore
import com.brandspire.pos.data.CachedProduct
import com.brandspire.pos.data.OfflineDatabase
import com.brandspire.pos.network.BarcodeProductInfo
import com.brandspire.pos.network.SmartBarcodeLookup
import com.brandspire.pos.sync.SyncScheduler
import com.brandspire.pos.sync.isOnline
import com.google.mlkit.vision.barcode.common.Barcode
import com.google.mlkit.vision.codescanner.GmsBarcodeScannerOptions
import com.google.mlkit.vision.codescanner.GmsBarcodeScanning
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import java.text.NumberFormat
import java.util.Locale

class ProductsActivity : Activity() {
    private val scope = CoroutineScope(Dispatchers.Main)
    private lateinit var db: OfflineDatabase
    private lateinit var organizationId: String
    private lateinit var language: String
    private lateinit var list: LinearLayout
    private lateinit var search: EditText
    private lateinit var status: TextView
    private var products: List<CachedProduct> = emptyList()

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        bsApplyWindowChrome()
        organizationId = intent.getStringExtra("organization_id").orEmpty()
        language = MobileText.language(intent.getStringExtra("language"))
        if (organizationId.isBlank()) { finish(); return }
        db = OfflineDatabase(this)
        render()
        refreshLocal()
    }

    private fun render() {
        val (scroll, root) = ospScreen(
            tx("Products", "Products", "उत्पाद"),
            tx("Keep products, prices, GST and counter stock ready.", "Products, price, GST aur counter stock ready rakho.", "उत्पाद, मूल्य, GST और काउंटर स्टॉक तैयार रखें।")
        )
        setContentView(scroll)

        status = bsText("", 11.5f, LaunchColors.muted).apply { setPadding(bsDp(2), bsDp(14), bsDp(2), bsDp(2)) }
        root.addView(status)

        root.addView(bsSection(tx("New product", "Naya product", "नया उत्पाद")))
        val addCard = bsCard(18)
        val cardHead = LinearLayout(this).apply { orientation = LinearLayout.HORIZONTAL; gravity = Gravity.CENTER_VERTICAL }
        cardHead.addView(bsIconBadge("PR"), LinearLayout.LayoutParams(bsDp(42), bsDp(42)).apply { marginEnd = bsDp(12) })
        val headCopy = LinearLayout(this).apply { orientation = LinearLayout.VERTICAL }
        headCopy.addView(bsText(tx("Add product", "Product Add Karo", "उत्पाद जोड़ें"), 17f, LaunchColors.ink, true))
        headCopy.addView(bsText(tx("Selling price is required. Add barcode for faster scanning.", "Selling price required hai. Fast scan ke liye barcode add karo.", "बिक्री मूल्य आवश्यक है। तेज़ स्कैन के लिए बारकोड जोड़ें।"), 11.5f, LaunchColors.muted).apply { setPadding(0, bsDp(3), 0, 0) })
        cardHead.addView(headCopy, LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1f))
        addCard.addView(cardHead)

        val name = field(tx("Product name", "Product name", "उत्पाद का नाम"))
        val price = field(tx("Selling price", "Selling price", "बिक्री मूल्य"), number = true)
        val gst = field(tx("GST % (e.g. 18)", "GST % (jaise 18)", "GST % (जैसे 18)"), number = true)
        val stock = field(tx("Opening stock", "Opening stock", "प्रारंभिक स्टॉक"), number = true)
        val sku = field(tx("SKU (optional)", "SKU (optional)", "SKU (वैकल्पिक)"))
        val barcode = field(tx("Barcode (optional)", "Barcode (optional)", "बारकोड (वैकल्पिक)"))
        val lookupInfo = bsText(
            tx(
                "Scan a barcode to fetch available product details automatically.",
                "Barcode scan karo, available product details automatically fetch ho jayengi.",
                "बारकोड स्कैन करें, उपलब्ध उत्पाद जानकारी अपने आप प्राप्त हो जाएगी।"
            ),
            10.5f,
            LaunchColors.muted
        ).apply { setPadding(bsDp(2), bsDp(8), bsDp(2), 0) }
        listOf(name, price, gst, stock, sku).forEach(addCard::addView)
        val barcodeRow = LinearLayout(this).apply {
            orientation = LinearLayout.HORIZONTAL
            gravity = Gravity.CENTER_VERTICAL
            addView(barcode, LinearLayout.LayoutParams(0, bsDp(52), 1f).apply {
                topMargin = bsDp(10)
                marginEnd = bsDp(8)
            })
            addView(bsSecondaryButton(tx("Scan", "Scan", "स्कैन")) { scanBarcodeInto(barcode, name, lookupInfo) }, LinearLayout.LayoutParams(bsDp(92), bsDp(52)).apply {
                topMargin = bsDp(10)
            })
        }
        addCard.addView(barcodeRow)
        addCard.addView(lookupInfo)
        addCard.addView(bsSecondaryButton(tx("Fetch Product Details", "Product Details Fetch Karo", "उत्पाद जानकारी प्राप्त करें")) {
            val value = barcode.text.toString().trim()
            if (value.isBlank()) barcode.error = tx("Enter or scan a barcode first", "Pehle barcode enter ya scan karo", "पहले बारकोड दर्ज या स्कैन करें")
            else lookupBarcode(value, name, lookupInfo)
        }, LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, bsDp(46)).apply { topMargin = bsDp(8) })
        addCard.addView(bsPrimaryButton(tx("Save Product", "Product Save Karo", "उत्पाद सेव करें")) {
            val productName = name.text.toString().trim()
            val sellingPrice = price.text.toString().toDoubleOrNull()
            val tax = gst.text.toString().toDoubleOrNull() ?: 0.0
            val openingStock = stock.text.toString().toDoubleOrNull() ?: 0.0
            if (productName.isBlank()) { name.error = tx("Name is required", "Name required hai", "नाम आवश्यक है"); return@bsPrimaryButton }
            if (sellingPrice == null || sellingPrice < 0) { price.error = tx("Enter a valid price", "Valid price enter karo", "सही मूल्य दर्ज करें"); return@bsPrimaryButton }
            if (tax !in 0.0..100.0) { gst.error = tx("GST must be 0-100", "GST 0-100 hona chahiye", "GST 0-100 होना चाहिए"); return@bsPrimaryButton }
            addProduct(productName, sellingPrice, tax, openingStock, sku.text.toString().trim(), barcode.text.toString().trim(), listOf(name, price, gst, stock, sku, barcode))
        }, LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, bsDp(52)).apply { topMargin = bsDp(14) })
        root.addView(addCard)

        root.addView(bsSection(tx("Saved products", "Saved products", "सेव किए गए उत्पाद")))
        search = bsInput(tx("Search name, SKU or barcode", "Name, SKU ya barcode search karo", "नाम, SKU या बारकोड खोजें")).apply {
            addTextChangedListener(object : TextWatcher {
                override fun beforeTextChanged(s: CharSequence?, start: Int, count: Int, after: Int) = Unit
                override fun onTextChanged(s: CharSequence?, start: Int, before: Int, count: Int) = renderList(s?.toString().orEmpty())
                override fun afterTextChanged(s: Editable?) = Unit
            })
        }
        root.addView(search, LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, bsDp(52)))
        list = LinearLayout(this).apply { orientation = LinearLayout.VERTICAL; setPadding(0, bsDp(10), 0, 0) }
        root.addView(list)
    }

    private fun field(hint: String, number: Boolean = false): EditText = bsInput(hint).apply {
        if (number) inputType = InputType.TYPE_CLASS_NUMBER or InputType.TYPE_NUMBER_FLAG_DECIMAL
        layoutParams = LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, bsDp(52)).apply { topMargin = bsDp(10) }
    }

    private fun addProduct(name: String, price: Double, gst: Double, stock: Double, sku: String, barcode: String, fields: List<EditText>) {
        if (barcode.isNotBlank() && products.any { it.barcode.orEmpty().equals(barcode, ignoreCase = true) }) {
            fields.lastOrNull()?.error = tx("Barcode already exists", "Barcode pehle se exist karta hai", "बारकोड पहले से मौजूद है")
            return
        }
        if (sku.isNotBlank() && products.any { it.sku.orEmpty().equals(sku, ignoreCase = true) }) {
            fields.getOrNull(4)?.error = tx("SKU already exists", "SKU pehle se exist karta hai", "SKU पहले से मौजूद है")
            return
        }
        val session = SecureSessionStore(this).read()
        runCatching {
            db.enqueueProduct(
                organizationId = organizationId,
                createdBy = session?.userId,
                name = name,
                sellingPrice = price,
                taxRate = gst,
                openingStock = stock,
                sku = sku.ifBlank { null },
                barcode = barcode.ifBlank { null }
            )
        }.onSuccess {
            fields.forEach { it.text.clear() }
            status.text = if (isOnline()) {
                tx("Saved on device · syncing…", "Device par save ho gaya · sync ho raha hai…", "डिवाइस पर सेव हुआ · सिंक हो रहा है…")
            } else {
                tx("Saved offline · pending sync", "Offline save ho gaya · sync pending hai", "ऑफलाइन सेव हुआ · सिंक लंबित है")
            }
            refreshLocal()
            if (isOnline()) SyncScheduler.syncNow(this)
        }.onFailure {
            status.text = it.message ?: tx("Could not save product", "Product save nahi hua", "उत्पाद सेव नहीं हो सका")
        }
    }


    private fun scanBarcodeInto(target: EditText, nameTarget: EditText, infoTarget: TextView) {
        val options = GmsBarcodeScannerOptions.Builder()
            .setBarcodeFormats(
                Barcode.FORMAT_EAN_13, Barcode.FORMAT_EAN_8, Barcode.FORMAT_UPC_A, Barcode.FORMAT_UPC_E,
                Barcode.FORMAT_CODE_128, Barcode.FORMAT_CODE_39, Barcode.FORMAT_CODE_93, Barcode.FORMAT_ITF,
                Barcode.FORMAT_CODABAR, Barcode.FORMAT_QR_CODE, Barcode.FORMAT_DATA_MATRIX
            )
            .enableAutoZoom()
            .build()

        GmsBarcodeScanning.getClient(this, options)
            .startScan()
            .addOnSuccessListener { scanned ->
                val value = scanned.rawValue.orEmpty().trim()
                if (value.isBlank()) {
                    Toast.makeText(this, tx("Barcode could not be read", "Barcode read nahi hua", "बारकोड पढ़ा नहीं जा सका"), Toast.LENGTH_SHORT).show()
                    return@addOnSuccessListener
                }
                target.setText(value)
                target.setSelection(target.text.length)
                val duplicate = products.firstOrNull { it.barcode.orEmpty().trim().equals(value, ignoreCase = true) }
                if (duplicate != null) {
                    target.error = tx("This barcode already belongs to ${duplicate.name}", "Ye barcode pehle se ${duplicate.name} ka hai", "यह बारकोड पहले से ${duplicate.name} का है")
                    infoTarget.text = tx("Existing inventory product found: ${duplicate.name}", "Inventory mein product mil gaya: ${duplicate.name}", "इन्वेंटरी में उत्पाद मिला: ${duplicate.name}")
                } else {
                    lookupBarcode(value, nameTarget, infoTarget)
                }
            }
            .addOnFailureListener { error ->
                Toast.makeText(this, tx(
                    "Scanner unavailable: ${error.message ?: "Google Play services required"}",
                    "Scanner available nahi hai: ${error.message ?: "Google Play services chahiye"}",
                    "स्कैनर उपलब्ध नहीं है: ${error.message ?: "Google Play services आवश्यक है"}"
                ), Toast.LENGTH_LONG).show()
            }
    }

    private fun lookupBarcode(value: String, nameTarget: EditText, infoTarget: TextView) {
        val online = isOnline()
        status.text = tx("Looking up barcode…", "Barcode details dhundh rahe hain…", "बारकोड जानकारी खोजी जा रही है…")
        infoTarget.text = tx("Checking Brandspire cache and public product databases…", "Brandspire cache aur public product databases check ho rahe hain…", "Brandspire कैश और सार्वजनिक उत्पाद डेटाबेस जांचे जा रहे हैं…")
        scope.launch {
            val outcome = withContext(Dispatchers.IO) { SmartBarcodeLookup.lookup(this@ProductsActivity, value, online) }
            val info = outcome.product
            if (info != null) {
                if (nameTarget.text.toString().trim().isBlank()) nameTarget.setText(info.displayName)
                val meta = listOfNotNull(info.brand, info.category, info.source).joinToString(" · ")
                infoTarget.text = tx(
                    "Product found${if (outcome.fromCache) " from saved lookup" else " online"}: $meta. Verify selling price, GST and stock before saving.",
                    "Product ${if (outcome.fromCache) "saved lookup se" else "online"} mil gaya: $meta. Save karne se pehle selling price, GST aur stock verify karo.",
                    "उत्पाद ${if (outcome.fromCache) "सेव किए गए लुकअप से" else "ऑनलाइन"} मिला: $meta। सेव करने से पहले बिक्री मूल्य, GST और स्टॉक जांचें।"
                )
                status.text = tx("Product details fetched.", "Product details fetch ho gayi.", "उत्पाद जानकारी प्राप्त हो गई।")
            } else {
                infoTarget.text = tx(
                    "No public product details were found for this barcode. Fill the product details manually.",
                    "Is barcode ki public details nahi mili. Product details manually fill karo.",
                    "इस बारकोड की सार्वजनिक जानकारी नहीं मिली। उत्पाद जानकारी मैन्युअली भरें।"
                )
                status.text = if (!online) tx("Offline — no saved lookup found.", "Offline — saved lookup nahi mila.", "ऑफलाइन — सेव किया गया लुकअप नहीं मिला।") else tx("Barcode not found online.", "Barcode online nahi mila.", "बारकोड ऑनलाइन नहीं मिला।")
            }
        }
    }

    private fun refreshLocal() {
        products = db.cachedProducts(organizationId)
        status.text = tx("${products.size} cached product(s)", "${products.size} cached product(s)", "${products.size} कैश किए गए उत्पाद")
        renderList(if (::search.isInitialized) search.text?.toString().orEmpty() else "")
    }

    private fun renderList(query: String) {
        if (!::list.isInitialized) return
        list.removeAllViews()
        val q = query.trim().lowercase()
        val visible = products.filter {
            q.isBlank() || it.name.lowercase().contains(q) || it.sku.orEmpty().lowercase().contains(q) || it.barcode.orEmpty().lowercase().contains(q)
        }
        if (visible.isEmpty()) {
            list.addView(bsEmptyState(
                tx("No products found", "Koi product nahi mila", "कोई उत्पाद नहीं मिला"),
                tx("Add a product above or change your search.", "Upar product add karo ya search change karo.", "ऊपर उत्पाद जोड़ें या खोज बदलें।")
            ))
            return
        }
        visible.forEach { p ->
            val card = bsCard(15).apply {
                val top = LinearLayout(this@ProductsActivity).apply { orientation = LinearLayout.HORIZONTAL; gravity = Gravity.CENTER_VERTICAL }
                top.addView(bsIconBadge("PR"), LinearLayout.LayoutParams(bsDp(42), bsDp(42)).apply { marginEnd = bsDp(12) })
                val copy = LinearLayout(this@ProductsActivity).apply { orientation = LinearLayout.VERTICAL }
                val nameRow = LinearLayout(this@ProductsActivity).apply { orientation = LinearLayout.HORIZONTAL; gravity = Gravity.CENTER_VERTICAL }
                nameRow.addView(bsText(p.name, 14.5f, LaunchColors.ink, true), LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1f))
                if (p.pendingSync) nameRow.addView(bsText(tx("PENDING", "PENDING", "लंबित"), 9f, LaunchColors.amber, true).apply {
                    setPadding(bsDp(7), bsDp(4), bsDp(7), bsDp(4)); background = bsRounded(LaunchColors.softAmber, 99)
                })
                copy.addView(nameRow)
                copy.addView(bsText("${money(p.sellingPrice)} · GST ${fmt(p.taxRate)}%", 11f, LaunchColors.muted).apply { setPadding(0, bsDp(3), 0, 0) })
                top.addView(copy, LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1f))
                val stockGood = p.stock > 5
                top.addView(bsText(
                    "${tx("Stock", "Stock", "स्टॉक")} ${fmt(p.stock)}",
                    10.5f,
                    if (stockGood) LaunchColors.green else LaunchColors.amber,
                    true
                ).apply {
                    setPadding(bsDp(9), bsDp(6), bsDp(9), bsDp(6))
                    background = bsRounded(if (stockGood) LaunchColors.softGreen else LaunchColors.softAmber, 99)
                })
                addView(top)
                val codes = listOfNotNull(p.sku?.let { "SKU $it" }, p.barcode?.let { "Barcode $it" }).joinToString(" · ")
                if (codes.isNotBlank()) addView(bsText(codes, 10f, LaunchColors.subtle).apply { setPadding(bsDp(54), bsDp(7), 0, 0) })
            }
            list.addView(card, LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT).apply { bottomMargin = bsDp(8) })
        }
    }

    private fun money(value: Double) = NumberFormat.getCurrencyInstance(Locale("en", "IN")).format(value)
    private fun fmt(v: Double) = if (v % 1.0 == 0.0) v.toInt().toString() else "%.2f".format(v)
    private fun tx(en: String, hg: String, hi: String) = MobileText.get(language, en, hg, hi)
}
