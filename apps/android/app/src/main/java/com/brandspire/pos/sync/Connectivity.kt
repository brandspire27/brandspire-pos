package com.brandspire.pos.sync

import android.content.Context
import android.net.ConnectivityManager
import android.net.NetworkCapabilities

fun Context.isOnline(): Boolean {
    val manager = getSystemService(Context.CONNECTIVITY_SERVICE) as ConnectivityManager
    val network = manager.activeNetwork ?: return false
    val caps = manager.getNetworkCapabilities(network) ?: return false
    return caps.hasCapability(NetworkCapabilities.NET_CAPABILITY_INTERNET) &&
        caps.hasCapability(NetworkCapabilities.NET_CAPABILITY_VALIDATED)
}
