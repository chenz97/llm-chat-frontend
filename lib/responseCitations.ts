import type { UrlCitation } from '@/types';
import { unified } from 'unified';
import remarkParse from 'remark-parse';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';

const sourceLinkParser = unified().use(remarkParse).use(remarkGfm).use(remarkMath);

interface MarkdownNode {
  type: string;
  url?: string;
  identifier?: string;
  children?: MarkdownNode[];
  position?: { start: { offset?: number }; end: { offset?: number } };
}

function existingSourceLinks(text: string): Array<{ url: string; start: number; end: number }> {
  const nodes: MarkdownNode[] = [];
  const visit = (node: MarkdownNode) => {
    nodes.push(node);
    node.children?.forEach(visit);
  };
  visit(sourceLinkParser.parse(text));
  const definitions = new Map(nodes.filter((node) => node.type === 'definition')
    .map((node) => [node.identifier?.toLowerCase(), node.url]));

  return nodes.flatMap((node) => {
    const url = node.type === 'link' ? node.url : node.type === 'linkReference'
      ? definitions.get(node.identifier?.toLowerCase()) : undefined;
    const start = node.position?.start.offset;
    const end = node.position?.end.offset;
    if (!url || start === undefined || end === undefined) return [];
    try {
      return [{ url: new URL(url).href, start, end }];
    } catch {
      return [];
    }
  });
}

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
  if (citations.length === 0) return text;
  const existingLinks = existingSourceLinks(text);
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
    const hasExistingLink = existingLinks.some((existing) => {
      if (existing.url !== url.href) return false;
      const gap = existing.end < citation.startIndex
        ? text.slice(existing.end, citation.startIndex)
        : citation.endIndex < existing.start ? text.slice(citation.endIndex, existing.start) : '';
      return /^[\s()[\],.;:]*$/.test(gap);
    });
    if (hasExistingLink) {
      if (!sharesRange) result += text.slice(cursor, citation.startIndex) + label;
      cursor = citation.endIndex;
      previousStart = citation.startIndex;
      previousEnd = citation.endIndex;
      continue;
    }
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
