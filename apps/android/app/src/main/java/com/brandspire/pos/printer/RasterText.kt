package com.brandspire.pos.printer

import android.graphics.Bitmap
import android.graphics.Canvas
import android.graphics.Color
import android.graphics.Typeface
import android.text.Layout
import android.text.StaticLayout
import android.text.TextPaint

/** Shape Unicode on Android instead of relying on a printer's Devanagari code page. */
internal object RasterText {
    fun render(text: String, width: Int, centered: Boolean, bold: Boolean): ByteArray {
        val paint = TextPaint(android.graphics.Paint.ANTI_ALIAS_FLAG).apply {
            color = Color.BLACK
            textSize = 24f
            typeface = Typeface.create("sans-serif", if (bold) Typeface.BOLD else Typeface.NORMAL)
        }
        val layout = StaticLayout.Builder.obtain(text, 0, text.length, paint, width)
            .setAlignment(if (centered) Layout.Alignment.ALIGN_CENTER else Layout.Alignment.ALIGN_NORMAL)
            .setIncludePad(true).build()
        val bitmap = Bitmap.createBitmap(width, layout.height.coerceAtLeast(1), Bitmap.Config.ARGB_8888)
        try {
            val canvas = Canvas(bitmap)
            canvas.drawColor(Color.WHITE)
            layout.draw(canvas)
            return rasterBytes(width, bitmap.height) { x, y ->
                val pixel = bitmap.getPixel(x, y)
                (Color.red(pixel) * 299 + Color.green(pixel) * 587 + Color.blue(pixel) * 114) < 128000
            }
        } finally { bitmap.recycle() }
    }
}
