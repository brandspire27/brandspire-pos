package com.brandspire.pos.network

import com.brandspire.pos.BuildConfig
import com.brandspire.pos.auth.AuthSession
import com.brandspire.pos.auth.Workspace
import org.json.JSONArray
import org.json.JSONObject
import java.io.BufferedReader
import java.net.HttpURLConnection
import java.net.URLEncoder
import java.net.URL
import java.time.Instant

class SupabaseHttpClient {
    private val baseUrl = BuildConfig.SUPABASE_URL.trimEnd('/')
    private val anonKey = BuildConfig.SUPABASE_ANON_KEY

    fun isConfigured(): Boolean = baseUrl.startsWith("https://") && anonKey.isNotBlank()

    fun signIn(email: String, password: String): AuthSession {
        require(isConfigured()) { "Supabase Android configuration is missing" }
        val response = request(
            method = "POST",
            path = "/auth/v1/token?grant_type=password",
            bearer = null,
            body = JSONObject().put("email", email.trim()).put("password", password).toString()
        )
        val json = JSONObject(response)
        val user = json.getJSONObject("user")
        val expiresIn = json.optLong("expires_in", 3600)
        return AuthSession(
            accessToken = json.getString("access_token"),
            refreshToken = json.getString("refresh_token"),
            expiresAtEpochSeconds = Instant.now().epochSecond + expiresIn,
            userId = user.getString("id"),
            email = user.optString("email")
        )
    }

    fun refresh(refreshToken: String): AuthSession {
        val response = request(
            method = "POST",
            path = "/auth/v1/token?grant_type=refresh_token",
            bearer = null,
            body = JSONObject().put("refresh_token", refreshToken).toString()
        )
        val json = JSONObject(response)
        val user = json.getJSONObject("user")
        return AuthSession(
            accessToken = json.getString("access_token"),
            refreshToken = json.getString("refresh_token"),
            expiresAtEpochSeconds = Instant.now().epochSecond + json.optLong("expires_in", 3600),
            userId = user.getString("id"),
            email = user.optString("email")
        )
    }

    fun getWorkspace(accessToken: String): Workspace {
        val response = request("POST", "/rest/v1/rpc/get_current_workspace", accessToken, "{}")
        val array = JSONArray(response)
        require(array.length() > 0) { "No active Brandspire POS workspace found for this account" }
        val row = array.getJSONObject(0)
        return Workspace(
            organizationId = row.getString("organization_id"),
            organizationName = row.optString("organization_name", "Brandspire POS"),
            role = row.optString("role", "STAFF"),
            preferredLanguage = row.optString("preferred_language", "en"),
            subscriptionStatus = row.optString("subscription_status", "PENDING_APPROVAL"),
            endsAt = row.optString("ends_at").takeIf { it.isNotBlank() && it != "null" },
            adminMessage = row.optString("admin_message").takeIf { it.isNotBlank() && it != "null" }
        )
    }

    fun fetchProducts(accessToken: String, organizationId: String): JSONArray {
        val org = URLEncoder.encode(organizationId, "UTF-8")
        return JSONArray(request(
            "GET",
            "/rest/v1/products?select=id,name,sku,barcode,selling_price,tax_rate,stock&organization_id=eq.$org&active=eq.true&deleted_at=is.null&order=name.asc&limit=2000",
            accessToken,
            null
        ))
    }

    fun fetchCustomers(accessToken: String, organizationId: String): JSONArray {
        val org = URLEncoder.encode(organizationId, "UTF-8")
        return JSONArray(request(
            "GET",
            "/rest/v1/customers?select=id,name,phone,email,outstanding_balance&organization_id=eq.$org&active=eq.true&deleted_at=is.null&order=name.asc&limit=2000",
            accessToken,
            null
        ))
    }

    fun fetchInvoices(accessToken: String, organizationId: String): JSONArray {
        val org = URLEncoder.encode(organizationId, "UTF-8")
        return JSONArray(request(
            "GET",
            "/rest/v1/invoices?select=id,invoice_number,grand_total,payment_status,status,payment_method,invoice_date,client_invoice_id&organization_id=eq.$org&order=invoice_date.desc&limit=50",
            accessToken,
            null
        ))
    }

    fun createCustomer(
        accessToken: String,
        organizationId: String,
        userId: String,
        name: String,
        phone: String?,
        email: String?
    ) {
        val body = JSONObject().apply {
            put("organization_id", organizationId)
            put("name", name.trim())
            if (phone.isNullOrBlank()) put("phone", JSONObject.NULL) else put("phone", phone.trim())
            if (email.isNullOrBlank()) put("email", JSONObject.NULL) else put("email", email.trim())
            put("created_by", userId)
        }
        request("POST", "/rest/v1/customers", accessToken, body.toString())
    }

    fun createProduct(
        accessToken: String,
        organizationId: String,
        userId: String,
        name: String,
        sellingPrice: Double,
        taxRate: Double,
        openingStock: Double,
        sku: String?,
        barcode: String?
    ) {
        val body = JSONObject().apply {
            put("organization_id", organizationId)
            put("name", name.trim())
            put("selling_price", sellingPrice)
            put("purchase_price", 0)
            put("tax_rate", taxRate)
            put("stock", openingStock)
            put("unit", "pcs")
            put("low_stock_threshold", 5)
            if (sku.isNullOrBlank()) put("sku", JSONObject.NULL) else put("sku", sku.trim())
            if (barcode.isNullOrBlank()) put("barcode", JSONObject.NULL) else put("barcode", barcode.trim())
            put("created_by", userId)
        }
        request("POST", "/rest/v1/products", accessToken, body.toString())
    }

    /**
     * Calls the existing tenant-safe, idempotent create_pos_invoice RPC.
     * Reusing client_invoice_id prevents duplicate invoices when an offline retry happens.
     */
    fun syncInvoice(accessToken: String, envelope: JSONObject): JSONArray {
        val payload = envelope.getJSONObject("payload")
        val body = JSONObject().apply {
            put("p_organization_id", payload.getString("organization_id"))
            put("p_customer_id", payload.opt("customer_id") ?: JSONObject.NULL)
            put("p_items", payload.getJSONArray("items"))
            put("p_discount_type", payload.optString("discount_type", "PERCENT"))
            put("p_discount_value", payload.optDouble("discount_value", 0.0))
            put("p_payment_method", payload.optString("payment_method", "CASH"))
            if (payload.has("amount_paid") && !payload.isNull("amount_paid")) put("p_amount_paid", payload.getDouble("amount_paid"))
            else put("p_amount_paid", JSONObject.NULL)
            put("p_client_invoice_id", envelope.getString("client_invoice_id"))
        }
        return JSONArray(request("POST", "/rest/v1/rpc/create_pos_invoice", accessToken, body.toString()))
    }


    /**
     * Idempotently creates an offline-first customer. If the same local UUID was
     * already accepted, retry returns that row. If another device already has an
     * exact phone/email match, we reuse it and let the device rewrite queued bills.
     */
    fun syncOfflineCustomer(accessToken: String, envelope: JSONObject): String {
        val localId = envelope.getString("local_id")
        val orgId = envelope.getString("organization_id")
        findCustomerById(accessToken, orgId, localId)?.let { return it }

        val phone = envelope.optString("phone").takeIf { it.isNotBlank() && it != "null" }
        val email = envelope.optString("email").takeIf { it.isNotBlank() && it != "null" }
        phone?.let { findCustomerByField(accessToken, orgId, "phone", it)?.let { found -> return found } }
        email?.let { findCustomerByField(accessToken, orgId, "email", it)?.let { found -> return found } }

        val body = JSONObject().apply {
            put("id", localId)
            put("organization_id", orgId)
            put("name", envelope.getString("name").trim())
            if (phone == null) put("phone", JSONObject.NULL) else put("phone", phone)
            if (email == null) put("email", JSONObject.NULL) else put("email", email)
            val createdBy = envelope.optString("created_by").takeIf { it.isNotBlank() && it != "null" }
            if (createdBy == null) put("created_by", JSONObject.NULL) else put("created_by", createdBy)
        }
        return runCatching {
            request("POST", "/rest/v1/customers", accessToken, body.toString())
            localId
        }.getOrElse { error ->
            findCustomerById(accessToken, orgId, localId)
                ?: phone?.let { findCustomerByField(accessToken, orgId, "phone", it) }
                ?: email?.let { findCustomerByField(accessToken, orgId, "email", it) }
                ?: throw error
        }
    }

    /** Same idempotent/merge strategy for products. Barcode wins, then SKU. */
    fun syncOfflineProduct(accessToken: String, envelope: JSONObject): String {
        val localId = envelope.getString("local_id")
        val orgId = envelope.getString("organization_id")
        findProductById(accessToken, orgId, localId)?.let { return it }

        val barcode = envelope.optString("barcode").takeIf { it.isNotBlank() && it != "null" }
        val sku = envelope.optString("sku").takeIf { it.isNotBlank() && it != "null" }
        barcode?.let { findProductByField(accessToken, orgId, "barcode", it, false)?.let { found -> return found } }
        sku?.let { findProductByField(accessToken, orgId, "sku", it, true)?.let { found -> return found } }

        val body = JSONObject().apply {
            put("id", localId)
            put("organization_id", orgId)
            put("name", envelope.getString("name").trim())
            put("selling_price", envelope.optDouble("selling_price", 0.0))
            put("purchase_price", 0)
            put("tax_rate", envelope.optDouble("tax_rate", 0.0))
            put("stock", envelope.optDouble("opening_stock", 0.0))
            put("unit", "pcs")
            put("low_stock_threshold", 5)
            if (sku == null) put("sku", JSONObject.NULL) else put("sku", sku)
            if (barcode == null) put("barcode", JSONObject.NULL) else put("barcode", barcode)
            val createdBy = envelope.optString("created_by").takeIf { it.isNotBlank() && it != "null" }
            if (createdBy == null) put("created_by", JSONObject.NULL) else put("created_by", createdBy)
        }
        return runCatching {
            request("POST", "/rest/v1/products", accessToken, body.toString())
            localId
        }.getOrElse { error ->
            findProductById(accessToken, orgId, localId)
                ?: barcode?.let { findProductByField(accessToken, orgId, "barcode", it, false) }
                ?: sku?.let { findProductByField(accessToken, orgId, "sku", it, true) }
                ?: throw error
        }
    }

    private fun findCustomerById(accessToken: String, organizationId: String, id: String): String? {
        val org = URLEncoder.encode(organizationId, "UTF-8")
        val rid = URLEncoder.encode(id, "UTF-8")
        val rows = JSONArray(request("GET", "/rest/v1/customers?select=id&organization_id=eq.$org&id=eq.$rid&deleted_at=is.null&limit=1", accessToken, null))
        return if (rows.length() > 0) rows.getJSONObject(0).optString("id").takeIf { it.isNotBlank() } else null
    }

    private fun findCustomerByField(accessToken: String, organizationId: String, field: String, value: String): String? {
        val org = URLEncoder.encode(organizationId, "UTF-8")
        val v = URLEncoder.encode(value.trim(), "UTF-8")
        val rows = JSONArray(request("GET", "/rest/v1/customers?select=id&organization_id=eq.$org&$field=eq.$v&active=eq.true&deleted_at=is.null&limit=1", accessToken, null))
        return if (rows.length() > 0) rows.getJSONObject(0).optString("id").takeIf { it.isNotBlank() } else null
    }

    private fun findProductById(accessToken: String, organizationId: String, id: String): String? {
        val org = URLEncoder.encode(organizationId, "UTF-8")
        val rid = URLEncoder.encode(id, "UTF-8")
        val rows = JSONArray(request("GET", "/rest/v1/products?select=id&organization_id=eq.$org&id=eq.$rid&deleted_at=is.null&limit=1", accessToken, null))
        return if (rows.length() > 0) rows.getJSONObject(0).optString("id").takeIf { it.isNotBlank() } else null
    }

    private fun findProductByField(accessToken: String, organizationId: String, field: String, value: String, caseInsensitive: Boolean): String? {
        val org = URLEncoder.encode(organizationId, "UTF-8")
        val v = URLEncoder.encode(value.trim(), "UTF-8")
        val op = if (caseInsensitive) "ilike" else "eq"
        val rows = JSONArray(request("GET", "/rest/v1/products?select=id&organization_id=eq.$org&$field=$op.$v&active=eq.true&deleted_at=is.null&limit=1", accessToken, null))
        return if (rows.length() > 0) rows.getJSONObject(0).optString("id").takeIf { it.isNotBlank() } else null
    }


    fun fetchDueInvoices(accessToken: String, organizationId: String): JSONArray {
        val org = URLEncoder.encode(organizationId, "UTF-8")
        return JSONArray(request(
            "GET",
            "/rest/v1/invoices?select=id,invoice_number,grand_total,amount_paid,amount_due,payment_status,status,customer_id,invoice_date&organization_id=eq.$org&amount_due=gt.0&status=not.in.(CANCELLED,REFUNDED)&order=invoice_date.desc&limit=100",
            accessToken,
            null
        ))
    }

    fun collectInvoicePayment(
        accessToken: String,
        organizationId: String,
        invoiceId: String,
        amount: Double,
        method: String,
        note: String?
    ): JSONArray {
        val body = JSONObject().apply {
            put("p_organization_id", organizationId)
            put("p_invoice_id", invoiceId)
            put("p_amount", amount)
            put("p_method", method)
            if (note.isNullOrBlank()) put("p_note", JSONObject.NULL) else put("p_note", note.trim())
        }
        return JSONArray(request("POST", "/rest/v1/rpc/collect_invoice_payment", accessToken, body.toString()))
    }

    fun adjustProductStock(
        accessToken: String,
        organizationId: String,
        productId: String,
        quantityChange: Double,
        note: String?
    ): JSONArray {
        val body = JSONObject().apply {
            put("p_organization_id", organizationId)
            put("p_product_id", productId)
            put("p_quantity_change", quantityChange)
            if (note.isNullOrBlank()) put("p_note", JSONObject.NULL) else put("p_note", note.trim())
        }
        return JSONArray(request("POST", "/rest/v1/rpc/adjust_product_stock", accessToken, body.toString()))
    }

    fun ownerReportSummary(accessToken: String, organizationId: String, fromIso: String, toIso: String): JSONObject {
        val body = JSONObject().apply {
            put("p_organization_id", organizationId)
            put("p_from", fromIso)
            put("p_to", toIso)
        }
        return JSONObject(request("POST", "/rest/v1/rpc/owner_report_summary", accessToken, body.toString()))
    }

    fun ownerGstReportSummary(accessToken: String, organizationId: String, fromIso: String, toIso: String): JSONObject {
        val body = JSONObject().apply {
            put("p_organization_id", organizationId)
            put("p_from", fromIso)
            put("p_to", toIso)
        }
        return JSONObject(request("POST", "/rest/v1/rpc/owner_gst_report_summary", accessToken, body.toString()))
    }

    fun customerLedger(accessToken: String, organizationId: String, customerId: String): JSONArray {
        val body = JSONObject().apply {
            put("p_organization_id", organizationId)
            put("p_customer_id", customerId)
        }
        return JSONArray(request("POST", "/rest/v1/rpc/get_customer_ledger", accessToken, body.toString()))
    }

    private fun request(method: String, path: String, bearer: String?, body: String?): String {
        val connection = (URL(baseUrl + path).openConnection() as HttpURLConnection).apply {
            requestMethod = method
            connectTimeout = 12_000
            readTimeout = 20_000
            setRequestProperty("apikey", anonKey)
            setRequestProperty("Accept", "application/json")
            if (!bearer.isNullOrBlank()) setRequestProperty("Authorization", "Bearer $bearer")
            if (body != null) {
                doOutput = true
                setRequestProperty("Content-Type", "application/json")
                outputStream.use { it.write(body.toByteArray(Charsets.UTF_8)) }
            }
        }

        val status = connection.responseCode
        val stream = if (status in 200..299) connection.inputStream else connection.errorStream
        val text = stream?.bufferedReader()?.use(BufferedReader::readText).orEmpty()
        connection.disconnect()
        if (status !in 200..299) {
            val message = runCatching {
                val json = JSONObject(text)
                json.optString("message").ifBlank { json.optString("details") }.ifBlank { json.optString("hint") }
            }.getOrNull().orEmpty()
            throw IllegalStateException(message.ifBlank { "Request failed ($status): $text" })
        }
        return text.ifBlank { "[]" }
    }
}
