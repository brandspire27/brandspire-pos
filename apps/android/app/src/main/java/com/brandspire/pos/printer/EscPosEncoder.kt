package com.brandspire.pos.printer

import java.io.ByteArrayOutputStream
import java.nio.charset.Charset

class EscPosEncoder(private val profile: PaperProfile) {
    private val output = ByteArrayOutputStream()
    private val charset: Charset = Charsets.UTF_8
    private var centered = false
    private var boldText = false

    fun initialize(): EscPosEncoder = apply { output.write(byteArrayOf(0x1B, 0x40)) }
    fun alignLeft(): EscPosEncoder = apply { centered = false; output.write(byteArrayOf(0x1B, 0x61, 0x00)) }
    fun alignCenter(): EscPosEncoder = apply { centered = true; output.write(byteArrayOf(0x1B, 0x61, 0x01)) }
    fun bold(enabled: Boolean): EscPosEncoder = apply { boldText = enabled; output.write(byteArrayOf(0x1B, 0x45, if (enabled) 0x01 else 0x00)) }
    fun text(value: String): EscPosEncoder = apply { output.write(value.toByteArray(charset)) }
    fun line(value: String = ""): EscPosEncoder = apply {
        val safe = value.replace(Regex("[\\x00-\\x1F\\x7F]"), " ")
        if (safe.any { it.code > 126 }) {
            output.write(RasterText.render(safe, if (profile == PaperProfile.THERMAL_58MM) 384 else 576, centered, boldText))
        } else { text(safe); output.write('\n'.code) }
    }
    fun divider(): EscPosEncoder = line("-".repeat(profile.columns))
    fun feed(lines: Int = 3): EscPosEncoder = apply { repeat(lines.coerceIn(1, 8)) { output.write('\n'.code) } }
    fun partialCut(): EscPosEncoder = apply { output.write(byteArrayOf(0x1D, 0x56, 0x01)) }
    fun bytes(): ByteArray = output.toByteArray()
}
