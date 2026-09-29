package com.brandspire.pos.printer

import android.Manifest
import android.bluetooth.BluetoothAdapter
import android.content.Context
import android.content.pm.PackageManager
import android.hardware.usb.UsbManager
import android.os.Build
import androidx.core.content.ContextCompat

object PrinterDiscovery {
    fun pairedBluetooth(context: Context, adapter: BluetoothAdapter?): List<PrinterDevice> {
        if (adapter == null) return emptyList()
        if (Build.VERSION.SDK_INT >= 31 && ContextCompat.checkSelfPermission(context, Manifest.permission.BLUETOOTH_CONNECT) != PackageManager.PERMISSION_GRANTED) {
            return emptyList()
        }
        return adapter.bondedDevices.orEmpty().map {
            PrinterDevice(it.address, it.name ?: "Bluetooth printer", PrinterDevice.Transport.BLUETOOTH)
        }.sortedBy { it.name.lowercase() }
    }

    fun usb(context: Context): List<PrinterDevice> {
        val manager = context.getSystemService(Context.USB_SERVICE) as UsbManager
        return manager.deviceList.values.map {
            PrinterDevice(it.deviceName, it.productName ?: "USB device ${it.vendorId}:${it.productId}", PrinterDevice.Transport.USB)
        }.sortedBy { it.name.lowercase() }
    }
}
