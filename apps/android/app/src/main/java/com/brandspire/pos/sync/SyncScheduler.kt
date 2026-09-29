package com.brandspire.pos.sync

import android.content.Context
import androidx.work.Constraints
import androidx.work.ExistingPeriodicWorkPolicy
import androidx.work.ExistingWorkPolicy
import androidx.work.NetworkType
import androidx.work.OneTimeWorkRequestBuilder
import androidx.work.PeriodicWorkRequestBuilder
import androidx.work.WorkManager
import java.util.concurrent.TimeUnit

object SyncScheduler {
    private val online = Constraints.Builder().setRequiredNetworkType(NetworkType.CONNECTED).build()

    fun schedulePeriodic(context: Context) {
        val request = PeriodicWorkRequestBuilder<InvoiceSyncWorker>(15, TimeUnit.MINUTES)
            .setConstraints(online)
            .build()
        WorkManager.getInstance(context).enqueueUniquePeriodicWork(
            "brandspire_invoice_sync",
            ExistingPeriodicWorkPolicy.UPDATE,
            request
        )
    }

    fun syncNow(context: Context) {
        val request = OneTimeWorkRequestBuilder<InvoiceSyncWorker>().setConstraints(online).build()
        WorkManager.getInstance(context).enqueueUniqueWork(
            "brandspire_invoice_sync_now",
            ExistingWorkPolicy.REPLACE,
            request
        )
    }
}
