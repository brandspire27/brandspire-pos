package com.brandspire.pos.printer

import org.junit.Assert.*
import org.junit.Test

class ReceiptEncodingTest {
    @Test fun fractionalQuantitiesRemainExact() {
        assertEquals("0.5", receiptQuantity(0.5))
        assertEquals("1.25", receiptQuantity(1.25))
        assertEquals("2", receiptQuantity(2.0))
        for (bad in listOf(0.0, -1.0, Double.NaN, Double.POSITIVE_INFINITY)) {
            assertThrows(IllegalArgumentException::class.java) { receiptQuantity(bad) }
        }
    }

    @Test fun rasterPacksMostSignificantBitFirstAndPadsWhite() {
        val bytes = rasterBytes(9, 1) { x, _ -> x == 0 || x == 8 }
        assertArrayEquals(byteArrayOf(0x1D, 0x76, 0x30, 0, 2, 0, 1, 0, 0x80.toByte(), 0x80.toByte()), bytes)
    }

    @Test fun longRasterIsSplitWithoutLosingRows() {
        val bytes = rasterBytes(384, 129) { _, y -> y == 128 }
        assertEquals(16 + 48 * 129, bytes.size)
        val secondHeader = 8 + 48 * 128
        assertEquals(1, bytes[secondHeader + 6].toInt())
        assertTrue(bytes.takeLast(48).all { it == 0xFF.toByte() })
        assertTrue(bytes.slice(8 until secondHeader).all { it == 0.toByte() })
    }
}
