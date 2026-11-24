package com.brandspire.pos.printer

import android.bluetooth.*
import android.bluetooth.le.ScanCallback
import android.bluetooth.le.ScanResult
import android.content.Context
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.delay
import kotlinx.coroutines.withContext
import java.util.UUID
import java.util.concurrent.CountDownLatch
import java.util.concurrent.TimeUnit
import java.util.concurrent.atomic.AtomicBoolean

object Sc03Printer {
    private val busy = AtomicBoolean(false)
    private fun uuid(short: String) = UUID.fromString("0000$short-0000-1000-8000-00805f9b34fb")

    suspend fun discover(context: Context): List<PrinterDevice> {
        val adapter = (context.getSystemService(Context.BLUETOOTH_SERVICE) as BluetoothManager).adapter
        val scanner = adapter?.bluetoothLeScanner ?: error("Turn Bluetooth on first")
        val found = java.util.concurrent.ConcurrentHashMap<String, PrinterDevice>()
        val failure = java.util.concurrent.atomic.AtomicInteger(0)
        val callback = object : ScanCallback() {
            override fun onScanResult(type: Int, result: ScanResult) {
                val name = result.scanRecord?.deviceName ?: return
                if (name.startsWith("SC03h", ignoreCase = true)) found[result.device.address] = PrinterDevice(result.device.address, name, PrinterDevice.Transport.SC03_BLE)
            }
            override fun onScanFailed(code: Int) { failure.set(code) }
        }
        try { scanner.startScan(callback); delay(8000) } finally { scanner.stopScan(callback) }
        check(failure.get() == 0) { "Bluetooth scan failed (${failure.get()})" }
        return found.values.sortedBy { it.name }
    }

    @Suppress("DEPRECATION")
    suspend fun print(context: Context, address: String, text: String): PrintResult = withContext(Dispatchers.IO) {
        if (!busy.compareAndSet(false, true)) return@withContext PrintResult(false, "A print job is already running")
        var gatt: BluetoothGatt? = null
        var sent = false
        try {
            require(text.length <= 12000) { "Receipt too long; use PDF printing" }
            val raster = RasterText.render(text, 384, false, false)
            require(raster.size <= 48 * 6000 + 4000) { "Receipt too long; use PDF printing" }
            val packets = Sc03Protocol.fromRaster(raster)
            val adapter = (context.getSystemService(Context.BLUETOOTH_SERVICE) as BluetoothManager).adapter
                ?: error("Bluetooth unavailable")
            val ready = CountDownLatch(1)
            var descriptorDone = CountDownLatch(1)
            var descriptorStatus = -1
            val connected = AtomicBoolean(false)
            val callback = object : BluetoothGattCallback() {
                override fun onConnectionStateChange(g: BluetoothGatt, status: Int, state: Int) {
                    connected.set(status == BluetoothGatt.GATT_SUCCESS && state == BluetoothProfile.STATE_CONNECTED)
                    if (connected.get()) { if (!g.discoverServices()) ready.countDown() } else ready.countDown()
                }
                override fun onServicesDiscovered(g: BluetoothGatt, status: Int) { if (status != BluetoothGatt.GATT_SUCCESS) connected.set(false); ready.countDown() }
                override fun onDescriptorWrite(g: BluetoothGatt, descriptor: BluetoothGattDescriptor, status: Int) { descriptorStatus = status; descriptorDone.countDown() }
            }
            val connection = adapter.getRemoteDevice(address).connectGatt(context.applicationContext, false, callback, BluetoothDevice.TRANSPORT_LE)
                ?: error("Could not open BLE connection")
            gatt = connection
            check(ready.await(20, TimeUnit.SECONDS) && connected.get()) { "Printer connection timed out" }
            val service = connection.getService(uuid("ae30")) ?: error("SC03 service missing")
            val writer = service.getCharacteristic(uuid("ae01")) ?: error("SC03 write interface missing")
            check(writer.properties and BluetoothGattCharacteristic.PROPERTY_WRITE_NO_RESPONSE != 0)
            val notifiers = service.characteristics.filter { it.properties and (BluetoothGattCharacteristic.PROPERTY_NOTIFY or BluetoothGattCharacteristic.PROPERTY_INDICATE) != 0 }
            check(notifiers.isNotEmpty()) { "Printer notifications unavailable" }
            for (characteristic in notifiers) {
                check(connection.setCharacteristicNotification(characteristic, true))
                val descriptor = characteristic.getDescriptor(uuid("2902")) ?: error("Notification descriptor missing")
                descriptorDone = CountDownLatch(1); descriptorStatus = -1
                descriptor.value = if (characteristic.properties and BluetoothGattCharacteristic.PROPERTY_NOTIFY != 0) BluetoothGattDescriptor.ENABLE_NOTIFICATION_VALUE else BluetoothGattDescriptor.ENABLE_INDICATION_VALUE
                check(connection.writeDescriptor(descriptor) && descriptorDone.await(5, TimeUnit.SECONDS) && descriptorStatus == BluetoothGatt.GATT_SUCCESS) { "Could not enable notifications" }
            }
            writer.writeType = BluetoothGattCharacteristic.WRITE_TYPE_NO_RESPONSE
            for ((index, packet) in packets.withIndex()) {
                for (offset in packet.indices step 20) {
                    check(connected.get()) { "Printer disconnected" }
                    writer.value = packet.copyOfRange(offset, minOf(offset + 20, packet.size))
                    sent = true
                    check(connection.writeCharacteristic(writer)) { "Printer write rejected" }
                    Thread.sleep(25)
                }
                if ((index + 1) % 70 == 0) Thread.sleep(600)
            }
            Thread.sleep(5000)
            PrintResult(true, "Sent. Check the paper before reprinting.")
        } catch (error: Exception) {
            PrintResult(false, (error.message ?: "SC03 print failed") + if (sent) ". Output may be partial; check paper before retrying." else "")
        } finally {
            try { gatt?.disconnect() } catch (_: Exception) { /* disconnected */ }
            try { gatt?.close() } finally { busy.set(false) }
        }
    }
}
