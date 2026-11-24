package com.brandspire.pos.printer

import android.bluetooth.BluetoothManager
import android.content.Context
import android.hardware.usb.UsbManager
import com.brandspire.pos.data.LocalBillRecord
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import org.json.JSONObject
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale

object ReceiptPrinter {
    suspend fun print(context: Context, bill: LocalBillRecord, saved: SavedPrinter): PrintResult = withContext(Dispatchers.IO) {
        if (saved.transport == PrinterDevice.Transport.SC03_BLE) {
            if (saved.paper != PaperProfile.THERMAL_58MM) return@withContext PrintResult(false, "SC03 supports the 58mm profile only")
            val receipt = bill.receiptJson
            val lines = mutableListOf(receipt.optString("organization_name", "Brandspire POS"),
                bill.serverInvoiceNumber ?: "OFFLINE-${bill.clientInvoiceId.take(8).uppercase()}",
                SimpleDateFormat("dd MMM yyyy, hh:mm a", Locale.ENGLISH).format(Date(bill.createdAt)),
                "Customer: ${receipt.optString("customer_name", "Walk-in")}", "--------------------------")
            receipt.optJSONArray("items")?.let { items -> repeat(items.length()) { index ->
                val item = items.getJSONObject(index)
                val qty = item.optDouble("quantity", 1.0)
                val rate = item.optDouble("rate", 0.0)
                lines.add(item.optString("name", "Item"))
                lines.add("${receiptQuantity(qty)} x ${money(rate)} = ${money(item.optDouble("total", qty * rate))}")
            } }
            lines.addAll(listOf("--------------------------", "TOTAL: ${money(bill.total)}", "Payment: ${bill.paymentMethod}"))
            if (bill.serverInvoiceNumber == null) lines.add("Offline receipt - final invoice number after sync")
            lines.add("Thank you!")
            return@withContext Sc03Printer.print(context, saved.id, lines.joinToString("\n"))
        }
        val device = PrinterDevice(saved.id, saved.name, saved.transport)
        val adapter: PrinterAdapter = when (saved.transport) {
            PrinterDevice.Transport.BLUETOOTH -> {
                val bt = (context.getSystemService(Context.BLUETOOTH_SERVICE) as BluetoothManager).adapter
                BluetoothPrinterAdapter(bt)
            }
            PrinterDevice.Transport.USB -> UsbPrinterAdapter(context.getSystemService(Context.USB_SERVICE) as UsbManager)
            PrinterDevice.Transport.SC03_BLE -> error("SC03 is handled above")
        }
        val connected = adapter.connect(device)
        if (!connected.success) return@withContext connected
        try {
            adapter.print(receiptBytes(bill, saved.paper))
        } finally {
            adapter.disconnect()
        }
    }

    fun receiptBytes(bill: LocalBillRecord, paper: PaperProfile): ByteArray {
        val receipt = bill.receiptJson
        val encoder = EscPosEncoder(paper).initialize().alignCenter().bold(true)
            .line(receipt.optString("organization_name", "Brandspire POS"))
            .bold(false)
        val ref = bill.serverInvoiceNumber ?: "OFFLINE-${bill.clientInvoiceId.take(8).uppercase()}"
        encoder.line(ref)
        encoder.line(SimpleDateFormat("dd MMM yyyy, hh:mm a", Locale.ENGLISH).format(Date(bill.createdAt)))
        encoder.divider().alignLeft()
        val customer = receipt.optString("customer_name", "Walk-in")
        encoder.line("Customer: $customer")
        encoder.divider()
        val items = receipt.optJSONArray("items")
        if (items != null) repeat(items.length()) { index ->
            val item = items.getJSONObject(index)
            val name = item.optString("name", "Item")
            val qty = item.optDouble("quantity", 1.0)
            val rate = item.optDouble("rate", 0.0)
            val total = item.optDouble("total", rate * qty)
            encoder.line(name)
            encoder.line(twoCol("${receiptQuantity(qty)} x ${money(rate)}", money(total), paper.columns))
        }
        encoder.divider().bold(true)
        encoder.line(twoCol("TOTAL", money(bill.total), paper.columns)).bold(false)
        encoder.line("Payment: ${bill.paymentMethod}")
        if (bill.serverInvoiceNumber == null) {
            encoder.line("Offline receipt - final invoice no. after sync")
        }
        encoder.alignCenter().feed(1).line("Thank you!").feed(4).partialCut()
        return encoder.bytes()
    }

    private fun money(value: Double) = "Rs.${"%.2f".format(Locale.US, value)}"
    private fun twoCol(left: String, right: String, columns: Int): String {
        if (right.length >= columns) return right.take(columns)
        val leftMax = (columns - right.length - 1).coerceAtLeast(0)
        val l = left.take(leftMax)
        return l + " ".repeat((columns - l.length - right.length).coerceAtLeast(1)) + right
    }
}
