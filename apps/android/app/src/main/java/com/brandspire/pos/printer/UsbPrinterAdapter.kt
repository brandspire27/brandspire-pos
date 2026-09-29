package com.brandspire.pos.printer

import android.hardware.usb.UsbConstants
import android.hardware.usb.UsbDeviceConnection
import android.hardware.usb.UsbEndpoint
import android.hardware.usb.UsbInterface
import android.hardware.usb.UsbManager

class UsbPrinterAdapter(private val usbManager: UsbManager) : PrinterAdapter {
    private var connection: UsbDeviceConnection? = null
    private var claimedInterface: UsbInterface? = null
    private var outEndpoint: UsbEndpoint? = null

    override suspend fun connect(device: PrinterDevice): PrintResult = runCatching {
        require(device.transport == PrinterDevice.Transport.USB)
        val usbDevice = usbManager.deviceList.values.firstOrNull { it.deviceName == device.id }
            ?: error("USB printer not found")
        require(usbManager.hasPermission(usbDevice)) { "USB permission has not been granted" }

        val printerInterface = (0 until usbDevice.interfaceCount)
            .map { usbDevice.getInterface(it) }
            .firstOrNull { intf ->
                intf.interfaceClass == UsbConstants.USB_CLASS_PRINTER ||
                    (0 until intf.endpointCount).any { intf.getEndpoint(it).direction == UsbConstants.USB_DIR_OUT }
            } ?: error("No writable USB printer interface found")

        val endpoint = (0 until printerInterface.endpointCount)
            .map { printerInterface.getEndpoint(it) }
            .firstOrNull { it.direction == UsbConstants.USB_DIR_OUT }
            ?: error("No USB OUT endpoint found")

        val opened = usbManager.openDevice(usbDevice) ?: error("Could not open USB printer")
        require(opened.claimInterface(printerInterface, true)) { "Could not claim USB printer interface" }

        connection = opened
        claimedInterface = printerInterface
        outEndpoint = endpoint
        PrintResult(true)
    }.getOrElse { PrintResult(false, it.message ?: "USB connection failed") }

    override suspend fun print(rawEscPos: ByteArray): PrintResult = runCatching {
        val active = requireNotNull(connection) { "USB printer is not connected" }
        val endpoint = requireNotNull(outEndpoint) { "USB printer output endpoint is unavailable" }
        val written = active.bulkTransfer(endpoint, rawEscPos, rawEscPos.size, 5000)
        require(written >= 0) { "USB transfer failed" }
        PrintResult(true)
    }.getOrElse { PrintResult(false, it.message ?: "USB printing failed") }

    override suspend fun disconnect() {
        val active = connection
        val intf = claimedInterface
        if (active != null && intf != null) runCatching { active.releaseInterface(intf) }
        runCatching { active?.close() }
        connection = null
        claimedInterface = null
        outEndpoint = null
    }

    override fun isConnected(): Boolean = connection != null
}
