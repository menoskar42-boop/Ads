export type VoiceMessageDeleteCandidate = {
  sender_id: string;
  message_type: string;
  audio_content_type: string | null;
};

const SUPPORTED_VOICE_TYPES = new Set(["audio/mp4", "audio/webm"]);

export function canDeleteOwnVoiceMessage(
  message: VoiceMessageDeleteCandidate,
  userId: string,
): boolean {
  return (
    message.sender_id === userId &&
    message.message_type === "audio" &&
    message.audio_content_type !== null &&
    SUPPORTED_VOICE_TYPES.has(message.audio_content_type)
  );
}
