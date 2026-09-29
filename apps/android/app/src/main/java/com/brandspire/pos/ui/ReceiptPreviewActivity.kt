package com.brandspire.pos.ui

import android.app.Activity
import android.graphics.Color
import android.graphics.Typeface
import android.os.Bundle
import android.view.Gravity
import android.view.ViewGroup
import android.widget.LinearLayout
import android.widget.ScrollView
import android.widget.TextView
import com.brandspire.pos.data.OfflineDatabase
import com.brandspire.pos.printer.PaperProfile
import com.brandspire.pos.printer.PrinterPreferences
import com.brandspire.pos.printer.ReceiptPrinter

class ReceiptPreviewActivity : Activity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        bsApplyWindowChrome()
        val language = MobileText.language(intent.getStringExtra("language"))
        val id = intent.getStringExtra("client_invoice_id").orEmpty()
        val bill = OfflineDatabase(this).localBill(id) ?: run { finish(); return }
        val paper = PrinterPreferences(this).read()?.paper ?: PaperProfile.THERMAL_58MM
        val preview = ReceiptPrinter.receiptBytes(bill, paper)
            .toString(Charsets.UTF_8)
            .replace(Regex("[\\u0000-\\u001F&&[^\\n]]"), "")

        val scroll = ScrollView(this).apply { setBackgroundColor(LaunchColors.bg); clipToPadding = false }
        val root = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            setPadding(bsDp(20), bsDp(20), bsDp(20), bsDp(34))
        }
        scroll.addView(root)
        setContentView(scroll)

        root.addView(bsTopBar(
            MobileText.get(language, "Receipt Preview", "Receipt Preview", "रसीद प्रीव्यू"),
            "${paper.widthMm}mm · ESC/POS"
        ) { finish() })

        val paperWrap = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            gravity = Gravity.CENTER_HORIZONTAL
            setPadding(bsDp(18), bsDp(20), bsDp(18), bsDp(20))
            background = bsRounded(Color.rgb(238, 241, 246), 22)
        }
        val receipt = TextView(this).apply {
            text = preview
            typeface = Typeface.MONOSPACE
            textSize = if (paper == PaperProfile.THERMAL_58MM) 12.5f else 12f
            setTextColor(Color.rgb(20, 20, 20))
            setBackgroundColor(Color.WHITE)
            setPadding(bsDp(18), bsDp(20), bsDp(18), bsDp(24))
            gravity = Gravity.START
            elevation = bsDp(3).toFloat()
        }
        paperWrap.addView(receipt, LinearLayout.LayoutParams(
            if (paper == PaperProfile.THERMAL_58MM) bsDp(260) else ViewGroup.LayoutParams.MATCH_PARENT,
            ViewGroup.LayoutParams.WRAP_CONTENT
        ))
        root.addView(paperWrap, LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT).apply { topMargin = bsDp(16) })

        root.addView(bsTintCard(LaunchColors.softBlue, Color.rgb(218, 226, 252), 15).apply {
            addView(bsText(MobileText.get(language, "Preview only", "Sirf preview", "केवल प्रीव्यू"), 11f, LaunchColors.blue, true))
            addView(bsText(
                MobileText.get(language,
                    "Actual alignment can vary slightly by printer firmware. Use Printer Setup → Test Print for the physical device.",
                    "Actual alignment printer firmware ke hisaab se thoda vary kar sakta hai. Physical device ke liye Printer Setup → Test Print use karo.",
                    "वास्तविक अलाइनमेंट प्रिंटर फर्मवेयर के अनुसार थोड़ा बदल सकता है। फिजिकल डिवाइस के लिए Printer Setup → Test Print उपयोग करें।"
                ),
                11.5f,
                LaunchColors.muted
            ).apply { setPadding(0, bsDp(5), 0, 0) })
        }, LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT).apply { topMargin = bsDp(14) })
    }
}
