package com.brandspire.pos.ui

enum class NetworkSyncState { ONLINE, OFFLINE, SYNCING, SYNC_FAILED }
enum class PrinterPaper { THERMAL_58MM, THERMAL_80MM, A4 }

data class AndroidWorkspaceState(
    val role: String = "STAFF",
    val businessName: String = "Brandspire POS",
    val syncState: NetworkSyncState = NetworkSyncState.OFFLINE,
    val pendingBills: Int = 0,
    val printerPaper: PrinterPaper = PrinterPaper.THERMAL_58MM
)
