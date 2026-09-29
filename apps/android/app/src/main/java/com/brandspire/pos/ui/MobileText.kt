package com.brandspire.pos.ui

object MobileText {
    fun language(value: String?): String = when (value?.lowercase()) {
        "hi" -> "hi"
        "hinglish" -> "hinglish"
        else -> "en"
    }

    fun get(language: String?, english: String, hinglish: String, hindi: String): String = when (language(language)) {
        "hi" -> hindi
        "hinglish" -> hinglish
        else -> english
    }
}
