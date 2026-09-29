package com.brandspire.pos.ui

import android.app.Activity
import android.graphics.Color
import android.os.Bundle
import android.view.Gravity
import android.view.ViewGroup
import android.widget.LinearLayout
import android.widget.ScrollView
import android.widget.TextView

class OfflineHelpActivity : Activity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        bsApplyWindowChrome()
        val language = MobileText.language(intent.getStringExtra("language"))
        fun tx(en: String, hg: String, hi: String) = MobileText.get(language, en, hg, hi)

        val scroll = ScrollView(this).apply { setBackgroundColor(LaunchColors.bg); clipToPadding = false }
        val root = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            setPadding(bsDp(20), bsDp(20), bsDp(20), bsDp(34))
        }
        scroll.addView(root)
        setContentView(scroll)

        root.addView(bsTopBar(
            "Brandspire Assist",
            tx("Offline product help for billing, printing and daily tasks.", "Billing, printing aur daily kaam ke liye offline help.", "बिलिंग, प्रिंटिंग और दैनिक काम के लिए ऑफलाइन सहायता।")
        ) { finish() })

        val hero = LinearLayout(this).apply {
            orientation = LinearLayout.HORIZONTAL
            gravity = Gravity.CENTER_VERTICAL
            setPadding(bsDp(18), bsDp(18), bsDp(18), bsDp(18))
            background = bsGradient(LaunchColors.navy, LaunchColors.blueDark, 20)
        }
        hero.addView(bsIconBadge("?", true), LinearLayout.LayoutParams(bsDp(48), bsDp(48)).apply { marginEnd = bsDp(13) })
        val heroCopy = LinearLayout(this).apply { orientation = LinearLayout.VERTICAL }
        heroCopy.addView(bsText(tx("Ask without internet", "Internet ke bina bhi poochho", "इंटरनेट के बिना भी पूछें"), 17f, Color.WHITE, true))
        heroCopy.addView(bsText(tx("Choose a quick topic below. Answers stay on-device.", "Neeche quick topic choose karo. Answers device par hi hain.", "नीचे कोई विषय चुनें। उत्तर डिवाइस पर ही रहते हैं।"), 11.5f, Color.rgb(205, 215, 233)).apply { setPadding(0, bsDp(4), 0, 0) })
        hero.addView(heroCopy, LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1f))
        root.addView(hero, LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT).apply { topMargin = bsDp(16) })

        root.addView(bsSection(tx("Quick help", "Quick help", "त्वरित सहायता")))
        val answerCard = bsCard(17)
        answerCard.addView(bsText(tx("How can I help?", "Main kis cheez mein help karu?", "मैं किसमें मदद करूं?"), 15f, LaunchColors.ink, true))
        val answer = bsText(
            tx("Select a topic below and Brandspire Assist will explain the steps.", "Neeche topic choose karo, Brandspire Assist steps samjha dega.", "नीचे विषय चुनें, Brandspire Assist चरण समझाएगा।"),
            12f,
            LaunchColors.muted
        ).apply { setPadding(0, bsDp(6), 0, 0) }
        answerCard.addView(answer)
        root.addView(answerCard)

        val topics = listOf(
            tx("How do I create a bill?", "Bill kaise banao?", "बिल कैसे बनाएं?") to tx(
                "Open Create Bill → choose a customer if needed → add products → choose quantity and payment → save the bill. Printing/sharing comes after the bill is saved.",
                "Create Bill kholo → customer optional select karo → products add karo → quantity/payment choose karo → bill save karo. Bill save hone ke baad print/share hota hai.",
                "Create Bill खोलें → जरूरत हो तो ग्राहक चुनें → उत्पाद जोड़ें → मात्रा और भुगतान चुनें → बिल सेव करें। बिल सेव होने के बाद प्रिंट/शेयर करें।"
            ),
            tx("How do I add a customer?", "Customer kaise add karu?", "ग्राहक कैसे जोड़ें?") to tx(
                "Open Customers → enter name and optional phone/email → Save Customer. If you are offline, the customer is saved on this device and syncs safely when internet returns.",
                "Customers kholo → name aur optional phone/email bharo → Customer Save Karo. Offline ho to customer device par save hoga aur internet aane par safely sync ho jayega.",
                "Customers खोलें → नाम और वैकल्पिक फोन/ईमेल भरें → ग्राहक सेव करें। ऑफलाइन होने पर ग्राहक डिवाइस पर सेव होगा और इंटरनेट आने पर सुरक्षित रूप से सिंक हो जाएगा।"
            ),
            tx("How do I add a product?", "Product kaise add karu?", "उत्पाद कैसे जोड़ें?") to tx(
                "Open Products → enter name, selling price, GST, opening stock and optional barcode/SKU → Save Product. Offline-created products stay in the local queue and sync later. Staff and Owner can add products, but Staff cannot perform destructive product actions.",
                "Products kholo → name, selling price, GST, opening stock aur optional barcode/SKU bharo → Product Save Karo. Offline product local queue mein safe rahega aur baad mein sync hoga. Staff destructive product actions nahi kar sakta.",
                "Products खोलें → नाम, बिक्री मूल्य, GST, शुरुआती स्टॉक और वैकल्पिक बारकोड/SKU भरें → उत्पाद सेव करें। ऑफलाइन बनाया गया उत्पाद स्थानीय कतार में सुरक्षित रहेगा और बाद में सिंक होगा। Staff destructive product actions नहीं कर सकता।"
            ),
            tx("How do I connect a printer?", "Printer connect kaise karu?", "प्रिंटर कैसे कनेक्ट करें?") to tx(
                "Open Printer Setup. Pair a Bluetooth printer in Android Settings first, or connect a USB printer and allow permission. Run a 58mm/80mm Test Print.",
                "Printer Setup kholo. Bluetooth printer ko pehle Android Settings mein pair karo; USB printer connect karke permission allow karo. 58mm/80mm Test Print run karo.",
                "Printer Setup खोलें। Bluetooth प्रिंटर को पहले Android Settings में पेयर करें या USB प्रिंटर कनेक्ट करके अनुमति दें। 58mm/80mm टेस्ट प्रिंट चलाएं।"
            ),
            tx("What works offline?", "Offline mein kya chalega?", "ऑफलाइन में क्या चलेगा?") to tx(
                "Cached products/customers, new offline customers/products, pending bills and failed print jobs remain on the device. Sync Center safely sends customers → products → invoices when internet returns.",
                "Cached products/customers, naye offline customers/products, pending bills aur failed print jobs device par safe rahte hain. Internet aane par Sync Center customers → products → invoices ko safely sync karta hai.",
                "कैश किए गए उत्पाद/ग्राहक, नए ऑफलाइन ग्राहक/उत्पाद, लंबित बिल और विफल प्रिंट जॉब डिवाइस पर सुरक्षित रहते हैं। इंटरनेट आने पर Sync Center ग्राहक → उत्पाद → इनवॉइस को सुरक्षित रूप से सिंक करता है।"
            ),
            tx("What can Staff do?", "Staff kya kar sakta hai?", "Staff क्या कर सकता है?") to tx(
                "Staff is an operational role: add customers, add products and create bills. Staff cannot manage settings, subscriptions, other staff or destructive actions.",
                "Staff operational role hai: customer add, product add aur bill create. Staff settings, subscription, staff management ya destructive actions nahi kar sakta.",
                "Staff एक operational role है: ग्राहक जोड़ना, उत्पाद जोड़ना और बिल बनाना। Staff settings, subscription, staff management या destructive actions नहीं कर सकता।"
            )
        )

        topics.forEachIndexed { index, (q, a) ->
            val icon = listOf("₹", "CU", "PR", "P", "↻", "ST")[index]
            root.addView(bsInfoRow(icon, q, tx("Tap for steps", "Steps ke liye tap karo", "चरणों के लिए टैप करें")) { answer.text = a }, LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT).apply {
                topMargin = if (index == 0) bsDp(10) else bsDp(8)
            })
        }

        root.addView(bsTintCard(Color.rgb(249, 250, 252), LaunchColors.border, 15).apply {
            addView(bsText(tx("Offline by design", "Offline by design", "ऑफलाइन के लिए बनाया गया"), 11f, LaunchColors.blue, true))
            addView(bsText(tx(
                "This help content is built into Brandspire POS. No cloud AI or business data is required for these answers.",
                "Ye help Brandspire POS ke andar built-in hai. In answers ke liye cloud AI ya business data ki zaroorat nahi.",
                "यह सहायता Brandspire POS में ही शामिल है। इन उत्तरों के लिए क्लाउड AI या बिज़नेस डेटा की आवश्यकता नहीं है।"
            ), 11.5f, LaunchColors.muted).apply { setPadding(0, bsDp(5), 0, 0) })
        }, LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT).apply { topMargin = bsDp(14) })
    }
}
