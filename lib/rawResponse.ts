// Diagnostics must stay bounded independently of the generated answer/media.
export const RAW_RESPONSE_MAX_CHARS = 64 * 1024;
export const RAW_RESPONSE_TRUNCATION_NOTICE = '\n[原始响应日志已截断；完整回复和音频仍保留在消息中。]';

export function createRawResponseCapture(limit = RAW_RESPONSE_MAX_CHARS) {
  const chunks: string[] = [];
  let length = 0;
  let truncated = false;
  return {
    append(value: string) {
      if (truncated) return;
      const separator = length > 0 ? '\n' : '';
      const remaining = Math.max(0, limit - length);
      const chunk = (separator + value).slice(0, remaining);
      if (chunk) chunks.push(chunk);
      length += chunk.length;
      truncated = separator.length + value.length > remaining;
    },
    value(): string | undefined {
      if (!length && !truncated) return undefined;
      return chunks.join('') + (truncated ? RAW_RESPONSE_TRUNCATION_NOTICE : '');
    },
  };
}

export function serializeAudioDiagnostic(response: unknown): string {
  return JSON.stringify(response, (key, value) => {
    // Omit only audio payloads without modifying the actual playback data.
    if (key === 'audio' && value && typeof value === 'object' && !Array.isArray(value)) {
      const audio = value as Record<string, unknown>;
      if (typeof audio.data === 'string') {
        return { ...audio, data: `[音频数据已省略：${audio.data.length} 个 base64 字符]` };
      }
    }
    return value;
  });
}
