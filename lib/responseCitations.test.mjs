import assert from 'node:assert/strict';
import test from 'node:test';

import { extractResponseCitations, formatResponseCitations } from './responseCitations.ts';

test('Responses citations retain offsets across message parts and ignore tool output', () => {
  const response = {
    output: [
      { type: 'web_search_call', action: { type: 'search' } },
      { type: 'reasoning', summary: [{ text: 'Reasoning' }] },
      { type: 'message', content: [{ type: 'output_text', text: 'Intro. ' }] },
      {
        type: 'message',
        content: [{
          type: 'output_text',
          text: 'News [source]',
          annotations: [
            { type: 'url_citation', start_index: 5, end_index: 13, url: 'https://example.com', title: 'News' },
            { type: 'file_citation', file_id: 'file-1' },
            { type: 'url_citation', start_index: -1, end_index: 3, url: 'https://example.com' },
            { type: 'url_citation', start_index: 0, end_index: 99, url: 'https://example.com' },
          ],
        }],
      },
    ],
  };
  assert.deepEqual(extractResponseCitations(response), [
    { startIndex: 12, endIndex: 20, url: 'https://example.com', title: 'News' },
  ]);
  assert.deepEqual(extractResponseCitations(undefined), []);
});

test('search citation markers become clickable Markdown links', () => {
  const marker = '\uE200cite\uE202turn0search0\uE201';
  const text = `Latest news. ${marker}`;
  const citations = [{
    startIndex: 13,
    endIndex: text.length,
    url: 'https://example.com/news',
    title: 'Daily "News"',
  }];
  assert.equal(
    formatResponseCitations(text, citations),
    'Latest news. [[1]](<https://example.com/news> "Daily \\"News\\"")'
  );
  assert.equal(formatResponseCitations(text), text);
});

test('citation links preserve cited prose and skip unsafe URLs and stale ranges', () => {
  const text = 'The launch is today.';
  const citation = { startIndex: 4, endIndex: 10, url: 'https://example.com', title: 'Source' };
  assert.equal(
    formatResponseCitations(text, [citation]),
    'The launch [[1]](<https://example.com/> "Source") is today.'
  );
  for (const override of [
    { url: 'javascript:alert(1)' },
    { url: 'data:text/html,hello' },
    { url: 'not a URL' },
    { startIndex: -1 },
    { endIndex: 100 },
  ]) {
    assert.equal(formatResponseCitations(text, [{ ...citation, ...override }]), text);
  }
});

test('a citation marker can link to multiple sources', () => {
  const text = '\uE200cite\uE202turn0search0\uE202turn0search1\uE201';
  const citations = ['https://one.example/', 'https://two.example/'].map((url) => ({
    startIndex: 0,
    endIndex: text.length,
    url,
    title: '',
  }));
  assert.equal(
    formatResponseCitations(text, citations),
    '[[1]](<https://one.example/>) [[2]](<https://two.example/>)'
  );
});
