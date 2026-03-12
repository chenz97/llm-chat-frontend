'use client';

import type { ComponentPropsWithoutRef } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';
import rehypeHighlight from 'rehype-highlight';
import 'katex/dist/katex.min.css';
import 'highlight.js/styles/github-dark.css';

interface MarkdownRendererProps {
  content: string;
  className?: string;
}

function isEscaped(text: string, index: number): boolean {
  let backslashes = 0;
  for (let i = index - 1; i >= 0 && text[i] === '\\'; i--) {
    backslashes++;
  }
  return backslashes % 2 === 1;
}

function replaceMathDelimitersInLine(line: string): string {
  let result = '';
  let i = 0;
  let inCode = false;
  let codeTickCount = 0;

  while (i < line.length) {
    const ch = line[i];
    if (ch === '`') {
      let tickCount = 1;
      while (i + tickCount < line.length && line[i + tickCount] === '`') {
        tickCount++;
      }
      if (!inCode) {
        inCode = true;
        codeTickCount = tickCount;
      } else if (tickCount === codeTickCount) {
        inCode = false;
        codeTickCount = 0;
      }
      result += '`'.repeat(tickCount);
      i += tickCount;
      continue;
    }

    if (!inCode) {
      if (line.startsWith('\\(', i) && !isEscaped(line, i)) {
        result += '$';
        i += 2;
        continue;
      }
      if (line.startsWith('\\)', i) && !isEscaped(line, i)) {
        result += '$';
        i += 2;
        continue;
      }
      if (line.startsWith('\\[', i) && !isEscaped(line, i)) {
        result += '$$';
        i += 2;
        continue;
      }
      if (line.startsWith('\\]', i) && !isEscaped(line, i)) {
        result += '$$';
        i += 2;
        continue;
      }
    }

    result += ch;
    i++;
  }

  return result;
}

function normalizeMathDelimiters(source: string): string {
  const lines = source.split('\n');
  const output: string[] = [];
  let inFence = false;
  let fenceChar = '';
  let fenceLength = 0;

  for (const line of lines) {
    const fenceMatch = line.match(/^ {0,3}(`{3,}|~{3,})/);
    if (fenceMatch) {
      const marker = fenceMatch[1];
      if (!inFence) {
        inFence = true;
        fenceChar = marker[0];
        fenceLength = marker.length;
        output.push(line);
        continue;
      }
      if (marker[0] === fenceChar && marker.length >= fenceLength) {
        inFence = false;
        fenceChar = '';
        fenceLength = 0;
        output.push(line);
        continue;
      }
    }

    if (inFence) {
      output.push(line);
      continue;
    }

    output.push(replaceMathDelimitersInLine(line));
  }

  return output.join('\n');
}

export default function MarkdownRenderer({ content, className = '' }: MarkdownRendererProps) {
  return (
    <div className={`markdown-body prose prose-invert max-w-none ${className}`.trim()}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm, remarkMath]}
        rehypePlugins={[rehypeKatex, rehypeHighlight]}
        components={{
          code({
            inline,
            className,
            children,
            ...props
          }: ComponentPropsWithoutRef<'code'> & { inline?: boolean }) {
            return inline ? (
              <code className="px-1.5 py-0.5 bg-slate-100 text-slate-900 rounded-md text-sm" {...props}>
                {children}
              </code>
            ) : (
              <code className={className} {...props}>
                {children}
              </code>
            );
          },
          pre({ children, ...props }: ComponentPropsWithoutRef<'pre'>) {
            return (
              <pre className="bg-slate-900 rounded-lg p-4 overflow-x-auto" {...props}>
                {children}
              </pre>
            );
          },
          a({ children, href, ...props }: ComponentPropsWithoutRef<'a'>) {
            return (
              <a
                href={href}
                target="_blank"
                rel="noopener noreferrer"
                className="text-blue-400 hover:text-blue-300 underline"
                {...props}
              >
                {children}
              </a>
            );
          },
        }}
      >
        {normalizeMathDelimiters(content)}
      </ReactMarkdown>
    </div>
  );
}
