package com.brandspire.pos.ui

import android.content.Context
import android.graphics.Paint
import android.graphics.Typeface
import android.graphics.pdf.PdfDocument
import androidx.core.content.FileProvider
import com.brandspire.pos.data.LocalBillRecord
import java.io.File
import java.io.FileOutputStream
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale

object A4InvoicePdf {
    fun create(context: Context, bill: LocalBillRecord): android.net.Uri {
        val document = PdfDocument()
        val page = document.startPage(PdfDocument.PageInfo.Builder(595, 842, 1).create())
        val canvas = page.canvas
        val ink = Paint().apply { color = android.graphics.Color.rgb(20, 30, 48); textSize = 12f; isAntiAlias = true }
        val bold = Paint(ink).apply { typeface = Typeface.create(Typeface.DEFAULT, Typeface.BOLD) }
        val receipt = bill.receiptJson
        var y = 54f
        canvas.drawText(receipt.optString("organization_name", "Brandspire POS"), 42f, y, Paint(bold).apply { textSize = 22f }); y += 28f
        val number = bill.serverInvoiceNumber ?: "Offline Ref ${bill.clientInvoiceId.take(8).uppercase()}"
        canvas.drawText(number, 42f, y, bold); y += 20f
        canvas.drawText(SimpleDateFormat("dd MMM yyyy, hh:mm a", Locale.ENGLISH).format(Date(bill.createdAt)), 42f, y, ink); y += 28f
        canvas.drawLine(42f, y, 553f, y, ink); y += 24f
        canvas.drawText("Bill To: ${receipt.optString("customer_name", "Walk-in customer")}", 42f, y, bold); y += 28f
        canvas.drawText("Item", 42f, y, bold); canvas.drawText("Qty", 330f, y, bold); canvas.drawText("Rate", 390f, y, bold); canvas.drawText("Total", 490f, y, bold); y += 12f
        canvas.drawLine(42f, y, 553f, y, ink); y += 20f
        val items = receipt.optJSONArray("items")
        if (items != null) repeat(items.length()) { index ->
            if (y > 730f) return@repeat
            val item = items.getJSONObject(index)
            canvas.drawText(item.optString("name", "Item").take(38), 42f, y, ink)
            canvas.drawText(item.optInt("quantity", 1).toString(), 330f, y, ink)
            canvas.drawText(money(item.optDouble("rate", 0.0)), 390f, y, ink)
            canvas.drawText(money(item.optDouble("total", 0.0)), 490f, y, ink)
            y += 22f
        }
        y += 8f; canvas.drawLine(42f, y, 553f, y, ink); y += 28f
        canvas.drawText("Grand Total", 390f, y, bold); canvas.drawText(money(bill.total), 490f, y, bold); y += 22f
        canvas.drawText("Payment: ${bill.paymentMethod}", 390f, y, ink)
        document.finishPage(page)
        val dir = File(context.cacheDir, "shared_invoices").apply { mkdirs() }
        val file = File(dir, "Brandspire_${bill.serverInvoiceNumber ?: bill.clientInvoiceId.take(8)}.pdf")
        FileOutputStream(file).use { document.writeTo(it) }
        document.close()
        return FileProvider.getUriForFile(context, "${context.packageName}.files", file)
    }

    private fun money(value: Double) = "Rs ${"%.2f".format(Locale.US, value)}"
}
