package com.brandspire.pos.printer

import android.content.Context

data class SavedPrinter(
    val id: String,
    val name: String,
    val transport: PrinterDevice.Transport,
    val paper: PaperProfile,
    val autoPrint: Boolean
)

class PrinterPreferences(context: Context) {
    private val prefs = context.getSharedPreferences("brandspire_printer", Context.MODE_PRIVATE)

    fun read(): SavedPrinter? {
        val id = prefs.getString("device_id", null) ?: return null
        val name = prefs.getString("device_name", "Thermal Printer") ?: "Thermal Printer"
        val transport = runCatching {
            PrinterDevice.Transport.valueOf(prefs.getString("transport", PrinterDevice.Transport.BLUETOOTH.name)!!)
        }.getOrDefault(PrinterDevice.Transport.BLUETOOTH)
        val paper = runCatching {
            PaperProfile.valueOf(prefs.getString("paper", PaperProfile.THERMAL_58MM.name)!!)
        }.getOrDefault(PaperProfile.THERMAL_58MM)
        return SavedPrinter(id, name, transport, paper, prefs.getBoolean("auto_print", false))
    }

    fun save(device: PrinterDevice, paper: PaperProfile, autoPrint: Boolean = prefs.getBoolean("auto_print", false)) {
        prefs.edit()
            .putString("device_id", device.id)
            .putString("device_name", device.name)
            .putString("transport", device.transport.name)
            .putString("paper", paper.name)
            .putBoolean("auto_print", autoPrint)
            .apply()
    }

    fun setAutoPrint(enabled: Boolean) { prefs.edit().putBoolean("auto_print", enabled).apply() }
    fun clear() { prefs.edit().clear().apply() }
}
