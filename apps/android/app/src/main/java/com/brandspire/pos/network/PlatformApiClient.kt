package com.brandspire.pos.network

import com.brandspire.pos.BuildConfig
import org.json.JSONObject
import java.net.HttpURLConnection
import java.net.URL

data class ReleasePolicy(
    val maintenanceMode: String,
    val maintenanceMessage: String,
    val minVersionCode: Int,
    val recommendedVersionCode: Int,
    val latestVersionName: String,
    val updateUrl: String?
)

class PlatformApiClient {
    fun fetchReleasePolicy(): ReleasePolicy {
        val base = BuildConfig.API_BASE_URL.trimEnd('/')
        val connection = (URL("$base/api/health/release").openConnection() as HttpURLConnection).apply {
            requestMethod = "GET"
            connectTimeout = 3500
            readTimeout = 3500
            setRequestProperty("Accept", "application/json")
        }
        try {
            val code = connection.responseCode
            val stream = if (code in 200..299) connection.inputStream else connection.errorStream
            val body = stream?.bufferedReader()?.use { it.readText() }.orEmpty()
            if (code !in 200..299) error("Release check failed ($code)")
            val json = JSONObject(body)
            val maintenance = json.optJSONObject("maintenance") ?: JSONObject()
            val android = json.optJSONObject("android") ?: JSONObject()
            return ReleasePolicy(
                maintenanceMode = maintenance.optString("mode", "off"),
                maintenanceMessage = maintenance.optString("message", "Brandspire POS cloud services are under maintenance."),
                minVersionCode = android.optInt("minVersionCode", 1),
                recommendedVersionCode = android.optInt("recommendedVersionCode", 1),
                latestVersionName = android.optString("latestVersionName", ""),
                updateUrl = android.optString("updateUrl").takeIf { it.isNotBlank() && it != "null" }
            )
        } finally {
            connection.disconnect()
        }
    }
}
