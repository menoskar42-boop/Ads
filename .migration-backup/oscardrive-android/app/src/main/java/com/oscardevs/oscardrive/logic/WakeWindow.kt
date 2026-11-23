package com.oscardevs.oscardrive.logic

fun calledNow(button: Boolean, now: Long, awaitingUntil: Long, partialWakeUntil: Long): Boolean =
    button || now < awaitingUntil || now < partialWakeUntil
