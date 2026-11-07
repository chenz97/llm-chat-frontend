import type { UrlCitation } from '@/types';

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function extractResponseCitations(response: unknown): UrlCitation[] {
  if (!isRecord(response) || !Array.isArray(response.output)) return [];

  const citations: UrlCitation[] = [];
  let offset = 0;

  for (const item of response.output) {
    if (!isRecord(item) || item.type !== 'message' || !Array.isArray(item.content)) continue;

    for (const part of item.content) {
      if (!isRecord(part)) continue;
      if (part.type === 'refusal' && typeof part.refusal === 'string') {
        offset += part.refusal.length;
        continue;
      }
      if (part.type !== 'output_text' || typeof part.text !== 'string') continue;

      for (const annotation of Array.isArray(part.annotations) ? part.annotations : []) {
        if (
          !isRecord(annotation) || annotation.type !== 'url_citation'
          || typeof annotation.start_index !== 'number' || !Number.isInteger(annotation.start_index)
          || typeof annotation.end_index !== 'number' || !Number.isInteger(annotation.end_index)
          || annotation.start_index < 0 || annotation.end_index < annotation.start_index
          || annotation.end_index > part.text.length || typeof annotation.url !== 'string'
        ) continue;

        citations.push({
          startIndex: offset + annotation.start_index,
          endIndex: offset + annotation.end_index,
          url: annotation.url,
          title: typeof annotation.title === 'string' ? annotation.title : '',
        });
      }

      offset += part.text.length;
    }
  }

  return citations;
}

export function formatResponseCitations(text: string, citations: UrlCitation[] = []): string {
  let result = '';
  let cursor = 0;
  let citationNumber = 0;
  let previousStart = -1;
  let previousEnd = -1;

  for (const citation of [...citations].sort((a, b) => a.startIndex - b.startIndex)) {
    const sharesRange = citation.startIndex === previousStart && citation.endIndex === previousEnd;
    if (
      !Number.isInteger(citation.startIndex) || !Number.isInteger(citation.endIndex)
      || (citation.startIndex < cursor && !sharesRange) || citation.endIndex < citation.startIndex
      || citation.endIndex > text.length
    ) continue;

    let url: URL;
    try {
      url = new URL(citation.url);
    } catch {
      continue;
    }
    if (url.protocol !== 'https:' && url.protocol !== 'http:') continue;

    const href = url.href.replace(/[<>"\\]/g, (character) => encodeURIComponent(character));
    const title = citation.title.replace(/\s+/g, ' ').replace(/["\\]/g, '\\$&');
    const original = text.slice(citation.startIndex, citation.endIndex);
    const label = original.replace(/\uE200cite\uE202[\s\S]*?\uE201/g, '');
    citationNumber += 1;
    const link = `[[${citationNumber}]](<${href}>${title ? ` "${title}"` : ''})`;
    if (sharesRange) {
      result += ` ${link}`;
      continue;
    }
    result += text.slice(cursor, citation.startIndex) + label;
    result += label === original && label ? ` ${link}` : link;
    cursor = citation.endIndex;
    previousStart = citation.startIndex;
    previousEnd = citation.endIndex;
  }

  return result + text.slice(cursor);
}
