package com.oscardevs.oscardrive.logic

enum class WakeRecognitionAction { WAKE_ONLY, INLINE_COMMAND, NO_WAKE }

object WakeCapturePolicy {
    const val COMMAND_SILENCE_MS = 1_500L
    const val POSSIBLE_COMMAND_SILENCE_MS = 1_000L
    const val COMMAND_MAX_WAIT_MS = 10_000L

    fun action(transcripts: List<String>, engine: VoiceEngine): WakeRecognitionAction {
        val remaining = transcripts.mapNotNull { engine.afterWake(it) }
        return when {
            remaining.any { it.isNotBlank() } -> WakeRecognitionAction.INLINE_COMMAND
            remaining.isNotEmpty() -> WakeRecognitionAction.WAKE_ONLY
            else -> WakeRecognitionAction.NO_WAKE
        }
    }
}
