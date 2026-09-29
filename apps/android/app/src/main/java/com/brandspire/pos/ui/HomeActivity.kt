package com.brandspire.pos.ui

import android.app.Activity
import android.content.Intent
import android.graphics.Color
import android.os.Bundle
import android.view.Gravity
import android.view.ViewGroup
import android.widget.FrameLayout
import android.widget.LinearLayout
import android.widget.ScrollView
import android.widget.TextView
import android.widget.Toast
import com.brandspire.pos.alerts.AlertEngine
import com.brandspire.pos.auth.SecureSessionStore
import com.brandspire.pos.auth.Workspace
import com.brandspire.pos.auth.WorkspaceCache
import com.brandspire.pos.data.OfflineDatabase
import com.brandspire.pos.network.SupabaseHttpClient
import com.brandspire.pos.network.PlatformApiClient
import com.brandspire.pos.sync.SyncScheduler
import com.brandspire.pos.sync.isOnline
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import java.time.Instant

class HomeActivity : Activity() {
    private val scope = CoroutineScope(Dispatchers.Main)
    private lateinit var rootContent: LinearLayout
    private lateinit var statusPill: TextView

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        bsApplyWindowChrome()
        renderLoading()
        loadWorkspace()
        checkReleasePolicy()
        SyncScheduler.schedulePeriodic(this)
    }

    private fun checkReleasePolicy() {
        if (!isOnline()) return
        scope.launch {
            val policy = withContext(Dispatchers.IO) { runCatching { PlatformApiClient().fetchReleasePolicy() }.getOrNull() }
            if (policy != null && !isFinishing) ReleaseGate.show(this@HomeActivity, policy)
        }
    }

    private fun renderLoading() {
        val frame = FrameLayout(this).apply { setBackgroundColor(LaunchColors.bg) }
        val card = bsCard(24).apply {
            gravity = Gravity.CENTER_HORIZONTAL
            addView(bsLogoMark(62), LinearLayout.LayoutParams(bsDp(62), bsDp(62)).apply { gravity = Gravity.CENTER_HORIZONTAL })
            addView(bsText("Brandspire POS", 25f, LaunchColors.ink, true).apply {
                gravity = Gravity.CENTER
                setPadding(0, bsDp(18), 0, bsDp(6))
            })
            addView(bsText("Preparing your secure workspace", 13f, LaunchColors.muted).apply { gravity = Gravity.CENTER })
            val barTrack = LinearLayout(this@HomeActivity).apply { background = bsRounded(Color.rgb(233, 238, 248), 99) }
            barTrack.addView(TextView(this@HomeActivity).apply { background = bsRounded(LaunchColors.blue, 99) }, LinearLayout.LayoutParams(bsDp(132), bsDp(5)))
            addView(barTrack, LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, bsDp(5)).apply { topMargin = bsDp(22) })
        }
        frame.addView(card, FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT, Gravity.CENTER).apply {
            marginStart = bsDp(28); marginEnd = bsDp(28)
        })
        setContentView(frame)
    }

    private fun loadWorkspace() {
        val store = SecureSessionStore(this)
        val workspaceCache = WorkspaceCache(this)
        var session = store.read()
        if (session == null) { logout(); return }

        if (!isOnline()) {
            val cached = workspaceCache.read()
            if (cached != null) render(cached, session!!.accessToken)
            else renderOfflineOnly("Internet unavailable and no saved workspace is available yet.")
            return
        }

        scope.launch {
            val api = SupabaseHttpClient()
            val result = withContext(Dispatchers.IO) {
                runCatching {
                    if (session!!.expiresAtEpochSeconds <= Instant.now().epochSecond + 60) {
                        session = api.refresh(session!!.refreshToken)
                        store.save(session!!)
                    }
                    api.getWorkspace(session!!.accessToken)
                }
            }
            result.onSuccess {
                workspaceCache.save(it)
                render(it, session!!.accessToken)
            }.onFailure {
                val cached = workspaceCache.read()
                if (cached != null) render(cached, session!!.accessToken) else renderOfflineOnly(it.message)
            }
        }
    }

    private fun render(workspace: Workspace, accessToken: String) {
        val frame = FrameLayout(this).apply { setBackgroundColor(LaunchColors.bg) }
        val scroll = ScrollView(this).apply { setBackgroundColor(LaunchColors.bg); clipToPadding = false }
        rootContent = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            setPadding(bsDp(20), bsDp(20), bsDp(20), bsDp(104))
        }
        scroll.addView(rootContent)
        frame.addView(scroll)
        setContentView(frame)

        val brandRow = LinearLayout(this).apply { orientation = LinearLayout.HORIZONTAL; gravity = Gravity.CENTER_VERTICAL }
        brandRow.addView(bsLogoMark(44), LinearLayout.LayoutParams(bsDp(44), bsDp(44)).apply { marginEnd = bsDp(12) })
        val brandCopy = LinearLayout(this).apply { orientation = LinearLayout.VERTICAL }
        brandCopy.addView(bsText("Brandspire POS", 16f, LaunchColors.ink, true))
        brandCopy.addView(bsText(
            if (workspace.role == "OWNER") MobileText.get(workspace.preferredLanguage, "OWNER WORKSPACE", "OWNER WORKSPACE", "मालिक वर्कस्पेस")
            else MobileText.get(workspace.preferredLanguage, "STAFF WORKSPACE", "STAFF WORKSPACE", "स्टाफ वर्कस्पेस"),
            9.5f, LaunchColors.muted, true
        ).apply { letterSpacing = .12f })
        brandRow.addView(brandCopy, LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1f))
        statusPill = bsPill(
            if (isOnline()) MobileText.get(workspace.preferredLanguage, "ONLINE", "ONLINE", "ऑनलाइन")
            else MobileText.get(workspace.preferredLanguage, "OFFLINE", "OFFLINE", "ऑफलाइन"),
            isOnline()
        )
        brandRow.addView(statusPill)
        rootContent.addView(brandRow)

        val hero = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            setPadding(bsDp(20), bsDp(20), bsDp(20), bsDp(20))
            background = bsGradient(LaunchColors.navy, LaunchColors.blueDark, 24)
        }
        hero.addView(bsText(workspace.organizationName, 28f, Color.WHITE, true))
        hero.addView(bsText(greeting(workspace.preferredLanguage, workspace.role), 13f, Color.rgb(203, 213, 230)).apply { setPadding(0, bsDp(6), 0, bsDp(16)) })
        val chipRow = LinearLayout(this).apply { orientation = LinearLayout.HORIZONTAL; gravity = Gravity.CENTER_VERTICAL }
        chipRow.addView(bsText(workspace.role, 10f, Color.WHITE, true).apply {
            setPadding(bsDp(10), bsDp(6), bsDp(10), bsDp(6)); background = bsRounded(Color.argb(42,255,255,255), 99)
        })
        chipRow.addView(bsText(subscriptionLine(workspace), 10f, Color.rgb(220, 226, 238), true).apply {
            setPadding(bsDp(10), 0, 0, 0)
        })
        hero.addView(chipRow)
        rootContent.addView(hero, LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT).apply { topMargin = bsDp(20) })

        val db = OfflineDatabase(this)
        val statRow = LinearLayout(this).apply { orientation = LinearLayout.HORIZONTAL; weightSum = 3f }
        statRow.addView(statCard(MobileText.get(workspace.preferredLanguage, "Products", "Products", "उत्पाद"), db.cachedProductCount(workspace.organizationId).toString()), LinearLayout.LayoutParams(0, bsDp(88), 1f).apply { marginEnd = bsDp(8) })
        statRow.addView(statCard(MobileText.get(workspace.preferredLanguage, "Customers", "Customers", "ग्राहक"), db.cachedCustomerCount(workspace.organizationId).toString()), LinearLayout.LayoutParams(0, bsDp(88), 1f).apply { marginEnd = bsDp(8) })
        statRow.addView(statCard(MobileText.get(workspace.preferredLanguage, "Pending", "Pending", "लंबित"), db.pendingCount().toString()), LinearLayout.LayoutParams(0, bsDp(88), 1f))
        rootContent.addView(statRow, LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, bsDp(88)).apply { topMargin = bsDp(12) })

        rootContent.addView(bsSection(MobileText.get(workspace.preferredLanguage, "Counter", "Counter", "काउंटर")))
        val billing = LinearLayout(this).apply {
            orientation = LinearLayout.HORIZONTAL
            gravity = Gravity.CENTER_VERTICAL
            setPadding(bsDp(18), bsDp(18), bsDp(18), bsDp(18))
            background = bsGradient(Color.rgb(47, 89, 225), Color.rgb(69, 104, 234), 22)
            isClickable = true
            isFocusable = true
            contentDescription = MobileText.get(workspace.preferredLanguage, "Create Bill", "Bill Banao", "बिल बनाएं")
        }
        billing.addView(bsIconBadge("₹", true), LinearLayout.LayoutParams(bsDp(46), bsDp(46)).apply { marginEnd = bsDp(14) })
        val billCopy = LinearLayout(this).apply { orientation = LinearLayout.VERTICAL }
        billCopy.addView(bsText(MobileText.get(workspace.preferredLanguage, "Create Bill", "Bill Banao", "बिल बनाएं"), 20f, Color.WHITE, true))
        billCopy.addView(bsText(MobileText.get(workspace.preferredLanguage, "Fast billing with barcode, offline queue and printing.", "Barcode, offline queue aur printing ke saath fast billing.", "बारकोड, ऑफलाइन कतार और प्रिंटिंग के साथ तेज़ बिलिंग।"), 11.5f, Color.rgb(225, 231, 247)).apply { setPadding(0, bsDp(4), 0, 0) })
        billing.addView(billCopy, LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1f))
        billing.addView(bsText("→", 22f, Color.WHITE, true))
        billing.setOnClickListener {
            startActivity(Intent(this, CreateBillActivity::class.java).apply {
                putExtra("organization_id", workspace.organizationId)
                putExtra("organization_name", workspace.organizationName)
                putExtra("role", workspace.role)
                putExtra("language", workspace.preferredLanguage)
            })
        }
        rootContent.addView(billing)

        rootContent.addView(bsSection(MobileText.get(workspace.preferredLanguage, "Daily Operations", "Daily Operations", "दैनिक कार्य")))
        addActionGrid(workspace, accessToken)

        if (workspace.role == "OWNER") {
            rootContent.addView(bsSection(MobileText.get(workspace.preferredLanguage, "Owner Controls", "Owner Controls", "मालिक नियंत्रण")))
            addOwnerGrid(workspace)
        }

        AlertEngine.publishSystemSummary(this, workspace)

        rootContent.addView(bsDangerButton(MobileText.get(workspace.preferredLanguage, "Log out", "Logout", "लॉग आउट")) { logout() }, LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, bsDp(50)).apply { topMargin = bsDp(22) })

        val bottomNav = bsBottomNav(
            listOf(
                bsBottomNavItem("⌂", MobileText.get(workspace.preferredLanguage, "Home", "Home", "होम"), true) { },
                bsBottomNavItem("₹", MobileText.get(workspace.preferredLanguage, "Bill", "Bill", "बिल")) {
                    startActivity(Intent(this, CreateBillActivity::class.java).apply {
                        putExtra("organization_id", workspace.organizationId)
                        putExtra("organization_name", workspace.organizationName)
                        putExtra("role", workspace.role)
                        putExtra("language", workspace.preferredLanguage)
                    })
                },
                bsBottomNavItem("BI", MobileText.get(workspace.preferredLanguage, "Bills", "Bills", "बिल")) {
                    startActivity(Intent(this, BillsActivity::class.java).apply {
                        putExtra("organization_id", workspace.organizationId)
                        putExtra("language", workspace.preferredLanguage)
                    })
                },
                bsBottomNavItem("?", MobileText.get(workspace.preferredLanguage, "Assist", "Assist", "सहायता")) {
                    startActivity(Intent(this, OfflineHelpActivity::class.java).apply {
                        putExtra("language", workspace.preferredLanguage)
                    })
                }
            )
        )
        frame.addView(bottomNav, FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, bsDp(72), Gravity.BOTTOM).apply {
            marginStart = bsDp(14)
            marginEnd = bsDp(14)
            bottomMargin = bsDp(10)
        })
    }

    private fun addActionGrid(workspace: Workspace, accessToken: String) {
        val rows = mutableListOf<List<ActionItem>>()
        rows += listOf(
            ActionItem("CU", MobileText.get(workspace.preferredLanguage, "Customers", "Customers", "ग्राहक"), MobileText.get(workspace.preferredLanguage, "Add & search", "Add & search", "जोड़ें और खोजें")) {
                startActivity(Intent(this, CustomersActivity::class.java).apply { putExtra("organization_id", workspace.organizationId); putExtra("language", workspace.preferredLanguage) })
            },
            ActionItem("PR", MobileText.get(workspace.preferredLanguage, "Products", "Products", "उत्पाद"), MobileText.get(workspace.preferredLanguage, "Catalog & stock", "Catalog & stock", "कैटलॉग और स्टॉक")) {
                startActivity(Intent(this, ProductsActivity::class.java).apply { putExtra("organization_id", workspace.organizationId); putExtra("language", workspace.preferredLanguage) })
            }
        )
        rows += listOf(
            ActionItem("BI", MobileText.get(workspace.preferredLanguage, "Bills", "Bills", "बिल"), MobileText.get(workspace.preferredLanguage, "Recent & reprint", "Recent & reprint", "हाल के और रीप्रिंट")) {
                startActivity(Intent(this, BillsActivity::class.java).apply { putExtra("organization_id", workspace.organizationId); putExtra("language", workspace.preferredLanguage) })
            },
            ActionItem("↻", MobileText.get(workspace.preferredLanguage, "Sync Center", "Sync Center", "सिंक सेंटर"), MobileText.get(workspace.preferredLanguage, "Pending & failed", "Pending & failed", "लंबित और विफल")) {
                startActivity(Intent(this, SyncCenterActivity::class.java).apply {
                    putExtra("organization_id", workspace.organizationId)
                    putExtra("language", workspace.preferredLanguage)
                })
            }
        )
        rows += listOf(
            ActionItem("P", MobileText.get(workspace.preferredLanguage, "Printer", "Printer", "प्रिंटर"), "58mm · 80mm · USB · BT") {
                startActivity(Intent(this, PrinterSetupActivity::class.java).apply { putExtra("language", workspace.preferredLanguage) })
            },
            ActionItem("?", "Brandspire Assist", MobileText.get(workspace.preferredLanguage, "Offline help", "Offline help", "ऑफलाइन सहायता")) {
                startActivity(Intent(this, OfflineHelpActivity::class.java).apply { putExtra("language", workspace.preferredLanguage) })
            }
        )
        rows.forEach { addTileRow(it) }
    }

    private fun addOwnerGrid(workspace: Workspace) {
        listOf(
            listOf(
                ActionItem("₹", MobileText.get(workspace.preferredLanguage, "Dues", "Baaki", "बकाया"), MobileText.get(workspace.preferredLanguage, "Collect payments", "Payments lo", "भुगतान लें")) {
                    startActivity(Intent(this, DuesPaymentsActivity::class.java).apply { putExtra("organization_id", workspace.organizationId); putExtra("language", workspace.preferredLanguage) })
                },
                ActionItem("ST", MobileText.get(workspace.preferredLanguage, "Inventory", "Inventory", "इन्वेंटरी"), MobileText.get(workspace.preferredLanguage, "Stock in / out", "Stock in / out", "स्टॉक इन / आउट")) {
                    startActivity(Intent(this, InventoryManageActivity::class.java).apply { putExtra("organization_id", workspace.organizationId); putExtra("language", workspace.preferredLanguage) })
                }
            ),
            listOf(
                ActionItem("RP", MobileText.get(workspace.preferredLanguage, "Reports", "Reports", "रिपोर्ट"), "7 · 30 · 90 days") {
                    startActivity(Intent(this, OwnerReportsActivity::class.java).apply { putExtra("organization_id", workspace.organizationId); putExtra("language", workspace.preferredLanguage) })
                },
                ActionItem("LG", MobileText.get(workspace.preferredLanguage, "Ledger", "Ledger", "खाता"), MobileText.get(workspace.preferredLanguage, "Customer history", "Customer history", "ग्राहक इतिहास")) {
                    startActivity(Intent(this, CustomerLedgerActivity::class.java).apply { putExtra("organization_id", workspace.organizationId); putExtra("language", workspace.preferredLanguage) })
                }
            ),
            listOf(
                ActionItem("!", MobileText.get(workspace.preferredLanguage, "Alerts", "Alerts", "अलर्ट"), MobileText.get(workspace.preferredLanguage, "Stock · sync · renewal", "Stock · sync · renewal", "स्टॉक · सिंक · नवीनीकरण")) {
                    startActivity(Intent(this, NotificationCenterActivity::class.java).also { AlertEngine.putWorkspace(it, workspace) })
                },
                ActionItem("↻", MobileText.get(workspace.preferredLanguage, "Sync Health", "Sync Health", "सिंक स्थिति"), MobileText.get(workspace.preferredLanguage, "Pending & failed items", "Pending & failed items", "लंबित और विफल आइटम")) {
                    startActivity(Intent(this, SyncCenterActivity::class.java).apply { putExtra("organization_id", workspace.organizationId); putExtra("language", workspace.preferredLanguage) })
                }
            )
        ).forEach { addTileRow(it) }
    }

    private data class ActionItem(val icon: String, val title: String, val subtitle: String, val action: () -> Unit)

    private fun addTileRow(items: List<ActionItem>) {
        val row = LinearLayout(this).apply { orientation = LinearLayout.HORIZONTAL; weightSum = 2f }
        items.forEachIndexed { index, item ->
            val card = bsCard(15).apply {
                minimumHeight = bsDp(118)
                isFocusable = true
                contentDescription = "${item.title}. ${item.subtitle}"
                addView(bsIconBadge(item.icon), LinearLayout.LayoutParams(bsDp(42), bsDp(42)))
                addView(bsText(item.title, 15f, LaunchColors.ink, true).apply { setPadding(0, bsDp(12), 0, bsDp(4)) })
                addView(bsText(item.subtitle, 11.5f, LaunchColors.muted))
                setOnClickListener { item.action() }
            }
            row.addView(card, LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1f).apply {
                if (index == 0) marginEnd = bsDp(8) else marginStart = bsDp(8)
                bottomMargin = bsDp(12)
            })
        }
        rootContent.addView(row)
    }

    private fun statCard(label: String, value: String): LinearLayout = bsCard(13).apply {
        gravity = Gravity.CENTER_VERTICAL
        addView(bsText(value, 21f, LaunchColors.ink, true))
        addView(bsText(label, 10.5f, LaunchColors.muted).apply { setPadding(0, bsDp(4), 0, 0) })
    }

    private fun syncCatalog(workspace: Workspace, accessToken: String) {
        statusPill.text = MobileText.get(workspace.preferredLanguage, "SYNCING", "SYNCING", "सिंक हो रहा है")
        scope.launch {
            val db = OfflineDatabase(this@HomeActivity)
            val result = withContext(Dispatchers.IO) {
                runCatching {
                    val api = SupabaseHttpClient()
                    db.cacheProducts(workspace.organizationId, api.fetchProducts(accessToken, workspace.organizationId))
                    db.cacheCustomers(workspace.organizationId, api.fetchCustomers(accessToken, workspace.organizationId))
                }
            }
            result.onSuccess {
                Toast.makeText(this@HomeActivity, MobileText.get(workspace.preferredLanguage, "Data updated", "Data update ho gaya", "डेटा अपडेट हो गया"), Toast.LENGTH_SHORT).show()
                render(workspace, accessToken)
            }.onFailure {
                statusPill.text = MobileText.get(workspace.preferredLanguage, "SYNC FAILED", "SYNC FAILED", "सिंक विफल")
                Toast.makeText(this@HomeActivity, it.message ?: "Sync failed", Toast.LENGTH_LONG).show()
            }
        }
    }

    private fun renderOfflineOnly(error: String?) {
        val root = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            gravity = Gravity.CENTER_HORIZONTAL
            setPadding(bsDp(24), bsDp(64), bsDp(24), bsDp(32))
            setBackgroundColor(LaunchColors.bg)
        }
        root.addView(bsLogoMark(58))
        root.addView(bsText("Offline workspace", 26f, LaunchColors.ink, true).apply { setPadding(0, bsDp(18), 0, bsDp(7)) })
        root.addView(bsText(error ?: "Internet unavailable. Cached work can continue.", 13f, LaunchColors.muted).apply { gravity = Gravity.CENTER })
        root.addView(bsCard(18).apply {
            addView(bsText("${OfflineDatabase(this@HomeActivity).pendingCount()}", 28f, LaunchColors.ink, true))
            addView(bsText("Pending bills remain safe on this device", 12f, LaunchColors.muted))
        }, LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT).apply { topMargin = bsDp(24) })
        root.addView(bsSecondaryButton("Printer Setup") { startActivity(Intent(this, PrinterSetupActivity::class.java).apply { putExtra("language", "hinglish") }) }, LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, bsDp(50)).apply { topMargin = bsDp(14) })
        root.addView(bsPrimaryButton("Brandspire Assist") { startActivity(Intent(this, OfflineHelpActivity::class.java).apply { putExtra("language", "hinglish") }) }, LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, bsDp(50)).apply { topMargin = bsDp(10) })
        setContentView(root)
    }

    private fun subscriptionLine(workspace: Workspace): String {
        val end = workspace.endsAt?.take(10)
        return if (end.isNullOrBlank()) workspace.subscriptionStatus else "${workspace.subscriptionStatus} · $end"
    }

    private fun greeting(language: String, role: String): String = when (language) {
        "hi" -> if (role == "OWNER") "आपका व्यवसाय, आपके नियंत्रण में।" else "तेज़ बिल बनाएं और काउंटर चलाएं।"
        "hinglish" -> if (role == "OWNER") "Aapka business, aapke control mein." else "Fast bill banao aur counter chalao."
        else -> if (role == "OWNER") "Your business, under your control." else "Fast billing for a smoother counter."
    }

    private fun logout() {
        SecureSessionStore(this).clear()
        WorkspaceCache(this).clear()
        startActivity(Intent(this, LoginActivity::class.java))
        finish()
    }
}
