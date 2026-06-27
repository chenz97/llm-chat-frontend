const WAV_HEADER_BYTES = 44;
const PCM_BYTES_PER_SAMPLE = 2;
const MONO_CHANNEL_COUNT = 1;
const MIN_VAD_SEGMENT_MS = 100;

export function calculatePcmDurationMs(samples: Float32Array, sampleRate: number): number {
  if (sampleRate <= 0 || samples.length === 0) {
    return 0;
  }

  return Math.round((samples.length / sampleRate) * 1000);
}

export function shouldSubmitVadSegment(samples: Float32Array, sampleRate: number): boolean {
  if (sampleRate <= 0) {
    return false;
  }

  return samples.length >= Math.ceil((sampleRate * MIN_VAD_SEGMENT_MS) / 1000);
}

export function float32PcmToWavBuffer(samples: Float32Array, sampleRate: number): ArrayBuffer {
  const dataSize = samples.length * PCM_BYTES_PER_SAMPLE;
  const buffer = new ArrayBuffer(WAV_HEADER_BYTES + dataSize);
  const view = new DataView(buffer);

  const writeString = (offset: number, value: string) => {
    for (let index = 0; index < value.length; index += 1) {
      view.setUint8(offset + index, value.charCodeAt(index));
    }
  };

  writeString(0, 'RIFF');
  view.setUint32(4, 36 + dataSize, true);
  writeString(8, 'WAVE');
  writeString(12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, MONO_CHANNEL_COUNT, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * MONO_CHANNEL_COUNT * PCM_BYTES_PER_SAMPLE, true);
  view.setUint16(32, MONO_CHANNEL_COUNT * PCM_BYTES_PER_SAMPLE, true);
  view.setUint16(34, 16, true);
  writeString(36, 'data');
  view.setUint32(40, dataSize, true);

  let offset = WAV_HEADER_BYTES;
  for (const sample of samples) {
    const clamped = Math.max(-1, Math.min(1, sample));
    view.setInt16(offset, clamped < 0 ? clamped * 0x8000 : clamped * 0x7fff, true);
    offset += PCM_BYTES_PER_SAMPLE;
  }

  return buffer;
}
