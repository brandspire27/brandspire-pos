package com.brandspire.pos.auth

import android.content.Context

class WorkspaceCache(context: Context) {
    private val prefs = context.getSharedPreferences("brandspire_workspace_cache", Context.MODE_PRIVATE)

    fun save(workspace: Workspace) {
        prefs.edit()
            .putString("organization_id", workspace.organizationId)
            .putString("organization_name", workspace.organizationName)
            .putString("role", workspace.role)
            .putString("preferred_language", workspace.preferredLanguage)
            .putString("subscription_status", workspace.subscriptionStatus)
            .putString("ends_at", workspace.endsAt)
            .putString("admin_message", workspace.adminMessage)
            .apply()
    }

    fun read(): Workspace? {
        val organizationId = prefs.getString("organization_id", null) ?: return null
        return Workspace(
            organizationId = organizationId,
            organizationName = prefs.getString("organization_name", "Brandspire POS") ?: "Brandspire POS",
            role = prefs.getString("role", "STAFF") ?: "STAFF",
            preferredLanguage = prefs.getString("preferred_language", "en") ?: "en",
            subscriptionStatus = prefs.getString("subscription_status", "OFFLINE_CACHED") ?: "OFFLINE_CACHED",
            endsAt = prefs.getString("ends_at", null),
            adminMessage = prefs.getString("admin_message", null)
        )
    }

    fun clear() = prefs.edit().clear().apply()
}
