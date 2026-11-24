package com.brandspire.pos.printer

import org.junit.Assert.*
import org.junit.Test

class Sc03ProtocolTest {
    @Test fun crcCheckVector() {
        val packet = Sc03Protocol.packet(0xa2, "123456789".toByteArray())
        assertEquals(0xf4, packet[packet.size - 2].toInt() and 255)
    }
    @Test fun rasterConversionKeepsPixelsInPhysicalOrder() {
        val header = byteArrayOf(29, 118, 48, 0, 48, 0, 1, 0)
        val pixels = ByteArray(48)
        pixels[0] = 0xa1.toByte()
        pixels[1] = 0x80.toByte()
        val packets = Sc03Protocol.fromRaster(header + pixels + header + pixels)
        assertEquals(8, packets.size)
        assertEquals(0x85, packets[5][6].toInt() and 255)
        assertEquals(1, packets[5][7].toInt())
        assertArrayEquals(packets[5], packets[6])
        assertEquals(0xa1, packets.last()[2].toInt() and 255)
    }
    @Test(expected = IllegalArgumentException::class)
    fun truncatedRasterRejected() {
        Sc03Protocol.fromRaster(byteArrayOf(29,118,48,0,48,0,1,0))
    }
}
