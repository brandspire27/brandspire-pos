package com.brandspire.pos.printer

internal object Sc03Protocol {
    fun packet(op: Int, payload: ByteArray): ByteArray {
        require(payload.size <= 65535)
        var crc = 0
        for (b in payload) {
            crc = crc xor (b.toInt() and 255)
            repeat(8) { crc = ((crc shl 1) xor (if (crc and 128 != 0) 7 else 0)) and 255 }
        }
        return byteArrayOf(81, 120, op.toByte(), 0, payload.size.toByte(), (payload.size shr 8).toByte()) + payload + byteArrayOf(crc.toByte(), 255.toByte())
    }
    fun reverseByte(value: Byte): Byte = (Integer.reverse(value.toInt() and 255) ushr 24).toByte()

    // RasterText emits MSB-first ESC/POS raster chunks; SC03 needs LSB-first 384-dot rows.
    fun fromRaster(raster: ByteArray): List<ByteArray> {
        val packets = mutableListOf(packet(0xa3, byteArrayOf(0)), packet(0xa4, byteArrayOf(0x33)),
            packet(0xaf, byteArrayOf(0x70, 0x44)), packet(0xbe, byteArrayOf(0)), packet(0xbd, byteArrayOf(0x23)))
        require(raster.isNotEmpty()) { "Receipt raster is empty" }
        var offset = 0
        while (offset < raster.size) {
            require(offset + 8 <= raster.size && raster[offset] == 0x1d.toByte() && raster[offset + 1] == 0x76.toByte() && raster[offset + 2] == 0x30.toByte() && raster[offset + 3] == 0.toByte())
            val width = (raster[offset + 4].toInt() and 255) + ((raster[offset + 5].toInt() and 255) shl 8)
            val rows = (raster[offset + 6].toInt() and 255) + ((raster[offset + 7].toInt() and 255) shl 8)
            require(rows > 0 && width == 48 && offset + 8 + rows * width <= raster.size)
            offset += 8
            repeat(rows) {
                packets.add(packet(0xa2, ByteArray(48) { reverseByte(raster[offset + it]) }))
                offset += 48
            }
        }
        packets.add(packet(0xa1, byteArrayOf(80, 0)))
        return packets
    }
}
