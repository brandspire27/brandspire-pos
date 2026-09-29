package com.brandspire.pos.ui

import android.Manifest
import android.app.Activity
import android.app.PendingIntent
import android.bluetooth.BluetoothManager
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.graphics.Color
import android.hardware.usb.UsbManager
import android.os.Build
import android.os.Bundle
import android.view.Gravity
import android.view.ViewGroup
import android.widget.LinearLayout
import android.widget.ScrollView
import android.widget.TextView
import androidx.core.app.ActivityCompat
import com.brandspire.pos.printer.BluetoothPrinterAdapter
import com.brandspire.pos.printer.EscPosEncoder
import com.brandspire.pos.printer.PaperProfile
import com.brandspire.pos.printer.PrinterDevice
import com.brandspire.pos.printer.PrinterDiscovery
import com.brandspire.pos.printer.PrinterPreferences
import com.brandspire.pos.printer.UsbPrinterAdapter
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext

class PrinterSetupActivity : Activity() {
    private val scope = CoroutineScope(Dispatchers.Main)
    private lateinit var list: LinearLayout
    private lateinit var status: TextView
    private lateinit var language: String
    private lateinit var prefs: PrinterPreferences
    private lateinit var autoPrintLabel: TextView

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        bsApplyWindowChrome()
        language = MobileText.language(intent.getStringExtra("language"))
        prefs = PrinterPreferences(this)
        render()
        requestBluetoothPermissionIfNeeded()
        refresh()
    }

    private fun render() {
        val scroll = ScrollView(this).apply { setBackgroundColor(LaunchColors.bg); clipToPadding = false }
        val root = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            setPadding(bsDp(20), bsDp(20), bsDp(20), bsDp(34))
        }
        scroll.addView(root)
        setContentView(scroll)

        root.addView(bsTopBar(
            tx("Printer Setup", "Printer Setup", "प्रिंटर सेटअप"),
            tx("58mm · 80mm · Bluetooth · USB", "58mm · 80mm · Bluetooth · USB", "58mm · 80mm · Bluetooth · USB")
        ) { finish() })

        val saved = prefs.read()
        val defaultCard = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            setPadding(bsDp(18), bsDp(18), bsDp(18), bsDp(18))
            background = bsGradient(LaunchColors.navy, LaunchColors.blueDark, 20)
        }
        defaultCard.addView(bsText(tx("Default printer", "Default printer", "डिफ़ॉल्ट प्रिंटर").uppercase(), 9.5f, Color.rgb(190, 203, 224), true).apply { letterSpacing = .12f })
        defaultCard.addView(bsText(
            saved?.name ?: tx("Not selected", "Select nahi hai", "चयनित नहीं है"),
            20f,
            Color.WHITE,
            true
        ).apply { setPadding(0, bsDp(8), 0, bsDp(4)) })
        defaultCard.addView(bsText(
            if (saved == null) tx("Choose a printer below to save it for billing.", "Neeche printer choose karke billing ke liye save karo.", "नीचे प्रिंटर चुनकर बिलिंग के लिए सेव करें।")
            else "${saved.paper.widthMm}mm · ${saved.transport}",
            11.5f,
            Color.rgb(206, 216, 233)
        ))
        root.addView(defaultCard, LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT).apply { topMargin = bsDp(16) })

        root.addView(bsSection(tx("Printing behaviour", "Printing behaviour", "प्रिंटिंग व्यवहार")))
        val autoCard = bsInfoRow(
            "A",
            tx("Auto-print after bill", "Bill ke baad auto-print", "बिल के बाद ऑटो-प्रिंट"),
            tx("Automatically print using the saved default printer.", "Saved default printer se automatically print hoga.", "सेव किए गए डिफ़ॉल्ट प्रिंटर से स्वतः प्रिंट होगा।")
        )
        autoPrintLabel = bsNeutralPill(if (saved?.autoPrint == true) "ON" else "OFF")
        autoCard.addView(autoPrintLabel)
        autoCard.setOnClickListener {
            val next = !(prefs.read()?.autoPrint ?: false)
            prefs.setAutoPrint(next)
            autoPrintLabel.text = if (next) "ON" else "OFF"
            autoPrintLabel.setTextColor(if (next) LaunchColors.green else LaunchColors.muted)
            autoPrintLabel.background = bsRounded(if (next) LaunchColors.softGreen else Color.rgb(241, 245, 249), 99)
        }
        root.addView(autoCard)

        status = bsText("", 11.5f, LaunchColors.muted).apply { setPadding(bsDp(2), bsDp(14), bsDp(2), 0) }
        root.addView(status)
        root.addView(bsSection(tx("Available printers", "Available printers", "उपलब्ध प्रिंटर")))
        list = LinearLayout(this).apply { orientation = LinearLayout.VERTICAL }
        root.addView(list)

        root.addView(bsTintCard(Color.rgb(249, 250, 252), LaunchColors.border, 15).apply {
            addView(bsText(tx("Connection tips", "Connection tips", "कनेक्शन टिप्स"), 12f, LaunchColors.inkSoft, true))
            addView(bsText(tx(
                "Pair Bluetooth printers in Android Settings first. For USB, connect the printer and allow permission when requested.",
                "Bluetooth printer ko pehle Android Settings mein pair karo. USB printer connect karke permission allow karo.",
                "Bluetooth प्रिंटर को पहले Android Settings में पेयर करें। USB प्रिंटर कनेक्ट करके अनुमति दें।"
            ), 11.5f, LaunchColors.muted).apply { setPadding(0, bsDp(5), 0, 0) })
        }, LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT).apply { topMargin = bsDp(14) })
    }

    private fun requestBluetoothPermissionIfNeeded() {
        if (Build.VERSION.SDK_INT >= 31 && checkSelfPermission(Manifest.permission.BLUETOOTH_CONNECT) != PackageManager.PERMISSION_GRANTED) {
            ActivityCompat.requestPermissions(this, arrayOf(Manifest.permission.BLUETOOTH_CONNECT, Manifest.permission.BLUETOOTH_SCAN), 51)
        }
    }

    override fun onRequestPermissionsResult(requestCode: Int, permissions: Array<out String>, grantResults: IntArray) {
        super.onRequestPermissionsResult(requestCode, permissions, grantResults)
        refresh()
    }

    private fun refresh() {
        if (!::list.isInitialized) return
        list.removeAllViews()
        val btAdapter = (getSystemService(Context.BLUETOOTH_SERVICE) as BluetoothManager).adapter
        val devices = PrinterDiscovery.pairedBluetooth(this, btAdapter) + PrinterDiscovery.usb(this)
        if (devices.isEmpty()) {
            status.text = tx(
                "No paired Bluetooth or USB printer found.",
                "Koi paired Bluetooth/USB printer nahi mila.",
                "कोई पेयर्ड Bluetooth/USB प्रिंटर नहीं मिला।"
            )
            list.addView(bsEmptyState(
                tx("No printer found", "Printer nahi mila", "प्रिंटर नहीं मिला"),
                tx("Pair Bluetooth in Android Settings or connect USB.", "Android Settings mein Bluetooth pair karo ya USB connect karo.", "Android Settings में Bluetooth पेयर करें या USB कनेक्ट करें।")
            ))
            return
        }
        status.text = tx("${devices.size} printer(s) found", "${devices.size} printer(s) mile", "${devices.size} प्रिंटर मिले")
        devices.forEach { device -> addDevice(device, btAdapter) }
    }

    private fun addDevice(device: PrinterDevice, btAdapter: android.bluetooth.BluetoothAdapter?) {
        val current = prefs.read()
        val selected = current?.id == device.id
        val card = bsCard(16)
        val top = LinearLayout(this).apply { orientation = LinearLayout.HORIZONTAL; gravity = Gravity.CENTER_VERTICAL }
        top.addView(bsIconBadge(if (device.transport == PrinterDevice.Transport.BLUETOOTH) "BT" else "USB"), LinearLayout.LayoutParams(bsDp(42), bsDp(42)).apply { marginEnd = bsDp(12) })
        val copy = LinearLayout(this).apply { orientation = LinearLayout.VERTICAL }
        copy.addView(bsText(device.name, 14.5f, LaunchColors.ink, true))
        copy.addView(bsText(device.transport.toString(), 10.5f, LaunchColors.muted).apply { setPadding(0, bsDp(3), 0, 0) })
        top.addView(copy, LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1f))
        if (selected) top.addView(bsText(tx("DEFAULT", "DEFAULT", "डिफ़ॉल्ट"), 9.5f, LaunchColors.green, true).apply {
            setPadding(bsDp(9), bsDp(6), bsDp(9), bsDp(6))
            background = bsRounded(LaunchColors.softGreen, 99)
        })
        card.addView(top)

        val choose = LinearLayout(this).apply { orientation = LinearLayout.HORIZONTAL; weightSum = 2f; setPadding(0, bsDp(12), 0, 0) }
        choose.addView(bsSecondaryButton(tx("Use 58mm", "58mm Use Karo", "58mm चुनें")) { saveDefault(device, PaperProfile.THERMAL_58MM) }, LinearLayout.LayoutParams(0, bsDp(44), 1f).apply { marginEnd = bsDp(5) })
        choose.addView(bsSecondaryButton(tx("Use 80mm", "80mm Use Karo", "80mm चुनें")) { saveDefault(device, PaperProfile.THERMAL_80MM) }, LinearLayout.LayoutParams(0, bsDp(44), 1f).apply { marginStart = bsDp(5) })
        card.addView(choose)

        val tests = LinearLayout(this).apply { orientation = LinearLayout.HORIZONTAL; weightSum = 2f; setPadding(0, bsDp(8), 0, 0) }
        tests.addView(bsGhostButton("Test 58mm") { test(device, PaperProfile.THERMAL_58MM, btAdapter) }, LinearLayout.LayoutParams(0, bsDp(44), 1f).apply { marginEnd = bsDp(5) })
        tests.addView(bsGhostButton("Test 80mm") { test(device, PaperProfile.THERMAL_80MM, btAdapter) }, LinearLayout.LayoutParams(0, bsDp(44), 1f).apply { marginStart = bsDp(5) })
        card.addView(tests)

        list.addView(card, LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT).apply { bottomMargin = bsDp(9) })
    }

    private fun saveDefault(device: PrinterDevice, paper: PaperProfile) {
        prefs.save(device, paper)
        status.text = tx("Default saved: ${device.name} · ${paper.widthMm}mm", "Default save ho gaya: ${device.name} · ${paper.widthMm}mm", "डिफ़ॉल्ट सेव हुआ: ${device.name} · ${paper.widthMm}mm")
        refresh()
    }

    private fun ensureUsbPermission(device: PrinterDevice): Boolean {
        if (device.transport != PrinterDevice.Transport.USB) return true
        val manager = getSystemService(Context.USB_SERVICE) as UsbManager
        val usb = manager.deviceList.values.firstOrNull { it.deviceName == device.id } ?: return false
        if (manager.hasPermission(usb)) return true
        val pending = PendingIntent.getBroadcast(this, 71, Intent("com.brandspire.pos.USB_PERMISSION"), PendingIntent.FLAG_IMMUTABLE)
        manager.requestPermission(usb, pending)
        status.text = tx("USB permission requested. Allow it, then tap Test again.", "USB permission maangi gayi hai. Allow karke Test dobara tap karo.", "USB अनुमति मांगी गई है। अनुमति देकर टेस्ट फिर से दबाएँ।")
        return false
    }

    private fun test(device: PrinterDevice, paper: PaperProfile, btAdapter: android.bluetooth.BluetoothAdapter?) {
        if (!ensureUsbPermission(device)) return
        status.text = tx("Connecting to ${device.name}…", "${device.name} se connect ho raha hai…", "${device.name} से कनेक्ट हो रहा है…")
        scope.launch {
            val result = withContext(Dispatchers.IO) {
                val adapter = if (device.transport == PrinterDevice.Transport.BLUETOOTH) BluetoothPrinterAdapter(btAdapter)
                else UsbPrinterAdapter(getSystemService(Context.USB_SERVICE) as UsbManager)
                val connected = adapter.connect(device)
                if (!connected.success) return@withContext connected
                val bytes = EscPosEncoder(paper).initialize().alignCenter().bold(true)
                    .line("BRANDSPIRE POS").bold(false).line("Printer Test")
                    .divider().line("${paper.widthMm}mm thermal profile")
                    .line("If readable, ESC/POS works.").feed(4).partialCut().bytes()
                val printed = adapter.print(bytes)
                adapter.disconnect()
                printed
            }
            status.text = if (result.success) tx("Test print sent successfully.", "Test print successfully send ho gaya.", "टेस्ट प्रिंट सफलतापूर्वक भेजा गया।")
            else tx("Test failed: ${result.message}", "Test fail hua: ${result.message}", "टेस्ट विफल: ${result.message}")
        }
    }

    private fun tx(en: String, hg: String, hi: String) = MobileText.get(language, en, hg, hi)
}
