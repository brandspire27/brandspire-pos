package com.brandspire.pos.printer

import java.math.BigDecimal

fun receiptQuantity(value: Double): String {
    require(value.isFinite() && value > 0) { "Invalid receipt quantity" }
    return BigDecimal.valueOf(value).stripTrailingZeros().toPlainString()
}
