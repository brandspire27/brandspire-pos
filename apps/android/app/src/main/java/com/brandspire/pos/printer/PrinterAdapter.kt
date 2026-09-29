package com.brandspire.pos.printer

interface PrinterAdapter {
    suspend fun connect(device: PrinterDevice): PrintResult
    suspend fun print(rawEscPos: ByteArray): PrintResult
    suspend fun disconnect()
    fun isConnected(): Boolean
}
