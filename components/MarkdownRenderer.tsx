'use client';

import { Check, Copy } from 'lucide-react';
import { isValidElement, memo, useState } from 'react';
import type { ComponentPropsWithoutRef, ReactNode } from 'react';
import ReactMarkdown, { type Components, type ExtraProps } from 'react-markdown';
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

  const language = getCodeLanguage(children);

  return (
    <div className="markdown-code-block">
      <div className="markdown-code-header">
        <span>{language || 'code'}</span>
        <button
          type="button"
          className="markdown-code-copy-button"
          onClick={handleCopy}
          disabled={!codeText}
          aria-label={didCopy ? 'Code copied' : 'Copy code'}
          title={didCopy ? 'Copied' : 'Copy code'}
        >
          {didCopy ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
          <span>{didCopy ? 'Copied' : 'Copy'}</span>
        </button>
      </div>
      <pre {...props}>
        {children}
      </pre>
    </div>
  );
}

function getCodeLanguage(children: ReactNode): string {
  const codeElement = Array.isArray(children) ? children[0] : children;
  if (!isValidElement<{ className?: string }>(codeElement)) {
    return '';
  }
  const match = /(?:^|\s)language-([\w+#.-]+)/.exec(codeElement.props.className ?? '');
  return match ? match[1] : '';
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

const remarkPlugins = [remarkGfm, remarkMath];
const rehypePlugins = [rehypeKatex, rehypeHighlight];

// Strip the hast `node` prop so it is not spread onto DOM elements.
function omitNode<T extends ExtraProps>(props: T): Omit<T, 'node'> {
  const rest = { ...props };
  delete rest.node;
  return rest;
}

const markdownComponents: Components = {
  pre(props) {
    return <CodeBlock {...omitNode(props)} />;
  },
  table(props) {
    return (
      <div className="markdown-table-wrap">
        <table {...omitNode(props)} />
      </div>
    );
  },
  a(props) {
    return <a {...omitNode(props)} target="_blank" rel="noopener noreferrer" />;
  },
};

function MarkdownRenderer({ content, className = '' }: MarkdownRendererProps) {
  return (
    <div className={`markdown-body ${className}`.trim()}>
      <ReactMarkdown
        remarkPlugins={remarkPlugins}
        rehypePlugins={rehypePlugins}
        components={markdownComponents}
      >
        {normalizeMathDelimiters(content)}
      </ReactMarkdown>
    </div>
  );
}

export default memo(MarkdownRenderer);
