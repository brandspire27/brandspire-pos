package com.brandspire.pos.ui

import android.app.Activity
import android.app.AlertDialog
import android.content.Intent
import android.graphics.Color
import android.os.Bundle
import android.text.Editable
import android.text.InputType
import android.text.TextWatcher
import android.view.Gravity
import android.view.ViewGroup
import android.widget.ArrayAdapter
import android.widget.EditText
import android.widget.FrameLayout
import android.widget.LinearLayout
import android.widget.ScrollView
import android.widget.Spinner
import android.widget.TextView
import android.widget.Toast
import com.brandspire.pos.auth.SecureSessionStore
import com.brandspire.pos.data.CachedCustomer
import com.brandspire.pos.data.CachedProduct
import com.brandspire.pos.data.OfflineDatabase
import com.brandspire.pos.network.SupabaseHttpClient
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
import org.json.JSONArray
import org.json.JSONObject
import java.text.NumberFormat
import java.util.Locale

class CreateBillActivity : Activity() {
    private val scope = CoroutineScope(Dispatchers.Main)
    private lateinit var db: OfflineDatabase
    private lateinit var organizationId: String
    private lateinit var organizationName: String
    private lateinit var language: String
    private var products: List<CachedProduct> = emptyList()
    private var customers: List<CachedCustomer> = emptyList()
    private val cart = linkedMapOf<String, Int>()

    private lateinit var productList: LinearLayout
    private lateinit var cartList: LinearLayout
    private lateinit var totalText: TextView
    private lateinit var itemCountText: TextView
    private lateinit var search: EditText
    private lateinit var customerSpinner: Spinner
    private lateinit var paymentSpinner: Spinner

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        bsApplyWindowChrome()
        organizationId = intent.getStringExtra("organization_id").orEmpty()
        organizationName = intent.getStringExtra("organization_name").orEmpty().ifBlank { "Brandspire POS" }
        language = MobileText.language(intent.getStringExtra("language"))
        if (organizationId.isBlank()) {
            Toast.makeText(this, tx("Business workspace missing", "Business workspace missing hai", "बिज़नेस वर्कस्पेस उपलब्ध नहीं है"), Toast.LENGTH_LONG).show()
            finish()
            return
        }
        db = OfflineDatabase(this)
        products = db.cachedProducts(organizationId)
        customers = db.cachedCustomers(organizationId)
        render()
    }

    private fun render() {
        val frame = FrameLayout(this).apply { setBackgroundColor(LaunchColors.bg) }
        val scroll = ScrollView(this).apply { setBackgroundColor(LaunchColors.bg); clipToPadding = false }
        val root = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            setPadding(bsDp(20), bsDp(18), bsDp(20), bsDp(122))
        }
        scroll.addView(root)
        frame.addView(scroll)
        setContentView(frame)

        val top = bsTopBar(
            tx("Create Bill", "Bill Banao", "बिल बनाएं"),
            tx("Search, scan, collect payment and finish in a few taps.", "Search, scan, payment lo aur few taps mein bill finish karo.", "खोजें, स्कैन करें, भुगतान लें और कुछ टैप में बिल पूरा करें।")
        ) { finish() }
        val live = bsPill(if (isOnline()) tx("ONLINE", "ONLINE", "ऑनलाइन") else tx("OFFLINE", "OFFLINE", "ऑफलाइन"), isOnline())
        top.addView(live)
        root.addView(top)

        root.addView(bsText(organizationName, 11f, LaunchColors.muted, true).apply {
            setPadding(bsDp(60), bsDp(5), 0, 0)
        })

        if (products.isEmpty()) {
            root.addView(bsTintCard(LaunchColors.softRed, Color.rgb(254, 226, 226), 16).apply {
                addView(bsText(tx("No cached products", "Cached products nahi hain", "कैश किए गए उत्पाद उपलब्ध नहीं हैं"), 14f, LaunchColors.red, true))
                addView(bsText(tx(
                    "Go Home and sync Products & Customers before billing.",
                    "Home par jaake Products & Customers sync karo, phir bill banao.",
                    "होम पर जाकर Products & Customers सिंक करें, फिर बिल बनाएं।"
                ), 11.5f, LaunchColors.red).apply { setPadding(0, bsDp(5), 0, 0) })
            }, LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT).apply { topMargin = bsDp(16) })
        }

        root.addView(bsSection(tx("Bill details", "Bill details", "बिल विवरण")))
        val details = bsCard(16)
        val detailRow = LinearLayout(this).apply { orientation = LinearLayout.HORIZONTAL; weightSum = 2f }
        detailRow.addView(spinnerBlock(
            tx("Customer", "Customer", "ग्राहक"),
            buildList {
                add(tx("Walk-in customer", "Walk-in customer", "वॉक-इन ग्राहक"))
                addAll(customers.map { it.name + (it.phone?.let { p -> " · $p" } ?: "") })
            },
            customer = true
        ), LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1f).apply { marginEnd = bsDp(6) })
        detailRow.addView(spinnerBlock(
            tx("Payment", "Payment", "भुगतान"),
            listOf("CASH", "UPI", "CARD", "CREDIT", "OTHER"),
            customer = false
        ), LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1f).apply { marginStart = bsDp(6) })
        details.addView(detailRow)
        root.addView(details)

        root.addView(bsSection(tx("Products", "Products", "उत्पाद")))
        val searchCard = bsCard(12)
        val searchRow = LinearLayout(this).apply { orientation = LinearLayout.HORIZONTAL; gravity = Gravity.CENTER_VERTICAL }
        search = bsInput(tx("Name, SKU or barcode", "Name, SKU ya barcode", "नाम, SKU या बारकोड")).apply {
            addTextChangedListener(object : TextWatcher {
                override fun beforeTextChanged(s: CharSequence?, start: Int, count: Int, after: Int) = Unit
                override fun onTextChanged(s: CharSequence?, start: Int, before: Int, count: Int) { renderProducts(s?.toString().orEmpty()) }
                override fun afterTextChanged(s: Editable?) = Unit
            })
        }
        searchRow.addView(search, LinearLayout.LayoutParams(0, bsDp(52), 1f).apply { marginEnd = bsDp(8) })
        searchRow.addView(bsPrimaryButton(tx("Scan", "Scan", "स्कैन")) { scanBarcode() }, LinearLayout.LayoutParams(bsDp(86), bsDp(52)))
        searchCard.addView(searchRow)
        searchCard.addView(bsText(
            tx(
                "Camera scan or USB/Bluetooth keyboard scanner supported.",
                "Camera scan ya USB/Bluetooth keyboard scanner supported hai.",
                "कैमरा स्कैन या USB/Bluetooth कीबोर्ड स्कैनर समर्थित है।"
            ),
            10.5f,
            LaunchColors.muted
        ).apply { setPadding(bsDp(2), bsDp(8), 0, 0) })
        searchCard.addView(bsSecondaryButton(
            tx("+ Add New Product to Inventory", "+ Naya Product Inventory mein Add Karo", "+ नया उत्पाद इन्वेंटरी में जोड़ें")
        ) { showQuickAddProductDialog(search.text?.toString().orEmpty()) }, LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, bsDp(48)).apply {
            topMargin = bsDp(10)
        })
        root.addView(searchCard)

        productList = LinearLayout(this).apply { orientation = LinearLayout.VERTICAL; setPadding(0, bsDp(9), 0, 0) }
        root.addView(productList)
        renderProducts("")

        root.addView(bsSection(tx("Your cart", "Aapka cart", "आपकी कार्ट")))
        cartList = LinearLayout(this).apply { orientation = LinearLayout.VERTICAL }
        root.addView(cartList)

        val bottom = LinearLayout(this).apply {
            orientation = LinearLayout.HORIZONTAL
            gravity = Gravity.CENTER_VERTICAL
            setPadding(bsDp(16), bsDp(12), bsDp(12), bsDp(12))
            background = bsRounded(Color.WHITE, 22, LaunchColors.border)
            elevation = bsDp(12).toFloat()
        }
        val totalCopy = LinearLayout(this).apply { orientation = LinearLayout.VERTICAL }
        itemCountText = bsText(tx("0 items", "0 items", "0 आइटम"), 10.5f, LaunchColors.muted, true)
        totalText = bsText(money(0.0), 22f, LaunchColors.ink, true).apply { setPadding(0, bsDp(2), 0, 0) }
        totalCopy.addView(itemCountText)
        totalCopy.addView(totalText)
        bottom.addView(totalCopy, LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1f))
        bottom.addView(bsPrimaryButton(tx("Save Bill", "Bill Save Karo", "बिल सेव करें")) { saveBill() }, LinearLayout.LayoutParams(bsDp(142), bsDp(52)))
        frame.addView(bottom, FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, bsDp(78), Gravity.BOTTOM).apply {
            marginStart = bsDp(12)
            marginEnd = bsDp(12)
            bottomMargin = bsDp(10)
        })
        renderCart()
    }

    private fun spinnerBlock(title: String, values: List<String>, customer: Boolean): LinearLayout = LinearLayout(this).apply {
        orientation = LinearLayout.VERTICAL
        addView(bsText(title.uppercase(), 9.5f, LaunchColors.muted, true).apply { letterSpacing = .08f; setPadding(bsDp(2), 0, 0, bsDp(6)) })
        val spinner = Spinner(this@CreateBillActivity).apply {
            adapter = ArrayAdapter(this@CreateBillActivity, android.R.layout.simple_spinner_dropdown_item, values)
            background = bsRounded(Color.WHITE, 13, LaunchColors.border)
            setPadding(bsDp(8), 0, bsDp(8), 0)
        }
        addView(spinner, LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, bsDp(50)))
        if (customer) customerSpinner = spinner else paymentSpinner = spinner
    }

    private fun scanBarcode() {
        val options = GmsBarcodeScannerOptions.Builder()
            .setBarcodeFormats(
                Barcode.FORMAT_EAN_13,
                Barcode.FORMAT_EAN_8,
                Barcode.FORMAT_UPC_A,
                Barcode.FORMAT_UPC_E,
                Barcode.FORMAT_CODE_128,
                Barcode.FORMAT_CODE_39,
                Barcode.FORMAT_CODE_93,
                Barcode.FORMAT_ITF,
                Barcode.FORMAT_CODABAR,
                Barcode.FORMAT_QR_CODE,
                Barcode.FORMAT_DATA_MATRIX
            )
            .enableAutoZoom()
            .build()

        GmsBarcodeScanning.getClient(this, options)
            .startScan()
            .addOnSuccessListener { barcode ->
                val value = barcode.rawValue?.trim().orEmpty()
                if (value.isBlank()) {
                    Toast.makeText(this, tx("Barcode could not be read", "Barcode read nahi hua", "बारकोड पढ़ा नहीं जा सका"), Toast.LENGTH_SHORT).show()
                    return@addOnSuccessListener
                }
                val exact = products.firstOrNull { product ->
                    product.barcode.orEmpty().trim().equals(value, ignoreCase = true) ||
                        product.sku.orEmpty().trim().equals(value, ignoreCase = true)
                }
                if (exact != null) {
                    addProduct(exact)
                    search.setText("")
                    Toast.makeText(this, "${exact.name} ${tx("added", "add ho gaya", "जोड़ दिया गया")}", Toast.LENGTH_SHORT).show()
                } else {
                    search.setText(value)
                    search.setSelection(search.text.length)
                    smartLookupAndAdd(value)
                }
            }
            .addOnCanceledListener {
                Toast.makeText(this, tx("Scan cancelled", "Scan cancel ho gaya", "स्कैन रद्द हुआ"), Toast.LENGTH_SHORT).show()
            }
            .addOnFailureListener { error ->
                Toast.makeText(this, tx(
                    "Scanner unavailable: ${error.message ?: "Google Play services required"}",
                    "Scanner available nahi hai: ${error.message ?: "Google Play services chahiye"}",
                    "स्कैनर उपलब्ध नहीं है: ${error.message ?: "Google Play services आवश्यक है"}"
                ), Toast.LENGTH_LONG).show()
            }
    }

    private fun smartLookupAndAdd(value: String) {
        if (!isOnline()) {
            AlertDialog.Builder(this)
                .setTitle(tx("New barcode detected", "Naya barcode mila", "नया बारकोड मिला"))
                .setMessage(tx(
                    "This barcode is not in local inventory. You can still create the product offline now; online product lookup will run later when internet is available.",
                    "Ye barcode local inventory mein nahi hai. Product ko abhi offline create kar sakte ho; internet aane par online lookup available hoga.",
                    "यह बारकोड लोकल इन्वेंटरी में नहीं है। आप उत्पाद अभी ऑफलाइन बना सकते हैं; इंटरनेट उपलब्ध होने पर ऑनलाइन लुकअप उपलब्ध होगा।"
                ))
                .setNegativeButton(tx("Not now", "Abhi nahi", "अभी नहीं"), null)
                .setPositiveButton(tx("Add Product Offline", "Offline Product Add Karo", "ऑफलाइन उत्पाद जोड़ें")) { _, _ -> showQuickAddProductDialog(value) }
                .show()
            return
        }
        Toast.makeText(this, tx("Finding product details…", "Product details dhundh rahe hain…", "उत्पाद जानकारी खोजी जा रही है…"), Toast.LENGTH_SHORT).show()
        scope.launch {
            val outcome = withContext(Dispatchers.IO) { SmartBarcodeLookup.lookup(this@CreateBillActivity, value, true) }
            val found = outcome.product
            if (found != null) {
                showQuickAddProductDialog(value, found)
            } else {
                AlertDialog.Builder(this@CreateBillActivity)
                    .setTitle(tx("Product not found online", "Product online nahi mila", "उत्पाद ऑनलाइन नहीं मिला"))
                    .setMessage(tx(
                        "No public details were found for this barcode. You can still add the product manually to inventory and this bill.",
                        "Is barcode ki public details nahi mili. Product ko manually inventory aur is bill mein add kar sakte ho.",
                        "इस बारकोड की सार्वजनिक जानकारी नहीं मिली। आप उत्पाद को मैन्युअली इन्वेंटरी और इस बिल में जोड़ सकते हैं।"
                    ))
                    .setNegativeButton(tx("Not now", "Abhi nahi", "अभी नहीं"), null)
                    .setPositiveButton(tx("Add Manually", "Manually Add Karo", "मैन्युअली जोड़ें")) { _, _ -> showQuickAddProductDialog(value) }
                    .show()
            }
        }
    }

    private fun renderProducts(query: String) {
        if (!::productList.isInitialized) return
        productList.removeAllViews()
        val q = query.trim().lowercase()
        val visible = products.filter {
            q.isBlank() || it.name.lowercase().contains(q) || it.sku.orEmpty().lowercase().contains(q) || it.barcode.orEmpty().lowercase().contains(q)
        }.take(8)
        if (visible.isEmpty()) {
            productList.addView(bsEmptyState(
                tx("No matching products", "Matching product nahi mila", "मिलता हुआ उत्पाद नहीं मिला"),
                tx(
                    "Try another search or add this as a new inventory product.",
                    "Search change karo ya isko naya inventory product add karo.",
                    "खोज बदलें या इसे नया इन्वेंटरी उत्पाद जोड़ें।"
                )
            ))
            productList.addView(bsPrimaryButton(
                tx("Add New Product", "Naya Product Add Karo", "नया उत्पाद जोड़ें")
            ) { showQuickAddProductDialog(search.text?.toString().orEmpty()) }, LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, bsDp(50)).apply {
                topMargin = bsDp(8)
            })
            return
        }
        visible.forEach { product ->
            val inCart = cart[product.id] ?: 0
            val row = bsCard(14).apply {
                orientation = LinearLayout.HORIZONTAL
                gravity = Gravity.CENTER_VERTICAL
                val badge = bsIconBadge(if (product.barcode.isNullOrBlank()) "PR" else "▥")
                addView(badge, LinearLayout.LayoutParams(bsDp(42), bsDp(42)).apply { marginEnd = bsDp(12) })
                val copy = LinearLayout(this@CreateBillActivity).apply { orientation = LinearLayout.VERTICAL }
                copy.addView(bsText(product.name, 14.5f, LaunchColors.ink, true))
                copy.addView(bsText("${money(product.sellingPrice)} · ${tx("Stock", "Stock", "स्टॉक")} ${formatQty(product.stock)} · GST ${formatQty(product.taxRate)}%", 10.8f, LaunchColors.muted).apply { setPadding(0, bsDp(3), 0, 0) })
                addView(copy, LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1f))
                val add = bsSecondaryButton(if (inCart > 0) "+  $inCart" else tx("+ Add", "+ Add", "+ जोड़ें")) { addProduct(product) }
                add.isEnabled = product.stock > inCart
                addView(add, LinearLayout.LayoutParams(bsDp(76), bsDp(44)))
            }
            productList.addView(row, LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT).apply { bottomMargin = bsDp(7) })
        }
    }


    private fun showQuickAddProductDialog(prefill: String = "", initialLookup: BarcodeProductInfo? = null) {
        val session = SecureSessionStore(this).read()
        val content = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            setPadding(bsDp(20), bsDp(8), bsDp(20), 0)
        }
        val name = bsInput(tx("Product name", "Product name", "उत्पाद का नाम"))
        val price = bsInput(tx("Selling price", "Selling price", "बिक्री मूल्य")).apply {
            inputType = InputType.TYPE_CLASS_NUMBER or InputType.TYPE_NUMBER_FLAG_DECIMAL
        }
        val gst = bsInput(tx("GST % (e.g. 18)", "GST % (jaise 18)", "GST % (जैसे 18)")).apply {
            inputType = InputType.TYPE_CLASS_NUMBER or InputType.TYPE_NUMBER_FLAG_DECIMAL
            setText("0")
        }
        val stock = bsInput(tx("Opening stock", "Opening stock", "प्रारंभिक स्टॉक")).apply {
            inputType = InputType.TYPE_CLASS_NUMBER or InputType.TYPE_NUMBER_FLAG_DECIMAL
            setText("1")
        }
        val sku = bsInput(tx("SKU (optional)", "SKU (optional)", "SKU (वैकल्पिक)"))
        val barcode = bsInput(tx("Barcode (optional)", "Barcode (optional)", "बारकोड (वैकल्पिक)"))
        val lookupInfo = bsText(
            tx("Scan/enter a barcode to fetch available product details.", "Barcode scan/enter karo, available product details fetch ho jayengi.", "बारकोड स्कैन/दर्ज करें, उपलब्ध उत्पाद जानकारी प्राप्त हो जाएगी।"),
            10.5f, LaunchColors.muted
        )
        var lookupProduct = initialLookup
        if (initialLookup != null) {
            name.setText(initialLookup.displayName)
            val meta = listOfNotNull(initialLookup.brand, initialLookup.category, initialLookup.source).joinToString(" · ")
            lookupInfo.text = tx(
                "Product found: $meta. Confirm price, GST and stock.",
                "Product mil gaya: $meta. Price, GST aur stock confirm karo.",
                "उत्पाद मिला: $meta। मूल्य, GST और स्टॉक की पुष्टि करें।"
            )
        }
        val cleanPrefill = prefill.trim()
        if (cleanPrefill.isNotBlank()) {
            val looksLikeCode = cleanPrefill.length >= 4 && cleanPrefill.none { it.isWhitespace() }
            if (looksLikeCode) barcode.setText(cleanPrefill) else name.setText(cleanPrefill)
        }
        listOf(name, price, gst, stock, sku, barcode).forEach { field ->
            content.addView(field, LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, bsDp(52)).apply { topMargin = bsDp(8) })
        }
        content.addView(lookupInfo.apply { setPadding(bsDp(2), bsDp(8), bsDp(2), 0) })
        val fetchButton = bsSecondaryButton(tx("Fetch Product Details", "Product Details Fetch Karo", "उत्पाद जानकारी प्राप्त करें")) { }
        content.addView(fetchButton, LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, bsDp(46)).apply { topMargin = bsDp(8) })

        val dialog = AlertDialog.Builder(this)
            .setTitle(tx("Add Product to Inventory", "Product Inventory mein Add Karo", "उत्पाद इन्वेंटरी में जोड़ें"))
            .setMessage(tx(
                "Save once, then the product will be added to this bill automatically.",
                "Ek baar save karo, product inventory mein add hoke is bill mein automatically aa jayega.",
                "एक बार सेव करें, उत्पाद इन्वेंटरी में जुड़कर इस बिल में अपने आप आ जाएगा।"
            ))
            .setView(content)
            .setNegativeButton(tx("Cancel", "Cancel", "रद्द करें"), null)
            .setPositiveButton(tx("Save & Add to Bill", "Save Karo & Bill mein Add Karo", "सेव करें और बिल में जोड़ें"), null)
            .create()

        dialog.setOnShowListener {
            fun fetchDetails() {
                val code = barcode.text.toString().trim()
                if (code.isBlank()) {
                    barcode.error = tx("Enter or scan a barcode first", "Pehle barcode enter ya scan karo", "पहले बारकोड दर्ज या स्कैन करें")
                    return
                }
                lookupInfo.text = tx("Looking up product…", "Product details dhundh rahe hain…", "उत्पाद जानकारी खोजी जा रही है…")
                fetchButton.isEnabled = false
                scope.launch {
                    val outcome = withContext(Dispatchers.IO) { SmartBarcodeLookup.lookup(this@CreateBillActivity, code, isOnline()) }
                    val found = outcome.product
                    if (found != null) {
                        lookupProduct = found
                        if (name.text.toString().trim().isBlank()) name.setText(found.displayName)
                        val meta = listOfNotNull(found.brand, found.category, found.source).joinToString(" · ")
                        lookupInfo.text = tx(
                            "Product found${if (outcome.fromCache) " from saved lookup" else " online"}: $meta. Confirm price, GST and stock.",
                            "Product ${if (outcome.fromCache) "saved lookup se" else "online"} mil gaya: $meta. Price, GST aur stock confirm karo.",
                            "उत्पाद ${if (outcome.fromCache) "सेव किए गए लुकअप से" else "ऑनलाइन"} मिला: $meta। मूल्य, GST और स्टॉक की पुष्टि करें।"
                        )
                    } else {
                        lookupInfo.text = tx(
                            "No public product details found. Fill the details manually.",
                            "Public product details nahi mili. Details manually fill karo.",
                            "सार्वजनिक उत्पाद जानकारी नहीं मिली। जानकारी मैन्युअली भरें।"
                        )
                    }
                    fetchButton.isEnabled = true
                }
            }
            fetchButton.setOnClickListener { fetchDetails() }
            if (lookupProduct == null && barcode.text.toString().trim().isNotBlank()) fetchDetails()

            dialog.getButton(AlertDialog.BUTTON_POSITIVE).setOnClickListener {
                val productName = name.text.toString().trim()
                val sellingPrice = price.text.toString().toDoubleOrNull()
                val taxRate = gst.text.toString().toDoubleOrNull() ?: 0.0
                val openingStock = stock.text.toString().toDoubleOrNull() ?: 0.0
                val skuValue = sku.text.toString().trim()
                val barcodeValue = barcode.text.toString().trim()
                when {
                    productName.isBlank() -> name.error = tx("Name is required", "Name required hai", "नाम आवश्यक है")
                    sellingPrice == null || sellingPrice < 0 -> price.error = tx("Enter a valid price", "Valid price enter karo", "सही मूल्य दर्ज करें")
                    taxRate !in 0.0..100.0 -> gst.error = tx("GST must be 0-100", "GST 0-100 hona chahiye", "GST 0-100 होना चाहिए")
                    openingStock <= 0 -> stock.error = tx("Stock must be at least 1 for this bill", "Is bill ke liye stock kam se kam 1 rakho", "इस बिल के लिए स्टॉक कम से कम 1 रखें")
                    barcodeValue.isNotBlank() && products.any { it.barcode.orEmpty().equals(barcodeValue, ignoreCase = true) } -> barcode.error = tx("Barcode already exists", "Barcode pehle se exist karta hai", "बारकोड पहले से मौजूद है")
                    else -> {
                        dialog.getButton(AlertDialog.BUTTON_POSITIVE).isEnabled = false
                        dialog.getButton(AlertDialog.BUTTON_POSITIVE).text = tx("Saving…", "Save ho raha hai…", "सेव हो रहा है…")
                        runCatching {
                            db.enqueueProduct(
                                organizationId = organizationId,
                                createdBy = session?.userId,
                                name = productName,
                                sellingPrice = sellingPrice,
                                taxRate = taxRate,
                                openingStock = openingStock,
                                sku = skuValue.ifBlank { null },
                                barcode = barcodeValue.ifBlank { null }
                            )
                        }.onSuccess { localId ->
                            products = db.cachedProducts(organizationId)
                            val created = products.firstOrNull { it.id == localId }
                            if (created != null) addProduct(created)
                            search.setText("")
                            if (isOnline()) SyncScheduler.syncNow(this@CreateBillActivity)
                            Toast.makeText(this@CreateBillActivity, tx(
                                if (isOnline()) "${created?.name ?: productName} saved and queued for sync" else "${created?.name ?: productName} saved offline and added to bill",
                                if (isOnline()) "${created?.name ?: productName} save ho gaya, sync queue mein hai" else "${created?.name ?: productName} offline save hokar bill mein add ho gaya",
                                if (isOnline()) "${created?.name ?: productName} सेव हुआ और सिंक कतार में है" else "${created?.name ?: productName} ऑफलाइन सेव होकर बिल में जोड़ दिया गया"
                            ), Toast.LENGTH_LONG).show()
                            dialog.dismiss()
                        }.onFailure { error ->
                            dialog.getButton(AlertDialog.BUTTON_POSITIVE).isEnabled = true
                            dialog.getButton(AlertDialog.BUTTON_POSITIVE).text = tx("Save & Add to Bill", "Save Karo & Bill mein Add Karo", "सेव करें और बिल में जोड़ें")
                            Toast.makeText(this@CreateBillActivity, error.message ?: tx("Could not save product", "Product save nahi hua", "उत्पाद सेव नहीं हो सका"), Toast.LENGTH_LONG).show()
                        }
                    }
                }
            }
        }
        dialog.show()
    }

    private fun addProduct(product: CachedProduct) {
        val current = cart[product.id] ?: 0
        if (current + 1 > product.stock) {
            Toast.makeText(this, tx("Insufficient cached stock", "Cached stock kam hai", "कैश स्टॉक पर्याप्त नहीं है"), Toast.LENGTH_SHORT).show()
            return
        }
        cart[product.id] = current + 1
        renderCart()
        renderProducts(search.text?.toString().orEmpty())
    }

    private fun renderCart() {
        if (!::cartList.isInitialized) return
        cartList.removeAllViews()
        if (cart.isEmpty()) {
            cartList.addView(bsEmptyState(
                tx("Cart is empty", "Cart empty hai", "कार्ट खाली है"),
                tx("Add products from the list above.", "Upar list se products add karo.", "ऊपर की सूची से उत्पाद जोड़ें।")
            ))
        } else {
            cart.forEach { (id, qty) ->
                val product = products.firstOrNull { it.id == id } ?: return@forEach
                val row = bsCard(14).apply {
                    orientation = LinearLayout.HORIZONTAL
                    gravity = Gravity.CENTER_VERTICAL
                    val copy = LinearLayout(this@CreateBillActivity).apply { orientation = LinearLayout.VERTICAL }
                    copy.addView(bsText(product.name, 14f, LaunchColors.ink, true))
                    copy.addView(bsText("$qty × ${money(product.sellingPrice)}  ·  ${money(product.sellingPrice * qty)}", 10.8f, LaunchColors.muted).apply { setPadding(0, bsDp(3), 0, 0) })
                    addView(copy, LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1f))
                    addView(bsGhostButton("−") { changeQty(product, -1) }, LinearLayout.LayoutParams(bsDp(42), bsDp(42)))
                    addView(bsText(qty.toString(), 14f, LaunchColors.ink, true).apply { gravity = Gravity.CENTER }, LinearLayout.LayoutParams(bsDp(38), bsDp(42)))
                    val plus = bsSecondaryButton("+") { changeQty(product, 1) }
                    plus.isEnabled = qty < product.stock
                    addView(plus, LinearLayout.LayoutParams(bsDp(42), bsDp(42)))
                }
                cartList.addView(row, LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT).apply { bottomMargin = bsDp(7) })
            }
        }
        val itemCount = cart.values.sum()
        itemCountText.text = tx("$itemCount item${if (itemCount == 1) "" else "s"}", "$itemCount items", "$itemCount आइटम")
        totalText.text = money(estimatedTotal())
    }

    private fun changeQty(product: CachedProduct, delta: Int) {
        val next = (cart[product.id] ?: 0) + delta
        when {
            next <= 0 -> cart.remove(product.id)
            next <= product.stock -> cart[product.id] = next
        }
        renderCart()
        renderProducts(search.text?.toString().orEmpty())
    }

    private fun estimatedTotal(): Double = cart.entries.sumOf { (id, qty) ->
        (products.firstOrNull { it.id == id }?.sellingPrice ?: 0.0) * qty
    }

    private fun saveBill() {
        if (cart.isEmpty()) {
            Toast.makeText(this, tx("Add at least one product", "Kam se kam ek product add karo", "कम से कम एक उत्पाद जोड़ें"), Toast.LENGTH_SHORT).show()
            return
        }
        val items = JSONArray()
        cart.forEach { (id, qty) -> items.put(JSONObject().put("product_id", id).put("quantity", qty)) }
        val customerIndex = customerSpinner.selectedItemPosition
        val customerId = if (customerIndex <= 0) null else customers.getOrNull(customerIndex - 1)?.id
        val payment = paymentSpinner.selectedItem?.toString() ?: "CASH"
        val payload = JSONObject().apply {
            put("organization_id", organizationId)
            if (customerId == null) put("customer_id", JSONObject.NULL) else put("customer_id", customerId)
            put("items", items)
            put("discount_type", "PERCENT")
            put("discount_value", 0)
            put("payment_method", payment)
            put("amount_paid", JSONObject.NULL)
        }
        val total = estimatedTotal()
        val receiptItems = JSONArray()
        cart.forEach { (id, qty) ->
            val product = products.firstOrNull { it.id == id } ?: return@forEach
            receiptItems.put(JSONObject().apply {
                put("product_id", product.id)
                put("name", product.name)
                put("quantity", qty)
                put("rate", product.sellingPrice)
                put("tax_rate", product.taxRate)
                put("total", product.sellingPrice * qty)
            })
        }
        val customerName = if (customerIndex <= 0) tx("Walk-in customer", "Walk-in customer", "वॉक-इन ग्राहक") else customers.getOrNull(customerIndex - 1)?.name ?: "Customer"
        val receipt = JSONObject().apply {
            put("organization_name", organizationName)
            put("customer_name", customerName)
            put("payment_method", payment)
            put("items", receiptItems)
            put("total", total)
        }
        val clientId = runCatching {
            db.enqueueInvoiceWithReceipt(payload, organizationId, receipt, total, payment)
        }.getOrElse { error ->
            Toast.makeText(this, error.message ?: tx("Could not save bill", "Bill save nahi hua", "बिल सेव नहीं हो सका"), Toast.LENGTH_LONG).show()
            return
        }
        if (isOnline()) SyncScheduler.syncNow(this)
        startActivity(Intent(this, BillSuccessActivity::class.java).apply {
            putExtra("client_invoice_id", clientId)
            putExtra("organization_id", organizationId)
            putExtra("language", language)
        })
        finish()
    }

    private fun money(value: Double): String = NumberFormat.getCurrencyInstance(Locale("en", "IN")).format(value)
    private fun formatQty(value: Double): String = if (value % 1.0 == 0.0) value.toInt().toString() else "%.2f".format(value)
    private fun tx(en: String, hg: String, hi: String) = MobileText.get(language, en, hg, hi)
}
