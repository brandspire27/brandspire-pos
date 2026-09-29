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
        val device = PrinterDevice(saved.id, saved.name, saved.transport)
        val adapter: PrinterAdapter = when (saved.transport) {
            PrinterDevice.Transport.BLUETOOTH -> {
                val bt = (context.getSystemService(Context.BLUETOOTH_SERVICE) as BluetoothManager).adapter
                BluetoothPrinterAdapter(bt)
            }
            PrinterDevice.Transport.USB -> UsbPrinterAdapter(context.getSystemService(Context.USB_SERVICE) as UsbManager)
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
        encoder.line("Customer: ${safeAscii(customer)}")
        encoder.divider()
        val items = receipt.optJSONArray("items")
        if (items != null) repeat(items.length()) { index ->
            val item = items.getJSONObject(index)
            val name = safeAscii(item.optString("name", "Item"))
            val qty = item.optInt("quantity", 1)
            val rate = item.optDouble("rate", 0.0)
            val total = item.optDouble("total", rate * qty)
            encoder.line(trim(name, paper.columns))
            encoder.line(twoCol("$qty x ${money(rate)}", money(total), paper.columns))
        }
        encoder.divider().bold(true)
        encoder.line(twoCol("TOTAL", money(bill.total), paper.columns)).bold(false)
        encoder.line("Payment: ${safeAscii(bill.paymentMethod)}")
        if (bill.serverInvoiceNumber == null) {
            encoder.line("Offline receipt - final invoice no. after sync")
        }
        encoder.alignCenter().feed(1).line("Thank you!").feed(4).partialCut()
        return encoder.bytes()
    }

    private fun money(value: Double) = "Rs.${"%.2f".format(Locale.US, value)}"
    private fun safeAscii(value: String) = value.replace(Regex("[^\\x20-\\x7E]"), "?")
    private fun trim(value: String, columns: Int) = if (value.length <= columns) value else value.take((columns - 1).coerceAtLeast(1)) + "…"
    private fun twoCol(left: String, right: String, columns: Int): String {
        if (right.length >= columns) return right.take(columns)
        val leftMax = (columns - right.length - 1).coerceAtLeast(0)
        val l = left.take(leftMax)
        return l + " ".repeat((columns - l.length - right.length).coerceAtLeast(1)) + right
    }
}
