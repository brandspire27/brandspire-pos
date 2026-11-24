package com.brandspire.pos.printer

import java.io.ByteArrayOutputStream

/** GS v 0 normal-size raster, split into bounded-height strips for printer buffers. */
internal fun rasterBytes(width: Int, height: Int, black: (Int, Int) -> Boolean): ByteArray {
    require(width in 1..576 && height > 0)
    val bytesPerRow = (width + 7) / 8
    val out = ByteArrayOutputStream()
    for (top in 0 until height step 128) {
        val rows = minOf(128, height - top)
        out.write(byteArrayOf(0x1D, 0x76, 0x30, 0, bytesPerRow.toByte(), 0, rows.toByte(), 0))
        for (y in top until top + rows) for (byteX in 0 until bytesPerRow) {
            var bits = 0
            for (bit in 0..7) {
                val x = byteX * 8 + bit
                if (x < width && black(x, y)) bits = bits or (0x80 shr bit)
            }
            out.write(bits)
        }
    }
    return out.toByteArray()
}
