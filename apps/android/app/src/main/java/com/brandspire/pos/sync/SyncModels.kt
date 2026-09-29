package com.brandspire.pos.sync

import java.util.UUID

enum class SyncState { ONLINE, OFFLINE, SYNCING, SYNC_FAILED }

data class PendingInvoice(
    val clientInvoiceId: String = UUID.randomUUID().toString(),
    val payloadJson: String,
    val createdAtEpochMs: Long = System.currentTimeMillis(),
    val attemptCount: Int = 0
)
