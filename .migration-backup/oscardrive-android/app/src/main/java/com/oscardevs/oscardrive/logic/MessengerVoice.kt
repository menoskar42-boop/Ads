package com.oscardevs.oscardrive.logic

data class MessengerMessageRequest(val recipient: String, val body: String)

/**
 * Parses a confirmed, local speech transcript into a Messenger recipient and draft.
 * It never searches contacts or sends a message; the Messenger app handles account lookup
 * and requires the user to press Send.
 */
object MessengerVoice {
    private val patterns = listOf(
        Regex(
            """^(?:ابعت(?:لي)?|ابعث(?:لي)?|ارسل(?:ي)?)\s+(?:(?:لي)\s+)?(?:رساله|رسالة|مسج|message|text)\s+(?:إلى|الى|لـ?|to)\s*(.+?)\s+(?:that says|بتقول|تقول|قول|نصها|محتواها|بيقول|saying|says)\s+([\s\S]+)$""",
            RegexOption.IGNORE_CASE,
        ),
        Regex(
            """^(?:send\s+)?(?:a\s+)?(?:message|text|رساله|رسالة|مسج)\s+(?:to|إلى|الى|لـ?)\s*(.+?)\s+(?:that says|saying|says|بتقول|تقول|قول)\s+([\s\S]+)$""",
            RegexOption.IGNORE_CASE,
        ),
        Regex(
            """^(?:رساله|رسالة|مسج)\s+(?:إلى|الى|لـ?)\s*(.+?)\s+(?:that says|بتقول|تقول|قول|نصها|محتواها|saying|says)\s+([\s\S]+)$""",
            RegexOption.IGNORE_CASE,
        ),
    )
    private val commandStarters = setOf(
        "ابعت", "ابعتلي", "ابعث", "ابعثلي", "ارسل", "ارسلي", "ارسللي",
        "send", "message", "text", "رساله", "مسج",
    )

    fun parse(
        transcript: String,
        wakeNames: List<String> = VoiceCatalog.DEFAULT_WAKE,
        wakeAlreadyConfirmed: Boolean = false,
    ): MessengerMessageRequest? {
        val command = commandAfterWake(transcript, wakeNames, wakeAlreadyConfirmed) ?: return null
        val match = patterns.firstNotNullOfOrNull { it.matchEntire(command.trim()) } ?: return null
        val recipient = match.groupValues[1]
            .trim()
            .replace(Regex("""[،,:;.!؟?]+$"""), "")
            .trim()
        val body = match.groupValues[2].trim()
        if (recipient.length !in 2..80 || body.isBlank() || body.length > 2000) return null
        return MessengerMessageRequest(recipient, body)
    }

    private fun commandAfterWake(
        transcript: String,
        wakeNames: List<String>,
        wakeAlreadyConfirmed: Boolean,
    ): String? {
        val raw = transcript.trim()
        if (raw.isEmpty()) return null

        val aliases = (wakeNames + VoiceCatalog.DEFAULT_WAKE)
            .map { VoiceEngine.normalize(it).split(' ').filter { word -> word.isNotBlank() } }
            .filter { it.isNotEmpty() }
            .distinct()
            .sortedByDescending { it.size }
        val rawTokens = Regex("""\S+""").findAll(raw).toList()
        val normalizedTokens = rawTokens.map { VoiceEngine.normalize(it.value) }
        val commandStart = normalizedTokens.indexOfFirst { it in commandStarters }

        for (start in rawTokens.indices) {
            for (alias in aliases) {
                val end = start + alias.size
                if (commandStart >= 0 && end > commandStart) continue
                if (end > rawTokens.size || normalizedTokens.subList(start, end) != alias) continue
                val afterWake = raw.substring(rawTokens[end - 1].range.last + 1)
                    .trimStart()
                    .trimStart { it in "،,:;.!؟?-" }
                    .trim()
                return afterWake
            }
        }

        return raw.takeIf { wakeAlreadyConfirmed }
    }
}
