package com.brandspire.pos.sync

import android.content.Context
import androidx.work.CoroutineWorker
import androidx.work.WorkerParameters
import com.brandspire.pos.alerts.AlertEngine
import com.brandspire.pos.auth.SecureSessionStore
import com.brandspire.pos.auth.WorkspaceCache
import com.brandspire.pos.data.OfflineDatabase
import com.brandspire.pos.network.SupabaseHttpClient
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import java.time.Instant

/**
 * Unified mobile sync worker.
 * Order matters: customer/product records must exist before queued invoices that reference them.
 */
class InvoiceSyncWorker(appContext: Context, params: WorkerParameters) : CoroutineWorker(appContext, params) {
    override suspend fun doWork(): Result = withContext(Dispatchers.IO) {
        if (!applicationContext.isOnline()) return@withContext Result.retry()

        val store = SecureSessionStore(applicationContext)
        var session = store.read() ?: return@withContext Result.failure()
        val api = SupabaseHttpClient()
        if (session.expiresAtEpochSeconds <= Instant.now().epochSecond + 60) {
            session = runCatching { api.refresh(session.refreshToken) }.getOrElse { return@withContext Result.retry() }
            store.save(session)
        }

        val db = OfflineDatabase(applicationContext)
        var hadFailure = false

        db.pendingCustomers().forEach { row ->
            val id = row.getString("local_id")
            db.markCustomerSyncing(id)
            runCatching { api.syncOfflineCustomer(session.accessToken, row) }
                .onSuccess { serverId -> db.resolveCustomerSync(id, serverId) }
                .onFailure { error ->
                    hadFailure = true
                    db.markCustomerFailed(id, error.message ?: "Customer sync failed")
                }
        }

        db.pendingProducts().forEach { row ->
            val id = row.getString("local_id")
            db.markProductSyncing(id)
            runCatching { api.syncOfflineProduct(session.accessToken, row) }
                .onSuccess { serverId -> db.resolveProductSync(id, serverId) }
                .onFailure { error ->
                    hadFailure = true
                    db.markProductFailed(id, error.message ?: "Product sync failed")
                }
        }

        // Avoid sending invoices while an offline-created entity is unresolved.
        if (db.pendingCustomerCount() == 0 && db.pendingProductCount() == 0) {
            db.pendingInvoices().forEach { envelope ->
                val id = envelope.getString("client_invoice_id")
                db.markInvoiceSyncing(id)
                runCatching { api.syncInvoice(session.accessToken, envelope) }
                    .onSuccess { response ->
                        val row = if (response.length() > 0) response.optJSONObject(0) else null
                        db.markLocalBillSynced(
                            id,
                            row?.optString("invoice_id")?.takeIf { it.isNotBlank() && it != "null" },
                            row?.optString("invoice_number")?.takeIf { it.isNotBlank() && it != "null" }
                        )
                        db.markSynced(id)
                    }
                    .onFailure { error ->
                        hadFailure = true
                        db.markFailed(id, error.message ?: "Invoice sync failed")
                    }
            }
        } else {
            hadFailure = true
        }

        // Server refresh is best effort; local pending rows are preserved by cache methods.
        runCatching {
            val workspace = api.getWorkspace(session.accessToken)
            WorkspaceCache(applicationContext).save(workspace)
            db.cacheProducts(workspace.organizationId, api.fetchProducts(session.accessToken, workspace.organizationId))
            db.cacheCustomers(workspace.organizationId, api.fetchCustomers(session.accessToken, workspace.organizationId))
            AlertEngine.publishSystemSummary(applicationContext, workspace)
        }.onFailure {
            WorkspaceCache(applicationContext).read()?.let { AlertEngine.publishSystemSummary(applicationContext, it) }
        }

        if (hadFailure) Result.retry() else Result.success()
    }
}
