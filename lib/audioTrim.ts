export interface SpeechDurationInput {
  recordingStartedAt: number;
  silenceStartedAt: number | null;
  stoppedAt: number;
}

export function resolveSpeechDurationMs({
  recordingStartedAt,
  silenceStartedAt,
  stoppedAt,
}: SpeechDurationInput): number {
  const effectiveEndAt = silenceStartedAt !== null && silenceStartedAt > recordingStartedAt
    ? silenceStartedAt
    : stoppedAt;

  return Math.max(0, effectiveEndAt - recordingStartedAt);
}

export function resolveTrimmedFrameCount(
  totalFrames: number,
  sampleRate: number,
  durationMs: number
): number {
  if (totalFrames <= 0 || sampleRate <= 0 || durationMs <= 0) {
    return 0;
  }

  return Math.min(totalFrames, Math.max(1, Math.floor((sampleRate * durationMs) / 1000)));
}
