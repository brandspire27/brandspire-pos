package com.brandspire.pos.network

import android.content.Context
import org.json.JSONObject
import java.net.HttpURLConnection
import java.net.URLEncoder
import java.net.URL

data class BarcodeProductInfo(
    val barcode: String,
    val productName: String,
    val brand: String?,
    val category: String?,
    val imageUrl: String?,
    val source: String
) {
    val displayName: String
        get() = when {
            brand.isNullOrBlank() -> productName
            productName.startsWith(brand, ignoreCase = true) -> productName
            else -> "$brand $productName"
        }
}

data class BarcodeLookupOutcome(
    val product: BarcodeProductInfo?,
    val fromCache: Boolean = false,
    val error: String? = null
)

/**
 * Smart public barcode lookup for Brandspire POS.
 *
 * Lookup order:
 * 1) Local SharedPreferences cache (works offline after a previous successful lookup)
 * 2) Open Food Facts v3 with product_type=all
 * 3) Open Food / Beauty / Products Facts v2 fallback endpoints
 *
 * Selling price, GST and stock are intentionally NOT trusted from third-party data.
 * The cashier/owner must confirm those business values before saving a product.
 */
object SmartBarcodeLookup {
    private const val PREFS = "brandspire_smart_barcode_cache_v1"
    private const val USER_AGENT = "BrandspirePOS-Android/1.0 (https://brandspire.tech)"

    fun lookup(context: Context, rawBarcode: String, allowNetwork: Boolean = true): BarcodeLookupOutcome {
        val barcode = normalize(rawBarcode)
        if (barcode.isBlank()) return BarcodeLookupOutcome(null, error = "Invalid barcode")

        readCache(context, barcode)?.let {
            return BarcodeLookupOutcome(it, fromCache = true)
        }
        if (!allowNetwork) return BarcodeLookupOutcome(null)

        var lastError: String? = null
        val attempts = listOf(
            "https://world.openfoodfacts.org/api/v3/product/${encode(barcode)}?product_type=all&fields=code,product_name,product_name_en,generic_name,brands,categories,image_front_url" to "Open Facts",
            "https://world.openfoodfacts.org/api/v2/product/${encode(barcode)}.json?fields=code,product_name,product_name_en,generic_name,brands,categories,image_front_url" to "Open Food Facts",
            "https://world.openbeautyfacts.org/api/v2/product/${encode(barcode)}.json?fields=code,product_name,product_name_en,generic_name,brands,categories,image_front_url" to "Open Beauty Facts",
            "https://world.openproductsfacts.org/api/v2/product/${encode(barcode)}.json?fields=code,product_name,product_name_en,generic_name,brands,categories,image_front_url" to "Open Products Facts"
        )

        for ((url, fallbackSource) in attempts) {
            try {
                val json = getJson(url)
                val productJson = json.optJSONObject("product") ?: continue
                val info = parseProduct(barcode, productJson, fallbackSource) ?: continue
                saveCache(context, info)
                return BarcodeLookupOutcome(info)
            } catch (error: Exception) {
                lastError = error.message
            }
        }
        return BarcodeLookupOutcome(null, error = lastError)
    }

    private fun normalize(value: String): String = value.trim().replace(" ", "")

    private fun encode(value: String): String = URLEncoder.encode(value, "UTF-8")

    private fun parseProduct(barcode: String, p: JSONObject, source: String): BarcodeProductInfo? {
        val name = sequenceOf(
            p.optString("product_name"),
            p.optString("product_name_en"),
            p.optString("generic_name")
        ).map { it.trim() }.firstOrNull { it.isNotBlank() && it != "null" } ?: return null

        val brand = p.optString("brands").trim().takeIf { it.isNotBlank() && it != "null" }
            ?.split(',')?.firstOrNull()?.trim()?.takeIf { it.isNotBlank() }
        val category = p.optString("categories").trim().takeIf { it.isNotBlank() && it != "null" }
            ?.split(',')?.firstOrNull()?.trim()?.takeIf { it.isNotBlank() }
        val image = p.optString("image_front_url").trim().takeIf { it.startsWith("https://") }

        return BarcodeProductInfo(
            barcode = barcode,
            productName = name,
            brand = brand,
            category = category,
            imageUrl = image,
            source = source
        )
    }

    private fun getJson(url: String): JSONObject {
        val connection = (URL(url).openConnection() as HttpURLConnection).apply {
            requestMethod = "GET"
            connectTimeout = 7_000
            readTimeout = 10_000
            instanceFollowRedirects = true
            setRequestProperty("Accept", "application/json")
            setRequestProperty("User-Agent", USER_AGENT)
        }
        try {
            val status = connection.responseCode
            if (status == 404) return JSONObject()
            if (status !in 200..299) throw IllegalStateException("Lookup failed ($status)")
            val body = connection.inputStream.bufferedReader().use { it.readText() }
            return JSONObject(body)
        } finally {
            connection.disconnect()
        }
    }

    private fun saveCache(context: Context, info: BarcodeProductInfo) {
        val json = JSONObject().apply {
            put("barcode", info.barcode)
            put("product_name", info.productName)
            put("brand", info.brand ?: JSONObject.NULL)
            put("category", info.category ?: JSONObject.NULL)
            put("image_url", info.imageUrl ?: JSONObject.NULL)
            put("source", info.source)
        }
        context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
            .edit()
            .putString(info.barcode, json.toString())
            .apply()
    }

    private fun readCache(context: Context, barcode: String): BarcodeProductInfo? {
        val raw = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE).getString(barcode, null) ?: return null
        return runCatching {
            val json = JSONObject(raw)
            BarcodeProductInfo(
                barcode = barcode,
                productName = json.getString("product_name"),
                brand = json.optString("brand").takeIf { it.isNotBlank() && it != "null" },
                category = json.optString("category").takeIf { it.isNotBlank() && it != "null" },
                imageUrl = json.optString("image_url").takeIf { it.startsWith("https://") },
                source = json.optString("source", "Cached lookup")
            )
        }.getOrNull()
    }
}
