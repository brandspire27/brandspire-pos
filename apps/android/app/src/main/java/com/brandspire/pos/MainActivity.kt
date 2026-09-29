package com.brandspire.pos

import android.app.Activity
import android.content.Intent
import android.os.Bundle
import com.brandspire.pos.auth.SecureSessionStore
import com.brandspire.pos.ui.HomeActivity
import com.brandspire.pos.ui.LoginActivity

class MainActivity : Activity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        val session = SecureSessionStore(this).read()
        val target = if (session?.accessToken.isNullOrBlank()) LoginActivity::class.java else HomeActivity::class.java
        startActivity(Intent(this, target))
        finish()
    }
}
