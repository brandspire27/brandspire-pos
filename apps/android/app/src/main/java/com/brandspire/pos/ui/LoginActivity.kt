package com.brandspire.pos.ui

import android.app.Activity
import android.content.Intent
import android.graphics.Color
import android.graphics.Typeface
import android.os.Bundle
import android.view.Gravity
import android.view.View
import android.view.ViewGroup
import android.widget.LinearLayout
import android.widget.ProgressBar
import android.widget.ScrollView
import android.widget.TextView
import com.brandspire.pos.auth.SecureSessionStore
import com.brandspire.pos.network.SupabaseHttpClient
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext

class LoginActivity : Activity() {
    private val scope = CoroutineScope(Dispatchers.Main)

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        bsApplyWindowChrome()
        val api = SupabaseHttpClient()

        val scroll = ScrollView(this).apply {
            isFillViewport = true
            setBackgroundColor(LaunchColors.bg)
        }
        val root = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            gravity = Gravity.CENTER_HORIZONTAL
            setPadding(bsDp(24), bsDp(56), bsDp(24), bsDp(36))
        }
        scroll.addView(root, ViewGroup.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT))

        root.addView(bsLogoMark(58), LinearLayout.LayoutParams(bsDp(58), bsDp(58)).apply { gravity = Gravity.CENTER_HORIZONTAL })
        root.addView(bsText("Brandspire POS", 30f, LaunchColors.ink, true).apply {
            gravity = Gravity.CENTER
            setPadding(0, bsDp(18), 0, bsDp(7))
        })
        root.addView(bsText("Simple Billing. Smarter Business.", 14f, LaunchColors.muted).apply {
            gravity = Gravity.CENTER
            setPadding(0, 0, 0, bsDp(30))
        })

        val card = bsCard(20)
        card.addView(bsText("Welcome back", 22f, LaunchColors.ink, true))
        card.addView(bsText("Sign in to continue to your secure workspace.", 13f, LaunchColors.muted).apply {
            setPadding(0, bsDp(6), 0, bsDp(20))
        })

        card.addView(bsText("Email", 12f, LaunchColors.muted, true).apply { setPadding(0, 0, 0, bsDp(7)) })
        val email = bsInput("you@business.com").apply {
            inputType = android.text.InputType.TYPE_CLASS_TEXT or android.text.InputType.TYPE_TEXT_VARIATION_EMAIL_ADDRESS
        }
        card.addView(email, LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, bsDp(54)))

        card.addView(bsText("Password", 12f, LaunchColors.muted, true).apply { setPadding(0, bsDp(16), 0, bsDp(7)) })
        val password = bsInput("Enter your password", true)
        card.addView(password, LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, bsDp(54)))

        val status = bsText("", 12.5f, LaunchColors.red).apply {
            visibility = View.GONE
            setPadding(0, bsDp(12), 0, 0)
        }
        card.addView(status)

        val progress = ProgressBar(this).apply { visibility = View.GONE }
        val button = bsPrimaryButton("Sign in") { }
        card.addView(button, LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, bsDp(54)).apply { topMargin = bsDp(18) })
        card.addView(progress, LinearLayout.LayoutParams(bsDp(34), bsDp(34)).apply {
            gravity = Gravity.CENTER_HORIZONTAL
            topMargin = bsDp(12)
        })

        root.addView(card, LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT))
        root.addView(bsText("Owner and Staff use their individual Brandspire POS credentials.", 11.5f, LaunchColors.muted).apply {
            gravity = Gravity.CENTER
            setPadding(bsDp(12), bsDp(18), bsDp(12), 0)
        })
        setContentView(scroll)

        fun showError(message: String) {
            status.text = message
            status.visibility = View.VISIBLE
        }

        if (!api.isConfigured()) {
            showError("Android Supabase configuration is missing.")
        }

        button.setOnClickListener {
            if (email.text.isBlank() || password.text.isBlank()) {
                showError("Email aur password enter karo.")
                return@setOnClickListener
            }
            button.isEnabled = false
            button.text = "Signing in…"
            progress.visibility = View.VISIBLE
            status.visibility = View.GONE
            scope.launch {
                val result = withContext(Dispatchers.IO) {
                    runCatching { api.signIn(email.text.toString().trim(), password.text.toString()) }
                }
                progress.visibility = View.GONE
                button.isEnabled = true
                button.text = "Sign in"
                result.onSuccess { session ->
                    SecureSessionStore(this@LoginActivity).save(session)
                    startActivity(Intent(this@LoginActivity, HomeActivity::class.java))
                    finish()
                }.onFailure { showError(it.message ?: "Login failed") }
            }
        }
    }
}
