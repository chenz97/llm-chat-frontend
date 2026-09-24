'use client';

import { Check, Copy } from 'lucide-react';
import { isValidElement, memo, useState } from 'react';
import type { ComponentPropsWithoutRef, ReactNode } from 'react';
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

function extractTextFromNode(node: ReactNode): string {
  if (typeof node === 'string' || typeof node === 'number') {
    return String(node);
  }

  if (Array.isArray(node)) {
    return node.map(extractTextFromNode).join('');
  }

  if (isValidElement<{ children?: ReactNode }>(node)) {
    return extractTextFromNode(node.props.children);
  }

  return '';
}

async function copyTextToClipboard(text: string): Promise<void> {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(text);
    return;
  }

  const textArea = document.createElement('textarea');
  textArea.value = text;
  textArea.setAttribute('readonly', '');
  textArea.style.position = 'fixed';
  textArea.style.left = '-9999px';
  textArea.style.top = '0';
  document.body.appendChild(textArea);
  textArea.select();

  try {
    document.execCommand('copy');
  } finally {
    document.body.removeChild(textArea);
  }
}

function CodeBlock({
  children,
  ...props
}: ComponentPropsWithoutRef<'pre'>) {
  const [didCopy, setDidCopy] = useState(false);
  const codeText = extractTextFromNode(children).replace(/\n$/, '');

  const handleCopy = async () => {
    if (!codeText) {
      return;
    }

    await copyTextToClipboard(codeText);
    setDidCopy(true);
    window.setTimeout(() => setDidCopy(false), 1600);
  };

  return (
    <div className="markdown-code-block group">
      <button
        type="button"
        className="markdown-code-copy-button"
        onClick={handleCopy}
        disabled={!codeText}
        aria-label={didCopy ? 'Code copied' : 'Copy code'}
        title={didCopy ? 'Copied' : 'Copy code'}
      >
        {didCopy ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
      </button>
      <pre className="bg-slate-900 rounded-lg p-4 overflow-x-auto" {...props}>
        {children}
      </pre>
    </div>
  );
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

function MarkdownRenderer({ content, className = '' }: MarkdownRendererProps) {
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
            return <CodeBlock {...props}>{children}</CodeBlock>;
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

export default memo(MarkdownRenderer);
