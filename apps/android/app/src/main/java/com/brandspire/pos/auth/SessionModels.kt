package com.brandspire.pos.auth

data class AuthSession(
    val accessToken: String,
    val refreshToken: String,
    val expiresAtEpochSeconds: Long,
    val userId: String,
    val email: String
)

data class Workspace(
    val organizationId: String,
    val organizationName: String,
    val role: String,
    val preferredLanguage: String,
    val subscriptionStatus: String,
    val endsAt: String?,
    val adminMessage: String?
)
