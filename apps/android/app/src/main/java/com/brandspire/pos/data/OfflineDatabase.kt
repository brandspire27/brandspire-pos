package com.brandspire.pos.data

import android.content.ContentValues
import android.content.Context
import android.database.Cursor
import android.database.sqlite.SQLiteDatabase
import android.database.sqlite.SQLiteOpenHelper
import org.json.JSONArray
import org.json.JSONObject
import java.util.UUID

data class CachedProduct(
    val id: String,
    val name: String,
    val sku: String?,
    val barcode: String?,
    val sellingPrice: Double,
    val taxRate: Double,
    val stock: Double,
    val pendingSync: Boolean = false
)

data class CachedCustomer(
    val id: String,
    val name: String,
    val phone: String?,
    val email: String?,
    val outstandingBalance: Double,
    val pendingSync: Boolean = false
)

data class LocalBillRecord(
    val clientInvoiceId: String,
    val organizationId: String,
    val receiptJson: JSONObject,
    val total: Double,
    val paymentMethod: String,
    val syncStatus: String,
    val serverInvoiceId: String?,
    val serverInvoiceNumber: String?,
    val createdAt: Long
)

data class PendingSyncRecord(
    val kind: String,
    val id: String,
    val title: String,
    val status: String,
    val attemptCount: Int,
    val lastError: String?,
    val createdAt: Long
)

data class PrintJobRecord(
    val id: Long,
    val clientInvoiceId: String,
    val status: String,
    val attemptCount: Int,
    val lastError: String?,
    val createdAt: Long
)

/**
 * Device-side source of truth for offline counter work.
 *
 * v3: pending customers/products + local_pending flags.
 * v4: failed print queue.
 */
class OfflineDatabase(context: Context) : SQLiteOpenHelper(context, "brandspire_pos_offline.db", null, 4) {
    override fun onCreate(db: SQLiteDatabase) {
        createPendingInvoices(db)
        createCachedProducts(db)
        createCachedCustomers(db)
        createLocalBills(db)
        createPendingCustomers(db)
        createPendingProducts(db)
        createPrintJobs(db)
    }

    override fun onUpgrade(db: SQLiteDatabase, oldVersion: Int, newVersion: Int) {
        if (oldVersion < 2) createLocalBills(db)
        if (oldVersion < 3) {
            runCatching { db.execSQL("alter table cached_products add column local_pending integer not null default 0") }
            runCatching { db.execSQL("alter table cached_customers add column local_pending integer not null default 0") }
            createPendingCustomers(db)
            createPendingProducts(db)
        }
        if (oldVersion < 4) createPrintJobs(db)
    }

    private fun createPendingInvoices(db: SQLiteDatabase) {
        db.execSQL("""
            create table if not exists pending_invoices (
              client_invoice_id text primary key,
              payload_json text not null,
              status text not null default 'PENDING_SYNC',
              created_at integer not null,
              attempt_count integer not null default 0,
              last_error text
            )
        """.trimIndent())
    }

    private fun createCachedProducts(db: SQLiteDatabase) {
        db.execSQL("""
            create table if not exists cached_products (
              id text primary key,
              organization_id text not null,
              name text not null,
              sku text,
              barcode text,
              selling_price real not null default 0,
              tax_rate real not null default 0,
              stock real not null default 0,
              updated_at integer not null,
              local_pending integer not null default 0
            )
        """.trimIndent())
        db.execSQL("create index if not exists idx_cached_products_org on cached_products(organization_id, name)")
    }

    private fun createCachedCustomers(db: SQLiteDatabase) {
        db.execSQL("""
            create table if not exists cached_customers (
              id text primary key,
              organization_id text not null,
              name text not null,
              phone text,
              email text,
              outstanding_balance real not null default 0,
              updated_at integer not null,
              local_pending integer not null default 0
            )
        """.trimIndent())
        db.execSQL("create index if not exists idx_cached_customers_org on cached_customers(organization_id, name)")
    }

    private fun createLocalBills(db: SQLiteDatabase) {
        db.execSQL("""
            create table if not exists local_bills (
              client_invoice_id text primary key,
              organization_id text not null,
              receipt_json text not null,
              total real not null default 0,
              payment_method text not null,
              sync_status text not null default 'PENDING_SYNC',
              server_invoice_id text,
              server_invoice_number text,
              created_at integer not null
            )
        """.trimIndent())
        db.execSQL("create index if not exists idx_local_bills_org_created on local_bills(organization_id, created_at desc)")
    }

    private fun createPendingCustomers(db: SQLiteDatabase) {
        db.execSQL("""
            create table if not exists pending_customers (
              local_id text primary key,
              organization_id text not null,
              name text not null,
              phone text,
              email text,
              created_by text,
              status text not null default 'PENDING_SYNC',
              attempt_count integer not null default 0,
              last_error text,
              created_at integer not null
            )
        """.trimIndent())
        db.execSQL("create index if not exists idx_pending_customers_org on pending_customers(organization_id, created_at)")
    }

    private fun createPendingProducts(db: SQLiteDatabase) {
        db.execSQL("""
            create table if not exists pending_products (
              local_id text primary key,
              organization_id text not null,
              name text not null,
              selling_price real not null,
              tax_rate real not null default 0,
              opening_stock real not null default 0,
              sku text,
              barcode text,
              created_by text,
              status text not null default 'PENDING_SYNC',
              attempt_count integer not null default 0,
              last_error text,
              created_at integer not null
            )
        """.trimIndent())
        db.execSQL("create index if not exists idx_pending_products_org on pending_products(organization_id, created_at)")
    }

    private fun createPrintJobs(db: SQLiteDatabase) {
        db.execSQL("""
            create table if not exists print_jobs (
              id integer primary key autoincrement,
              client_invoice_id text not null unique,
              status text not null default 'PENDING_PRINT',
              attempt_count integer not null default 0,
              last_error text,
              created_at integer not null
            )
        """.trimIndent())
    }

    fun cacheProducts(organizationId: String, rows: JSONArray) {
        val db = writableDatabase
        db.beginTransaction()
        try {
            db.delete("cached_products", "organization_id=? and local_pending=0", arrayOf(organizationId))
            repeat(rows.length()) { index ->
                val row = rows.getJSONObject(index)
                db.insertWithOnConflict("cached_products", null, ContentValues().apply {
                    put("id", row.getString("id")); put("organization_id", organizationId)
                    put("name", row.optString("name")); putNullable("sku", row.optString("sku")); putNullable("barcode", row.optString("barcode"))
                    put("selling_price", row.optDouble("selling_price", 0.0)); put("tax_rate", row.optDouble("tax_rate", 0.0))
                    put("stock", row.optDouble("stock", 0.0)); put("updated_at", System.currentTimeMillis()); put("local_pending", 0)
                }, SQLiteDatabase.CONFLICT_REPLACE)
            }
            db.setTransactionSuccessful()
        } finally { db.endTransaction() }
    }

    fun cacheCustomers(organizationId: String, rows: JSONArray) {
        val db = writableDatabase
        db.beginTransaction()
        try {
            db.delete("cached_customers", "organization_id=? and local_pending=0", arrayOf(organizationId))
            repeat(rows.length()) { index ->
                val row = rows.getJSONObject(index)
                db.insertWithOnConflict("cached_customers", null, ContentValues().apply {
                    put("id", row.getString("id")); put("organization_id", organizationId); put("name", row.optString("name"))
                    putNullable("phone", row.optString("phone")); putNullable("email", row.optString("email"))
                    put("outstanding_balance", row.optDouble("outstanding_balance", 0.0)); put("updated_at", System.currentTimeMillis()); put("local_pending", 0)
                }, SQLiteDatabase.CONFLICT_REPLACE)
            }
            db.setTransactionSuccessful()
        } finally { db.endTransaction() }
    }

    fun cachedProducts(organizationId: String): List<CachedProduct> {
        val rows = mutableListOf<CachedProduct>()
        readableDatabase.query(
            "cached_products",
            arrayOf("id", "name", "sku", "barcode", "selling_price", "tax_rate", "stock", "local_pending"),
            "organization_id=?", arrayOf(organizationId), null, null, "name collate nocase asc"
        ).use { cursor ->
            while (cursor.moveToNext()) rows += CachedProduct(
                cursor.getString(0), cursor.getString(1), cursor.nullableString(2), cursor.nullableString(3),
                cursor.getDouble(4), cursor.getDouble(5), cursor.getDouble(6), cursor.getInt(7) == 1
            )
        }
        return rows
    }

    fun cachedCustomers(organizationId: String): List<CachedCustomer> {
        val rows = mutableListOf<CachedCustomer>()
        readableDatabase.query(
            "cached_customers",
            arrayOf("id", "name", "phone", "email", "outstanding_balance", "local_pending"),
            "organization_id=?", arrayOf(organizationId), null, null, "name collate nocase asc"
        ).use { cursor ->
            while (cursor.moveToNext()) rows += CachedCustomer(
                cursor.getString(0), cursor.getString(1), cursor.nullableString(2), cursor.nullableString(3),
                cursor.getDouble(4), cursor.getInt(5) == 1
            )
        }
        return rows
    }

    /** Offline-first customer create. The returned UUID is immediately usable by an offline bill. */
    fun enqueueCustomer(organizationId: String, createdBy: String?, name: String, phone: String?, email: String?): String {
        val id = UUID.randomUUID().toString()
        val now = System.currentTimeMillis()
        val db = writableDatabase
        db.beginTransaction()
        try {
            db.insertOrThrow("cached_customers", null, ContentValues().apply {
                put("id", id); put("organization_id", organizationId); put("name", name.trim())
                putNullable("phone", phone); putNullable("email", email); put("outstanding_balance", 0.0)
                put("updated_at", now); put("local_pending", 1)
            })
            db.insertOrThrow("pending_customers", null, ContentValues().apply {
                put("local_id", id); put("organization_id", organizationId); put("name", name.trim())
                putNullable("phone", phone); putNullable("email", email); putNullable("created_by", createdBy)
                put("status", "PENDING_SYNC"); put("attempt_count", 0); put("created_at", now)
            })
            db.setTransactionSuccessful()
        } finally { db.endTransaction() }
        return id
    }

    /** Offline-first product create. Local UUID can be referenced by queued invoices before sync. */
    fun enqueueProduct(
        organizationId: String,
        createdBy: String?,
        name: String,
        sellingPrice: Double,
        taxRate: Double,
        openingStock: Double,
        sku: String?,
        barcode: String?
    ): String {
        val id = UUID.randomUUID().toString()
        val now = System.currentTimeMillis()
        val db = writableDatabase
        db.beginTransaction()
        try {
            db.insertOrThrow("cached_products", null, ContentValues().apply {
                put("id", id); put("organization_id", organizationId); put("name", name.trim())
                putNullable("sku", sku); putNullable("barcode", barcode); put("selling_price", sellingPrice)
                put("tax_rate", taxRate); put("stock", openingStock); put("updated_at", now); put("local_pending", 1)
            })
            db.insertOrThrow("pending_products", null, ContentValues().apply {
                put("local_id", id); put("organization_id", organizationId); put("name", name.trim())
                put("selling_price", sellingPrice); put("tax_rate", taxRate); put("opening_stock", openingStock)
                putNullable("sku", sku); putNullable("barcode", barcode); putNullable("created_by", createdBy)
                put("status", "PENDING_SYNC"); put("attempt_count", 0); put("created_at", now)
            })
            db.setTransactionSuccessful()
        } finally { db.endTransaction() }
        return id
    }

    fun pendingCustomers(limit: Int = 50): List<JSONObject> = pendingEntityRows(
        "pending_customers",
        arrayOf("local_id", "organization_id", "name", "phone", "email", "created_by", "attempt_count"),
        limit
    ) { c ->
        JSONObject().apply {
            put("local_id", c.getString(0)); put("organization_id", c.getString(1)); put("name", c.getString(2))
            putNullable("phone", c.nullableString(3)); putNullable("email", c.nullableString(4)); putNullable("created_by", c.nullableString(5))
            put("attempt_count", c.getInt(6))
        }
    }

    fun pendingProducts(limit: Int = 50): List<JSONObject> = pendingEntityRows(
        "pending_products",
        arrayOf("local_id", "organization_id", "name", "selling_price", "tax_rate", "opening_stock", "sku", "barcode", "created_by", "attempt_count"),
        limit
    ) { c ->
        JSONObject().apply {
            put("local_id", c.getString(0)); put("organization_id", c.getString(1)); put("name", c.getString(2))
            put("selling_price", c.getDouble(3)); put("tax_rate", c.getDouble(4)); put("opening_stock", c.getDouble(5))
            putNullable("sku", c.nullableString(6)); putNullable("barcode", c.nullableString(7)); putNullable("created_by", c.nullableString(8))
            put("attempt_count", c.getInt(9))
        }
    }

    private fun <T> pendingEntityRows(table: String, columns: Array<String>, limit: Int, mapper: (Cursor) -> T): List<T> {
        val out = mutableListOf<T>()
        readableDatabase.query(
            table, columns, "status in ('PENDING_SYNC','SYNC_FAILED','SYNCING')", null, null, null, "created_at asc", limit.toString()
        ).use { cursor -> while (cursor.moveToNext()) out += mapper(cursor) }
        return out
    }

    fun markCustomerSyncing(id: String) = markEntitySyncing("pending_customers", id)
    fun markProductSyncing(id: String) = markEntitySyncing("pending_products", id)

    private fun markEntitySyncing(table: String, id: String) {
        writableDatabase.update(table, ContentValues().apply { put("status", "SYNCING") }, "local_id=?", arrayOf(id))
    }

    fun markCustomerFailed(id: String, error: String) = markEntityFailed("pending_customers", id, error)
    fun markProductFailed(id: String, error: String) = markEntityFailed("pending_products", id, error)

    private fun markEntityFailed(table: String, id: String, error: String) {
        writableDatabase.execSQL(
            "update $table set status='SYNC_FAILED', attempt_count=attempt_count+1, last_error=? where local_id=?",
            arrayOf(error.take(500), id)
        )
    }

    fun resolveCustomerSync(localId: String, serverId: String) {
        val db = writableDatabase
        db.beginTransaction()
        try {
            rewriteCustomerReferences(db, localId, serverId)
            if (localId == serverId) {
                db.update("cached_customers", ContentValues().apply { put("local_pending", 0) }, "id=?", arrayOf(localId))
            } else {
                db.delete("cached_customers", "id=?", arrayOf(localId))
            }
            db.delete("pending_customers", "local_id=?", arrayOf(localId))
            db.setTransactionSuccessful()
        } finally { db.endTransaction() }
    }

    fun resolveProductSync(localId: String, serverId: String) {
        val db = writableDatabase
        db.beginTransaction()
        try {
            rewriteProductReferences(db, localId, serverId)
            if (localId == serverId) {
                db.update("cached_products", ContentValues().apply { put("local_pending", 0) }, "id=?", arrayOf(localId))
            } else {
                db.delete("cached_products", "id=?", arrayOf(localId))
            }
            db.delete("pending_products", "local_id=?", arrayOf(localId))
            db.setTransactionSuccessful()
        } finally { db.endTransaction() }
    }

    private fun rewriteCustomerReferences(db: SQLiteDatabase, localId: String, serverId: String) {
        db.query("pending_invoices", arrayOf("client_invoice_id", "payload_json"), null, null, null, null, null).use { c ->
            while (c.moveToNext()) {
                val payload = JSONObject(c.getString(1))
                if (!payload.isNull("customer_id") && payload.optString("customer_id") == localId) {
                    payload.put("customer_id", serverId)
                    db.update("pending_invoices", ContentValues().apply { put("payload_json", payload.toString()) }, "client_invoice_id=?", arrayOf(c.getString(0)))
                }
            }
        }
    }

    private fun rewriteProductReferences(db: SQLiteDatabase, localId: String, serverId: String) {
        db.query("pending_invoices", arrayOf("client_invoice_id", "payload_json"), null, null, null, null, null).use { c ->
            while (c.moveToNext()) {
                val payload = JSONObject(c.getString(1))
                val items = payload.optJSONArray("items") ?: continue
                var changed = false
                repeat(items.length()) { index ->
                    val item = items.getJSONObject(index)
                    if (item.optString("product_id") == localId) { item.put("product_id", serverId); changed = true }
                }
                if (changed) db.update("pending_invoices", ContentValues().apply { put("payload_json", payload.toString()) }, "client_invoice_id=?", arrayOf(c.getString(0)))
            }
        }
        db.query("local_bills", arrayOf("client_invoice_id", "receipt_json"), null, null, null, null, null).use { c ->
            while (c.moveToNext()) {
                val receipt = JSONObject(c.getString(1))
                val items = receipt.optJSONArray("items") ?: continue
                var changed = false
                repeat(items.length()) { index ->
                    val item = items.getJSONObject(index)
                    if (item.optString("product_id") == localId) { item.put("product_id", serverId); changed = true }
                }
                if (changed) db.update("local_bills", ContentValues().apply { put("receipt_json", receipt.toString()) }, "client_invoice_id=?", arrayOf(c.getString(0)))
            }
        }
    }

    /** Atomically queues a bill, saves its receipt and reserves local stock. */
    fun enqueueInvoiceWithReceipt(
        payload: JSONObject,
        organizationId: String,
        receipt: JSONObject,
        total: Double,
        paymentMethod: String
    ): String {
        val id = UUID.randomUUID().toString()
        val now = System.currentTimeMillis()
        val db = writableDatabase
        db.beginTransaction()
        try {
            val items = payload.getJSONArray("items")
            repeat(items.length()) { index ->
                val item = items.getJSONObject(index)
                val productId = item.getString("product_id")
                val qty = item.optDouble("quantity", 0.0)
                require(qty > 0) { "Invalid quantity" }
                val values = ContentValues().apply { put("stock", currentStock(db, productId) - qty); put("updated_at", now) }
                val updated = db.update("cached_products", values, "id=? and stock>=?", arrayOf(productId, qty.toString()))
                if (updated == 0) throw IllegalStateException("Insufficient local stock. Refresh product stock and try again.")
            }
            db.insertOrThrow("pending_invoices", null, ContentValues().apply {
                put("client_invoice_id", id); put("payload_json", payload.toString()); put("status", "PENDING_SYNC")
                put("created_at", now); put("attempt_count", 0)
            })
            db.insertOrThrow("local_bills", null, ContentValues().apply {
                put("client_invoice_id", id); put("organization_id", organizationId); put("receipt_json", receipt.toString())
                put("total", total); put("payment_method", paymentMethod); put("sync_status", "PENDING_SYNC"); put("created_at", now)
            })
            db.setTransactionSuccessful()
        } finally { db.endTransaction() }
        return id
    }

    private fun currentStock(db: SQLiteDatabase, productId: String): Double = db.rawQuery(
        "select stock from cached_products where id=? limit 1", arrayOf(productId)
    ).use { c -> if (c.moveToFirst()) c.getDouble(0) else throw IllegalStateException("Product is not available in local inventory") }

    fun enqueueInvoice(payload: JSONObject): String {
        val id = UUID.randomUUID().toString()
        writableDatabase.insertOrThrow("pending_invoices", null, ContentValues().apply {
            put("client_invoice_id", id); put("payload_json", payload.toString()); put("status", "PENDING_SYNC")
            put("created_at", System.currentTimeMillis()); put("attempt_count", 0)
        })
        return id
    }

    fun pendingInvoices(limit: Int = 50): List<JSONObject> {
        val result = mutableListOf<JSONObject>()
        readableDatabase.query(
            "pending_invoices", arrayOf("client_invoice_id", "payload_json", "attempt_count"),
            "status in ('PENDING_SYNC','SYNC_FAILED','SYNCING')", null, null, null, "created_at asc", limit.toString()
        ).use { cursor ->
            while (cursor.moveToNext()) result += JSONObject().apply {
                put("client_invoice_id", cursor.getString(0)); put("payload", JSONObject(cursor.getString(1))); put("attempt_count", cursor.getInt(2))
            }
        }
        return result
    }

    fun markInvoiceSyncing(clientId: String) {
        writableDatabase.update("pending_invoices", ContentValues().apply { put("status", "SYNCING") }, "client_invoice_id=?", arrayOf(clientId))
        writableDatabase.update("local_bills", ContentValues().apply { put("sync_status", "SYNCING") }, "client_invoice_id=?", arrayOf(clientId))
    }

    fun markSynced(clientId: String) { writableDatabase.delete("pending_invoices", "client_invoice_id=?", arrayOf(clientId)) }

    fun markFailed(clientId: String, error: String) {
        writableDatabase.execSQL(
            "update pending_invoices set status='SYNC_FAILED', attempt_count=attempt_count+1, last_error=? where client_invoice_id=?",
            arrayOf(error.take(500), clientId)
        )
        markLocalBillFailed(clientId)
    }

    fun saveLocalBill(clientInvoiceId: String, organizationId: String, receipt: JSONObject, total: Double, paymentMethod: String) {
        writableDatabase.insertWithOnConflict("local_bills", null, ContentValues().apply {
            put("client_invoice_id", clientInvoiceId); put("organization_id", organizationId); put("receipt_json", receipt.toString())
            put("total", total); put("payment_method", paymentMethod); put("sync_status", "PENDING_SYNC"); put("created_at", System.currentTimeMillis())
        }, SQLiteDatabase.CONFLICT_REPLACE)
    }

    fun localBill(clientInvoiceId: String): LocalBillRecord? = readableDatabase.query(
        "local_bills",
        arrayOf("client_invoice_id", "organization_id", "receipt_json", "total", "payment_method", "sync_status", "server_invoice_id", "server_invoice_number", "created_at"),
        "client_invoice_id=?", arrayOf(clientInvoiceId), null, null, null, "1"
    ).use { cursor -> if (cursor.moveToFirst()) localBillFrom(cursor) else null }

    fun recentLocalBills(organizationId: String, limit: Int = 20): List<LocalBillRecord> {
        val rows = mutableListOf<LocalBillRecord>()
        readableDatabase.query(
            "local_bills",
            arrayOf("client_invoice_id", "organization_id", "receipt_json", "total", "payment_method", "sync_status", "server_invoice_id", "server_invoice_number", "created_at"),
            "organization_id=?", arrayOf(organizationId), null, null, "created_at desc", limit.toString()
        ).use { cursor -> while (cursor.moveToNext()) rows += localBillFrom(cursor) }
        return rows
    }

    private fun localBillFrom(cursor: Cursor) = LocalBillRecord(
        clientInvoiceId = cursor.getString(0), organizationId = cursor.getString(1), receiptJson = JSONObject(cursor.getString(2)),
        total = cursor.getDouble(3), paymentMethod = cursor.getString(4), syncStatus = cursor.getString(5),
        serverInvoiceId = cursor.nullableString(6), serverInvoiceNumber = cursor.nullableString(7), createdAt = cursor.getLong(8)
    )

    fun markLocalBillSynced(clientId: String, invoiceId: String?, invoiceNumber: String?) {
        writableDatabase.update("local_bills", ContentValues().apply {
            put("sync_status", "SYNCED"); putNullable("server_invoice_id", invoiceId); putNullable("server_invoice_number", invoiceNumber)
        }, "client_invoice_id=?", arrayOf(clientId))
    }

    fun markLocalBillFailed(clientId: String) {
        writableDatabase.update("local_bills", ContentValues().apply { put("sync_status", "SYNC_FAILED") }, "client_invoice_id=?", arrayOf(clientId))
    }

    fun enqueuePrintJob(clientInvoiceId: String, error: String?) {
        writableDatabase.insertWithOnConflict("print_jobs", null, ContentValues().apply {
            put("client_invoice_id", clientInvoiceId); put("status", "PENDING_PRINT"); put("attempt_count", 0)
            putNullable("last_error", error); put("created_at", System.currentTimeMillis())
        }, SQLiteDatabase.CONFLICT_REPLACE)
    }

    fun pendingPrintJobs(limit: Int = 50): List<PrintJobRecord> {
        val out = mutableListOf<PrintJobRecord>()
        readableDatabase.query(
            "print_jobs", arrayOf("id", "client_invoice_id", "status", "attempt_count", "last_error", "created_at"),
            "status in ('PENDING_PRINT','PRINT_FAILED')", null, null, null, "created_at asc", limit.toString()
        ).use { c -> while (c.moveToNext()) out += PrintJobRecord(c.getLong(0), c.getString(1), c.getString(2), c.getInt(3), c.nullableString(4), c.getLong(5)) }
        return out
    }

    fun markPrintDone(jobId: Long) { writableDatabase.delete("print_jobs", "id=?", arrayOf(jobId.toString())) }
    fun clearPrintJob(clientInvoiceId: String) { writableDatabase.delete("print_jobs", "client_invoice_id=?", arrayOf(clientInvoiceId)) }
    fun markPrintFailed(jobId: Long, error: String) {
        writableDatabase.execSQL("update print_jobs set status='PRINT_FAILED', attempt_count=attempt_count+1, last_error=? where id=?", arrayOf(error.take(500), jobId))
    }

    fun pendingSyncRecords(organizationId: String): List<PendingSyncRecord> {
        val out = mutableListOf<PendingSyncRecord>()
        readableDatabase.query("pending_customers", arrayOf("local_id", "name", "status", "attempt_count", "last_error", "created_at"), "organization_id=?", arrayOf(organizationId), null, null, "created_at asc").use { c ->
            while (c.moveToNext()) out += PendingSyncRecord("CUSTOMER", c.getString(0), c.getString(1), c.getString(2), c.getInt(3), c.nullableString(4), c.getLong(5))
        }
        readableDatabase.query("pending_products", arrayOf("local_id", "name", "status", "attempt_count", "last_error", "created_at"), "organization_id=?", arrayOf(organizationId), null, null, "created_at asc").use { c ->
            while (c.moveToNext()) out += PendingSyncRecord("PRODUCT", c.getString(0), c.getString(1), c.getString(2), c.getInt(3), c.nullableString(4), c.getLong(5))
        }
        readableDatabase.rawQuery(
            "select p.client_invoice_id,p.status,p.attempt_count,p.last_error,p.created_at from pending_invoices p join local_bills b on b.client_invoice_id=p.client_invoice_id where b.organization_id=? order by p.created_at asc",
            arrayOf(organizationId)
        ).use { c -> while (c.moveToNext()) out += PendingSyncRecord("BILL", c.getString(0), "Bill ${c.getString(0).take(8).uppercase()}", c.getString(1), c.getInt(2), c.nullableString(3), c.getLong(4)) }
        return out.sortedBy { it.createdAt }
    }

    fun pendingInvoiceCount(): Int = count("pending_invoices", "status in ('PENDING_SYNC','SYNC_FAILED','SYNCING')")
    fun pendingCustomerCount(): Int = count("pending_customers", "status in ('PENDING_SYNC','SYNC_FAILED','SYNCING')")
    fun pendingProductCount(): Int = count("pending_products", "status in ('PENDING_SYNC','SYNC_FAILED','SYNCING')")
    fun printQueueCount(): Int = count("print_jobs", "status in ('PENDING_PRINT','PRINT_FAILED')")
    fun failedSyncCount(): Int =
        count("pending_invoices", "status='SYNC_FAILED'") + count("pending_customers", "status='SYNC_FAILED'") + count("pending_products", "status='SYNC_FAILED'")
    fun pendingCount(): Int = pendingInvoiceCount() + pendingCustomerCount() + pendingProductCount()

    private fun count(table: String, where: String): Int = readableDatabase.rawQuery("select count(*) from $table where $where", null)
        .use { if (it.moveToFirst()) it.getInt(0) else 0 }

    fun cachedProductCount(organizationId: String): Int = readableDatabase.rawQuery(
        "select count(*) from cached_products where organization_id=?", arrayOf(organizationId)
    ).use { if (it.moveToFirst()) it.getInt(0) else 0 }

    fun cachedCustomerCount(organizationId: String): Int = readableDatabase.rawQuery(
        "select count(*) from cached_customers where organization_id=?", arrayOf(organizationId)
    ).use { if (it.moveToFirst()) it.getInt(0) else 0 }

    private fun Cursor.nullableString(index: Int): String? = if (isNull(index)) null else getString(index)?.takeIf { it.isNotBlank() && it != "null" }
    private fun ContentValues.putNullable(key: String, value: String?) { if (value.isNullOrBlank()) putNull(key) else put(key, value.trim()) }
    private fun JSONObject.putNullable(key: String, value: String?) { if (value.isNullOrBlank()) put(key, JSONObject.NULL) else put(key, value.trim()) }
}
