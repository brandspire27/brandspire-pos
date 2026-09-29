package com.brandspire.pos.sync

import android.content.Context
import org.json.JSONArray
import org.json.JSONObject
import java.util.UUID

/**
 * Lightweight Phase 8 durable queue foundation.
 * It does not claim full offline billing yet. Pending bill envelopes are stored locally
 * with a client-generated UUID so the later sync API can be idempotent.
 */
class OfflineQueueStore(context: Context) {
    private val prefs = context.getSharedPreferences("brandspire_offline_queue", Context.MODE_PRIVATE)

    fun enqueueDraft(payload: JSONObject): String {
        val clientId = UUID.randomUUID().toString()
        val items = readArray()
        items.put(JSONObject().apply {
            put("client_invoice_id", clientId)
            put("status", "PENDING_SYNC")
            put("created_at", System.currentTimeMillis())
            put("payload", payload)
        })
        prefs.edit().putString("queue", items.toString()).apply()
        return clientId
    }

    fun pendingCount(): Int = readArray().length()

    fun clearForDevelopment() {
        prefs.edit().remove("queue").apply()
    }

    private fun readArray(): JSONArray {
        return try { JSONArray(prefs.getString("queue", "[]") ?: "[]") } catch (_: Exception) { JSONArray() }
    }
}
