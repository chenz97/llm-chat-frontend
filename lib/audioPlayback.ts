import type { AudioRecord } from '../types/index.ts';

const CHUNK_SIZE = 32768;

export function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  const chunks: string[] = [];
  for (let offset = 0; offset < bytes.length; offset += CHUNK_SIZE) {
    chunks.push(String.fromCharCode(...bytes.subarray(offset, offset + CHUNK_SIZE)));
  }
  return btoa(chunks.join(''));
}

export function createAudioPlaybackBlob(
  record: Pick<AudioRecord, 'data' | 'mimeType' | 'format'>,
  sampleRate = 24000
): Blob {
  const comma = record.data.indexOf(',');
  const payload = comma >= 0 ? record.data.slice(comma + 1) : record.data;
  const parts: BlobPart[] = [];
  let byteLength = 0;
  for (let offset = 0; offset < payload.length; offset += CHUNK_SIZE) {
    const binary = atob(payload.slice(offset, offset + CHUNK_SIZE));
    const bytes = new Uint8Array(binary.length);
    for (let index = 0; index < binary.length; index++) bytes[index] = binary.charCodeAt(index);
    byteLength += bytes.length;
    parts.push(bytes);
  }
  if (record.format !== 'pcm16') return new Blob(parts, { type: record.mimeType });

  const header = new ArrayBuffer(44);
  const view = new DataView(header);
  const writeString = (offset: number, value: string) => {
    for (let index = 0; index < value.length; index++) view.setUint8(offset + index, value.charCodeAt(index));
  };
  writeString(0, 'RIFF');
  view.setUint32(4, 36 + byteLength, true);
  writeString(8, 'WAVE');
  writeString(12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  writeString(36, 'data');
  view.setUint32(40, byteLength, true);
  return new Blob([header, ...parts], { type: 'audio/wav' });
}
