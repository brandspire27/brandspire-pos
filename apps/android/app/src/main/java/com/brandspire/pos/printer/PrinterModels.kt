package com.brandspire.pos.printer

enum class PaperProfile(val widthMm: Int, val columns: Int) {
    THERMAL_58MM(58, 32),
    THERMAL_80MM(80, 48)
}

data class PrinterDevice(
    val id: String,
    val name: String,
    val transport: Transport
) {
    enum class Transport { BLUETOOTH, USB }
}

data class PrintResult(
    val success: Boolean,
    val message: String? = null
)
