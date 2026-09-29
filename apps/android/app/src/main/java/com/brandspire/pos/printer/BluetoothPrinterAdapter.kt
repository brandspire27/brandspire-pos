package com.brandspire.pos.printer

import android.bluetooth.BluetoothAdapter
import android.bluetooth.BluetoothSocket
import java.util.UUID

class BluetoothPrinterAdapter(
    private val bluetoothAdapter: BluetoothAdapter?
) : PrinterAdapter {
    private var socket: BluetoothSocket? = null
    private val sppUuid: UUID = UUID.fromString("00001101-0000-1000-8000-00805F9B34FB")

    override suspend fun connect(device: PrinterDevice): PrintResult = runCatching {
        require(device.transport == PrinterDevice.Transport.BLUETOOTH)
        val adapter = requireNotNull(bluetoothAdapter) { "Bluetooth is not available on this device" }
        val remote = adapter.getRemoteDevice(device.id)
        adapter.cancelDiscovery()
        val newSocket = remote.createRfcommSocketToServiceRecord(sppUuid)
        newSocket.connect()
        socket = newSocket
        PrintResult(true)
    }.getOrElse { PrintResult(false, it.message ?: "Bluetooth connection failed") }

    override suspend fun print(rawEscPos: ByteArray): PrintResult = runCatching {
        val active = requireNotNull(socket) { "Bluetooth printer is not connected" }
        active.outputStream.write(rawEscPos)
        active.outputStream.flush()
        PrintResult(true)
    }.getOrElse { PrintResult(false, it.message ?: "Bluetooth printing failed") }

    override suspend fun disconnect() {
        runCatching { socket?.close() }
        socket = null
    }

    override fun isConnected(): Boolean = socket?.isConnected == true
}
