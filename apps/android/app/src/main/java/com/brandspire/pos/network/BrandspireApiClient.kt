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

class BrandspireApiClient {
    private val baseUrl = BuildConfig.API_BASE_URL.trimEnd('/')
    private val firebaseApiKey = BuildConfig.FIREBASE_API_KEY

    fun isConfigured(): Boolean =
        (baseUrl.startsWith("https://") || baseUrl.startsWith("http://10.0.2.2")) && firebaseApiKey.isNotBlank()

    fun signIn(email: String, password: String): AuthSession {
        require(isConfigured()) { "Firebase or Brandspire API configuration is missing" }
        val response = request(
            method = "POST",
            path = "https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=$firebaseApiKey",
            bearer = null,
            body = JSONObject().put("email", email.trim()).put("password", password).put("returnSecureToken", true).toString(),
            absoluteUrl = true
        )
        return response.toAuthSession()
    }

    fun refresh(refreshToken: String): AuthSession {
        val body = "grant_type=refresh_token&refresh_token=${URLEncoder.encode(refreshToken, "UTF-8")}"
        val response = request(
            method = "POST",
            path = "https://securetoken.googleapis.com/v1/token?key=$firebaseApiKey",
            bearer = null,
            body = body,
            contentType = "application/x-www-form-urlencoded",
            absoluteUrl = true
        )
        return response.toAuthSession()
    }

    fun getWorkspace(accessToken: String): Workspace {
        val routeResponse = JSONObject(request("GET", "/api/auth/route", accessToken, null))
        val route = routeResponse.getJSONObject("data").getString("route")
        require(route == "/owner" || route == "/staff") { "No active Brandspire POS workspace found for this account" }
        val response = JSONObject(request("GET", "/api/pos/workspace", accessToken, null))
        val row = response.optJSONObject("data") ?: error("No active Brandspire POS workspace found for this account")
        return Workspace(
            organizationId = row.getString("organizationId"),
            organizationName = row.optString("organizationName", "Brandspire POS"),
            role = row.optString("role", if (route == "/owner") "OWNER" else "STAFF"),
            preferredLanguage = row.optString("preferredLanguage", "en"),
            subscriptionStatus = row.optString("subscriptionStatus", "PENDING_APPROVAL"),
            endsAt = row.optString("endsAt").takeIf { it.isNotBlank() && it != "null" },
            adminMessage = row.optString("adminMessage").takeIf { it.isNotBlank() && it != "null" }
        )
    }

    fun fetchProducts(accessToken: String, organizationId: String): JSONArray =
        dataArray(request("GET", "/api/pos/products?active=true&limit=2000", accessToken, null))

    fun fetchCustomers(accessToken: String, organizationId: String): JSONArray =
        dataArray(request("GET", "/api/pos/customers?active=true&limit=2000", accessToken, null))

    fun fetchInvoices(accessToken: String, organizationId: String): JSONArray =
        dataArray(request("GET", "/api/pos/invoices?limit=50", accessToken, null))

    fun createCustomer(
        accessToken: String,
        organizationId: String,
        userId: String,
        name: String,
        phone: String?,
        email: String?
    ) {
        val body = JSONObject().put("name", name.trim())
        if (phone.isNullOrBlank()) body.put("phone", JSONObject.NULL) else body.put("phone", phone.trim())
        if (email.isNullOrBlank()) body.put("email", JSONObject.NULL) else body.put("email", email.trim())
        request("POST", "/api/pos/customers", accessToken, body.toString())
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
            put("name", name.trim())
            put("selling_price", sellingPrice)
            put("purchase_price", 0)
            put("tax_rate", taxRate)
            put("stock", openingStock)
            put("unit", "pcs")
            put("low_stock_threshold", 5)
            if (sku.isNullOrBlank()) put("sku", JSONObject.NULL) else put("sku", sku.trim())
            if (barcode.isNullOrBlank()) put("barcode", JSONObject.NULL) else put("barcode", barcode.trim())
        }
        request("POST", "/api/pos/products", accessToken, body.toString())
    }

    fun syncInvoice(accessToken: String, envelope: JSONObject): JSONArray {
        val payload = envelope.getJSONObject("payload")
        val items = JSONArray()
        val sourceItems = payload.getJSONArray("items")
        for (index in 0 until sourceItems.length()) {
            val item = sourceItems.getJSONObject(index)
            items.put(JSONObject().put("productId", item.optString("product_id", item.optString("productId")))
                .put("quantity", item.getDouble("quantity")))
        }
        val body = JSONObject()
            .put("customerId", payload.opt("customer_id") ?: JSONObject.NULL)
            .put("items", items)
            .put("discountType", payload.optString("discount_type", "PERCENT"))
            .put("discountValue", payload.optDouble("discount_value", 0.0))
            .put("paymentMethod", payload.optString("payment_method", "CASH"))
            .put("clientInvoiceId", envelope.getString("client_invoice_id"))
        if (payload.has("amount_paid") && !payload.isNull("amount_paid")) {
            body.put("amountPaid", payload.getDouble("amount_paid"))
        } else {
            body.put("amountPaid", JSONObject.NULL)
        }
        val data = JSONObject(request("POST", "/api/pos/invoices", accessToken, body.toString())).getJSONObject("data")
        return JSONArray().put(data)
    }

    fun syncOfflineCustomer(accessToken: String, envelope: JSONObject): String {
        val localId = envelope.getString("local_id")
        val name = envelope.optString("name")
        val phone = envelope.optString("phone").takeIf { it.isNotBlank() && it != "null" }
        val email = envelope.optString("email").takeIf { it.isNotBlank() && it != "null" }
        val body = JSONObject().put("id", localId).put("name", name)
        if (phone == null) body.put("phone", JSONObject.NULL) else body.put("phone", phone)
        if (email == null) body.put("email", JSONObject.NULL) else body.put("email", email)
        return runCatching {
            val result = JSONObject(request("POST", "/api/pos/customers", accessToken, body.toString()))
            result.getJSONObject("data").getString("id")
        }.getOrElse { error ->
            findCustomer(accessToken, localId)
                ?: phone?.let { findCustomer(accessToken, it) }
                ?: email?.let { findCustomer(accessToken, it) }
                ?: throw error
        }
    }

    fun syncOfflineProduct(accessToken: String, envelope: JSONObject): String {
        val localId = envelope.getString("local_id")
        val name = envelope.getString("name").trim()
        val barcode = envelope.optString("barcode").takeIf { it.isNotBlank() && it != "null" }
        val sku = envelope.optString("sku").takeIf { it.isNotBlank() && it != "null" }
        val body = JSONObject().apply {
            put("id", localId)
            put("name", name)
            put("selling_price", envelope.optDouble("selling_price", 0.0))
            put("purchase_price", 0)
            put("tax_rate", envelope.optDouble("tax_rate", 0.0))
            put("stock", envelope.optDouble("opening_stock", 0.0))
            put("unit", "pcs")
            put("low_stock_threshold", 5)
            if (sku == null) put("sku", JSONObject.NULL) else put("sku", sku)
            if (barcode == null) put("barcode", JSONObject.NULL) else put("barcode", barcode)
        }
        return runCatching {
            val result = JSONObject(request("POST", "/api/pos/products", accessToken, body.toString()))
            result.getJSONObject("data").getString("id")
        }.getOrElse { error ->
            findProduct(accessToken, localId)
                ?: barcode?.let { findProduct(accessToken, it) }
                ?: sku?.let { findProduct(accessToken, it) }
                ?: throw error
        }
    }

    fun fetchDueInvoices(accessToken: String, organizationId: String): JSONArray =
        dataArray(request("GET", "/api/pos/invoices?due=true&limit=100", accessToken, null))

    fun collectInvoicePayment(
        accessToken: String,
        organizationId: String,
        invoiceId: String,
        amount: Double,
        method: String,
        note: String?
    ): JSONArray {
        val body = JSONObject().put("amount", amount).put("method", method)
        if (note.isNullOrBlank()) body.put("note", JSONObject.NULL) else body.put("note", note.trim())
        val data = JSONObject(request("POST", "/api/pos/invoices/${encodePath(invoiceId)}/payments", accessToken, body.toString()))
            .optJSONObject("data")
        return JSONArray().put(data ?: JSONObject())
    }

    fun adjustProductStock(
        accessToken: String,
        organizationId: String,
        productId: String,
        quantityChange: Double,
        note: String?
    ): JSONArray {
        val body = JSONObject().put("quantityChange", quantityChange)
        if (note.isNullOrBlank()) body.put("note", JSONObject.NULL) else body.put("note", note.trim())
        val data = JSONObject(request("POST", "/api/pos/products/${encodePath(productId)}/adjust-stock", accessToken, body.toString()))
            .optJSONObject("data")
        return JSONArray().put(data ?: JSONObject())
    }

    fun ownerReportSummary(accessToken: String, organizationId: String, fromIso: String, toIso: String): JSONObject =
        JSONObject(request("GET", "/api/pos/reports/summary?from=${encodeQuery(fromIso)}&to=${encodeQuery(toIso)}", accessToken, null))
            .getJSONObject("data")

    fun ownerGstReportSummary(accessToken: String, organizationId: String, fromIso: String, toIso: String): JSONObject =
        JSONObject(request("GET", "/api/pos/reports/gst-summary?from=${encodeQuery(fromIso)}&to=${encodeQuery(toIso)}", accessToken, null))
            .getJSONObject("data")

    fun customerLedger(accessToken: String, organizationId: String, customerId: String): JSONArray {
        val data = JSONObject(request("GET", "/api/pos/customers/${encodePath(customerId)}/ledger", accessToken, null))
            .getJSONObject("data")
        return data.optJSONArray("events") ?: JSONArray()
    }

    private fun findCustomer(accessToken: String, value: String): String? {
        val rows = dataArray(request("GET", "/api/pos/customers?q=${encodeQuery(value)}&limit=2000", accessToken, null))
        for (index in 0 until rows.length()) {
            val row = rows.getJSONObject(index)
            if (row.optString("id") == value || row.optString("phone") == value || row.optString("email").equals(value, true)) {
                return row.optString("id").takeIf { it.isNotBlank() }
            }
        }
        return null
    }

    private fun findProduct(accessToken: String, value: String): String? {
        val rows = dataArray(request("GET", "/api/pos/products?q=${encodeQuery(value)}&limit=2000", accessToken, null))
        for (index in 0 until rows.length()) {
            val row = rows.getJSONObject(index)
            if (row.optString("id") == value || row.optString("barcode") == value || row.optString("sku").equals(value, true)) {
                return row.optString("id").takeIf { it.isNotBlank() }
            }
        }
        return null
    }

    private fun dataArray(response: String): JSONArray =
        JSONObject(response).optJSONArray("data") ?: error("Brandspire API returned an invalid list response")

    private fun String.toAuthSession(): AuthSession {
        val json = JSONObject(this)
        return AuthSession(
            accessToken = json.getString("id_token"),
            refreshToken = json.getString("refresh_token"),
            expiresAtEpochSeconds = Instant.now().epochSecond + json.optLong("expires_in", 3600),
            userId = json.optString("localId", json.optString("user_id")),
            email = json.optString("email", json.optString("user_email"))
        )
    }

    private fun encodeQuery(value: String): String = URLEncoder.encode(value, "UTF-8")
    private fun encodePath(value: String): String = URLEncoder.encode(value, "UTF-8")

    private fun request(
        method: String,
        path: String,
        bearer: String?,
        body: String?,
        contentType: String = "application/json",
        absoluteUrl: Boolean = false
    ): String {
        val url = if (absoluteUrl) path else "$baseUrl$path"
        val connection = (URL(url).openConnection() as HttpURLConnection).apply {
            requestMethod = method
            connectTimeout = 12_000
            readTimeout = 20_000
            setRequestProperty("Accept", "application/json")
            if (!bearer.isNullOrBlank()) setRequestProperty("Authorization", "Bearer $bearer")
            if (body != null) {
                doOutput = true
                setRequestProperty("Content-Type", contentType)
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
                val rawMessage = json.opt("message")
                when (rawMessage) {
                    is JSONArray -> rawMessage.join(", ")
                    is String -> rawMessage
                    else -> json.optJSONObject("error")?.optString("message") ?: json.optString("error")
                }
            }.getOrNull().orEmpty()
            throw IllegalStateException(message.ifBlank { "Request failed ($status): $text" })
        }
        return text.ifBlank { "{}" }
    }
}
