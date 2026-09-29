package com.brandspire.pos.ui

import android.app.Activity
import android.graphics.Color
import android.os.Bundle
import android.text.Editable
import android.text.InputType
import android.text.TextWatcher
import android.view.Gravity
import android.view.View
import android.view.ViewGroup
import android.widget.EditText
import android.widget.LinearLayout
import android.widget.ScrollView
import android.widget.TextView
import android.widget.Toast
import com.brandspire.pos.auth.SecureSessionStore
import com.brandspire.pos.data.CachedCustomer
import com.brandspire.pos.data.OfflineDatabase
import com.brandspire.pos.sync.SyncScheduler
import com.brandspire.pos.sync.isOnline
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext

class CustomersActivity : Activity() {
    private val scope = CoroutineScope(Dispatchers.Main)
    private lateinit var db: OfflineDatabase
    private lateinit var organizationId: String
    private lateinit var language: String
    private lateinit var list: LinearLayout
    private lateinit var search: EditText
    private lateinit var status: TextView
    private var customers: List<CachedCustomer> = emptyList()

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
        val scroll = ScrollView(this).apply { setBackgroundColor(LaunchColors.bg); clipToPadding = false }
        val root = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            setPadding(bsDp(20), bsDp(20), bsDp(20), bsDp(34))
        }
        scroll.addView(root)
        setContentView(scroll)

        root.addView(bsTopBar(
            tx("Customers", "Customers", "ग्राहक"),
            tx("Save customer details once and bill faster next time.", "Customer details ek baar save karo, next bill aur fast banao.", "ग्राहक विवरण एक बार सेव करें और अगला बिल और तेज़ बनाएं।")
        ) { finish() })

        status = bsText("", 11.5f, LaunchColors.muted).apply {
            setPadding(bsDp(2), bsDp(14), bsDp(2), bsDp(2))
        }
        root.addView(status)

        root.addView(bsSection(tx("New customer", "Naya customer", "नया ग्राहक")))
        val addCard = bsCard(18)
        val cardHead = LinearLayout(this).apply { orientation = LinearLayout.HORIZONTAL; gravity = Gravity.CENTER_VERTICAL }
        cardHead.addView(bsIconBadge("CU"), LinearLayout.LayoutParams(bsDp(42), bsDp(42)).apply { marginEnd = bsDp(12) })
        val headCopy = LinearLayout(this).apply { orientation = LinearLayout.VERTICAL }
        headCopy.addView(bsText(tx("Add customer", "Customer Add Karo", "ग्राहक जोड़ें"), 17f, LaunchColors.ink, true))
        headCopy.addView(bsText(tx("Name is required. Phone and email are optional.", "Name required hai. Phone aur email optional hain.", "नाम आवश्यक है। फोन और ईमेल वैकल्पिक हैं।"), 11.5f, LaunchColors.muted).apply { setPadding(0, bsDp(3), 0, 0) })
        cardHead.addView(headCopy, LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1f))
        addCard.addView(cardHead)

        val name = field(tx("Customer name", "Customer name", "ग्राहक का नाम"))
        val phone = field(tx("10-digit mobile (optional)", "10-digit mobile (optional)", "10 अंकों का मोबाइल (वैकल्पिक)"), phone = true)
        val email = field(tx("Email (optional)", "Email (optional)", "ईमेल (वैकल्पिक)"), email = true)
        addCard.addView(name)
        addCard.addView(phone)
        addCard.addView(email)
        addCard.addView(bsPrimaryButton(tx("Save Customer", "Customer Save Karo", "ग्राहक सेव करें")) {
            val customerName = name.text.toString().trim()
            if (customerName.isBlank()) {
                name.error = tx("Name is required", "Name required hai", "नाम आवश्यक है")
                return@bsPrimaryButton
            }
            addCustomer(customerName, phone.text.toString().trim(), email.text.toString().trim(), name, phone, email)
        }, LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, bsDp(52)).apply { topMargin = bsDp(14) })
        root.addView(addCard)

        root.addView(bsSection(tx("Saved customers", "Saved customers", "सेव किए गए ग्राहक")))
        search = bsInput(tx("Search name or mobile", "Name ya mobile search karo", "नाम या मोबाइल खोजें")).apply {
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

    private fun field(hint: String, phone: Boolean = false, email: Boolean = false): EditText = bsInput(hint).apply {
        if (phone) inputType = InputType.TYPE_CLASS_PHONE
        if (email) inputType = InputType.TYPE_CLASS_TEXT or InputType.TYPE_TEXT_VARIATION_EMAIL_ADDRESS
        layoutParams = LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, bsDp(52)).apply { topMargin = bsDp(10) }
    }

    private fun addCustomer(name: String, phone: String, email: String, nameView: EditText, phoneView: EditText, emailView: EditText) {
        val normalizedPhone = phone.filter { it.isDigit() || it == '+' }.trim()
        val duplicate = customers.firstOrNull {
            normalizedPhone.isNotBlank() && it.phone.orEmpty().filter { ch -> ch.isDigit() || ch == '+' } == normalizedPhone
        }
        if (duplicate != null) {
            phoneView.error = tx("This mobile already exists", "Ye mobile pehle se saved hai", "यह मोबाइल पहले से सेव है")
            return
        }
        val session = SecureSessionStore(this).read()
        runCatching {
            db.enqueueCustomer(
                organizationId = organizationId,
                createdBy = session?.userId,
                name = name,
                phone = phone.ifBlank { null },
                email = email.ifBlank { null }
            )
        }.onSuccess {
            nameView.text.clear(); phoneView.text.clear(); emailView.text.clear()
            status.text = if (isOnline()) {
                tx("Saved on device · syncing…", "Device par save ho gaya · sync ho raha hai…", "डिवाइस पर सेव हुआ · सिंक हो रहा है…")
            } else {
                tx("Saved offline · pending sync", "Offline save ho gaya · sync pending hai", "ऑफलाइन सेव हुआ · सिंक लंबित है")
            }
            refreshLocal()
            if (isOnline()) SyncScheduler.syncNow(this)
        }.onFailure {
            status.text = it.message ?: tx("Could not save customer", "Customer save nahi hua", "ग्राहक सेव नहीं हो सका")
        }
    }

    private fun refreshLocal() {
        customers = db.cachedCustomers(organizationId)
        status.text = tx("${customers.size} cached customer(s)", "${customers.size} cached customer(s)", "${customers.size} कैश किए गए ग्राहक")
        renderList(if (::search.isInitialized) search.text?.toString().orEmpty() else "")
    }

    private fun renderList(query: String) {
        if (!::list.isInitialized) return
        list.removeAllViews()
        val q = query.trim().lowercase()
        val visible = customers.filter { q.isBlank() || it.name.lowercase().contains(q) || it.phone.orEmpty().contains(q) }
        if (visible.isEmpty()) {
            list.addView(bsEmptyState(
                tx("No customers found", "Koi customer nahi mila", "कोई ग्राहक नहीं मिला"),
                tx("Add a customer above or change your search.", "Upar customer add karo ya search change karo.", "ऊपर ग्राहक जोड़ें या खोज बदलें।")
            ))
            return
        }
        visible.forEach { customer ->
            val card = bsCard(15).apply {
                val row = LinearLayout(this@CustomersActivity).apply { orientation = LinearLayout.HORIZONTAL; gravity = Gravity.CENTER_VERTICAL }
                val initials = customer.name.trim().take(2).uppercase().ifBlank { "CU" }
                row.addView(bsIconBadge(initials), LinearLayout.LayoutParams(bsDp(42), bsDp(42)).apply { marginEnd = bsDp(12) })
                val copy = LinearLayout(this@CustomersActivity).apply { orientation = LinearLayout.VERTICAL }
                val nameRow = LinearLayout(this@CustomersActivity).apply { orientation = LinearLayout.HORIZONTAL; gravity = Gravity.CENTER_VERTICAL }
                nameRow.addView(bsText(customer.name, 14.5f, LaunchColors.ink, true), LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1f))
                if (customer.pendingSync) nameRow.addView(bsText(tx("PENDING", "PENDING", "लंबित"), 9f, LaunchColors.amber, true).apply {
                    setPadding(bsDp(7), bsDp(4), bsDp(7), bsDp(4)); background = bsRounded(LaunchColors.softAmber, 99)
                })
                copy.addView(nameRow)
                copy.addView(bsText(
                    listOfNotNull(customer.phone, customer.email).joinToString(" · ").ifBlank { tx("No contact details", "Contact details nahi hain", "संपर्क विवरण उपलब्ध नहीं") },
                    11f,
                    LaunchColors.muted
                ).apply { setPadding(0, bsDp(3), 0, 0) })
                row.addView(copy, LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1f))
                if (customer.outstandingBalance > 0) {
                    row.addView(bsText(
                        tx("Due ₹%.2f".format(customer.outstandingBalance), "Baaki ₹%.2f".format(customer.outstandingBalance), "बकाया ₹%.2f".format(customer.outstandingBalance)),
                        10.5f,
                        LaunchColors.amber,
                        true
                    ).apply {
                        setPadding(bsDp(9), bsDp(6), bsDp(9), bsDp(6))
                        background = bsRounded(LaunchColors.softAmber, 99)
                    })
                }
                addView(row)
            }
            list.addView(card, LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT).apply { bottomMargin = bsDp(8) })
        }
    }

    private fun tx(en: String, hg: String, hi: String) = MobileText.get(language, en, hg, hi)
}
