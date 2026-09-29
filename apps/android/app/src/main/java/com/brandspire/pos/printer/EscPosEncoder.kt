package com.brandspire.pos.printer

import java.io.ByteArrayOutputStream
import java.nio.charset.Charset

class EscPosEncoder(private val profile: PaperProfile) {
    private val output = ByteArrayOutputStream()
    private val charset: Charset = Charsets.UTF_8

    fun initialize(): EscPosEncoder = apply { output.write(byteArrayOf(0x1B, 0x40)) }
    fun alignLeft(): EscPosEncoder = apply { output.write(byteArrayOf(0x1B, 0x61, 0x00)) }
    fun alignCenter(): EscPosEncoder = apply { output.write(byteArrayOf(0x1B, 0x61, 0x01)) }
    fun bold(enabled: Boolean): EscPosEncoder = apply { output.write(byteArrayOf(0x1B, 0x45, if (enabled) 0x01 else 0x00)) }
    fun text(value: String): EscPosEncoder = apply { output.write(value.toByteArray(charset)) }
    fun line(value: String = ""): EscPosEncoder = apply { text(value); output.write('\n'.code) }
    fun divider(): EscPosEncoder = line("-".repeat(profile.columns))
    fun feed(lines: Int = 3): EscPosEncoder = apply { repeat(lines.coerceIn(1, 8)) { output.write('\n'.code) } }
    fun partialCut(): EscPosEncoder = apply { output.write(byteArrayOf(0x1D, 0x56, 0x01)) }
    fun bytes(): ByteArray = output.toByteArray()
}
