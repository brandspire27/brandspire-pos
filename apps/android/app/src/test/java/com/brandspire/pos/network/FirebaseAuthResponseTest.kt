package com.brandspire.pos.network

import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

class FirebaseAuthResponseTest {
    @Test
    fun parsesIdentityToolkitSignInResponse() {
        val session = """{"idToken":"firebase-id","refreshToken":"refresh","expiresIn":"3600","localId":"user-1","email":"owner@example.com"}"""
            .toAuthSession()

        assertEquals("firebase-id", session.accessToken)
        assertEquals("refresh", session.refreshToken)
        assertEquals("user-1", session.userId)
        assertEquals("owner@example.com", session.email)
    }

    @Test
    fun parsesSecureTokenRefreshResponse() {
        val session = """{"id_token":"firebase-id","refresh_token":"refresh","expires_in":"3600","user_id":"user-1","user_email":"owner@example.com"}"""
            .toAuthSession()

        assertEquals("firebase-id", session.accessToken)
        assertEquals("refresh", session.refreshToken)
        assertEquals("user-1", session.userId)
        assertEquals("owner@example.com", session.email)
    }

    @Test
    fun reportsMissingTokensClearly() {
        try {
            "{}".toAuthSession()
        } catch (error: IllegalStateException) {
            assertTrue(error.message.orEmpty().contains("ID token"))
            return
        }
        throw AssertionError("Expected missing ID token to be reported")
    }
}
