package com.brandspire.pos.ui

import android.app.Activity
import android.app.AlertDialog
import android.content.Intent
import android.net.Uri
import com.brandspire.pos.BuildConfig
import com.brandspire.pos.network.ReleasePolicy

object ReleaseGate {
    fun show(activity: Activity, policy: ReleasePolicy) {
        val current = BuildConfig.VERSION_CODE

        if (current < policy.minVersionCode) {
            val message = buildString {
                append("A newer Brandspire POS version is required for safe cloud sync.")
                if (policy.latestVersionName.isNotBlank()) append("\n\nLatest version: ${policy.latestVersionName}")
                if (policy.updateUrl.isNullOrBlank()) append("\n\nPlease contact the Brandspire Team for the latest APK.")
            }
            val dialog = AlertDialog.Builder(activity)
                .setTitle("Update required")
                .setMessage(message)
                .setCancelable(false)
            if (!policy.updateUrl.isNullOrBlank()) {
                dialog.setPositiveButton("Update") { _, _ ->
                    runCatching { activity.startActivity(Intent(Intent.ACTION_VIEW, Uri.parse(policy.updateUrl))) }
                }
                dialog.setNegativeButton("Use offline") { _, _ -> }
            } else {
                dialog.setPositiveButton("Continue offline") { _, _ -> }
            }
            dialog.show()
            return
        }

        if (policy.maintenanceMode == "blocking" || policy.maintenanceMode == "warning") {
            AlertDialog.Builder(activity)
                .setTitle(if (policy.maintenanceMode == "blocking") "Cloud maintenance" else "Service notice")
                .setMessage(policy.maintenanceMessage)
                .setPositiveButton("OK", null)
                .show()
            return
        }

        if (current < policy.recommendedVersionCode) {
            val dialog = AlertDialog.Builder(activity)
                .setTitle("Update available")
                .setMessage("Brandspire POS ${policy.latestVersionName.ifBlank { "new version" }} is available. Your current app can continue, but updating is recommended.")
                .setNegativeButton("Later", null)
            if (!policy.updateUrl.isNullOrBlank()) {
                dialog.setPositiveButton("Update") { _, _ ->
                    runCatching { activity.startActivity(Intent(Intent.ACTION_VIEW, Uri.parse(policy.updateUrl))) }
                }
            } else {
                dialog.setPositiveButton("OK", null)
            }
            dialog.show()
        }
    }
}
