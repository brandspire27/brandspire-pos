package com.brandspire.pos.auth

import android.content.Context
import android.security.keystore.KeyGenParameterSpec
import android.security.keystore.KeyProperties
import android.util.Base64
import org.json.JSONObject
import java.security.KeyStore
import javax.crypto.Cipher
import javax.crypto.KeyGenerator
import javax.crypto.SecretKey
import javax.crypto.spec.GCMParameterSpec

/**
 * Stores Supabase session tokens encrypted with an Android Keystore AES/GCM key.
 * The Supabase service-role key must never be stored in this app.
 */
class SecureSessionStore(context: Context) {
    private val prefs = context.getSharedPreferences("brandspire_secure_session", Context.MODE_PRIVATE)
    private val alias = "brandspire_pos_session_key_v1"

    fun save(session: AuthSession) {
        val payload = JSONObject().apply {
            put("access_token", session.accessToken)
            put("refresh_token", session.refreshToken)
            put("expires_at", session.expiresAtEpochSeconds)
            put("user_id", session.userId)
            put("email", session.email)
        }.toString().toByteArray(Charsets.UTF_8)

        val cipher = Cipher.getInstance("AES/GCM/NoPadding")
        cipher.init(Cipher.ENCRYPT_MODE, getOrCreateKey())
        val encrypted = cipher.doFinal(payload)
        prefs.edit()
            .putString("iv", Base64.encodeToString(cipher.iv, Base64.NO_WRAP))
            .putString("payload", Base64.encodeToString(encrypted, Base64.NO_WRAP))
            .apply()
    }

    fun read(): AuthSession? = runCatching {
        val iv = Base64.decode(prefs.getString("iv", null) ?: return null, Base64.NO_WRAP)
        val encrypted = Base64.decode(prefs.getString("payload", null) ?: return null, Base64.NO_WRAP)
        val cipher = Cipher.getInstance("AES/GCM/NoPadding")
        cipher.init(Cipher.DECRYPT_MODE, getOrCreateKey(), GCMParameterSpec(128, iv))
        val json = JSONObject(String(cipher.doFinal(encrypted), Charsets.UTF_8))
        AuthSession(
            accessToken = json.getString("access_token"),
            refreshToken = json.getString("refresh_token"),
            expiresAtEpochSeconds = json.getLong("expires_at"),
            userId = json.getString("user_id"),
            email = json.optString("email")
        )
    }.getOrNull()

    fun clear() {
        prefs.edit().clear().apply()
    }

    private fun getOrCreateKey(): SecretKey {
        val keyStore = KeyStore.getInstance("AndroidKeyStore").apply { load(null) }
        (keyStore.getKey(alias, null) as? SecretKey)?.let { return it }

        val generator = KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES, "AndroidKeyStore")
        generator.init(
            KeyGenParameterSpec.Builder(
                alias,
                KeyProperties.PURPOSE_ENCRYPT or KeyProperties.PURPOSE_DECRYPT
            )
                .setBlockModes(KeyProperties.BLOCK_MODE_GCM)
                .setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE)
                .setKeySize(256)
                .build()
        )
        return generator.generateKey()
    }
}
