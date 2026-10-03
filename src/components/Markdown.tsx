import React, { useMemo } from 'react';

// ---------------------------------------------------------------------------
// Minimal, XSS-safe Markdown renderer for chat bubbles. It builds React
// elements directly (never innerHTML), so model output can never inject
// markup or scripts. Supports: headings (#-####), fenced code blocks, bold,
// italic, inline code, links (http/https/relative only), unordered & ordered
// lists, blockquotes and horizontal rules.
// ---------------------------------------------------------------------------

type Block =
  | { type: 'code'; lang: string; text: string }
  | { type: 'heading'; level: number; text: string }
  | { type: 'ul'; items: string[] }
  | { type: 'ol'; items: string[] }
  | { type: 'quote'; text: string }
  | { type: 'hr' }
  | { type: 'p'; text: string };

const HEADING_RE = /^(#{1,4})\s+(.*)$/;
const UL_RE = /^\s*[-*+]\s+/;
const OL_RE = /^\s*\d+[.)]\s+/;
const QUOTE_RE = /^\s*>\s?/;
const HR_RE = /^\s*(?:---|\*\*\*|___)\s*$/;
const FENCE_RE = /^\s*```/;

function isSpecialLine(line: string): boolean {
  return (
    FENCE_RE.test(line) ||
    HEADING_RE.test(line) ||
    UL_RE.test(line) ||
    OL_RE.test(line) ||
    QUOTE_RE.test(line) ||
    HR_RE.test(line)
  );
}

function parseBlocks(markdown: string): Block[] {
  const lines = markdown.replace(/\r\n?/g, '\n').split('\n');
  const blocks: Block[] = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];

    if (FENCE_RE.test(line)) {
      const lang = line.trim().replace(/^```+/, '').trim();
      const body: string[] = [];
      i++;
      while (i < lines.length && !FENCE_RE.test(lines[i])) {
        body.push(lines[i]);
        i++;
      }
      i++; // consume closing fence (or EOF)
      blocks.push({ type: 'code', lang, text: body.join('\n') });
      continue;
    }

    const heading = HEADING_RE.exec(line);
    if (heading) {
      blocks.push({ type: 'heading', level: heading[1].length, text: heading[2] });
      i++;
      continue;
    }

    if (HR_RE.test(line)) {
      blocks.push({ type: 'hr' });
      i++;
      continue;
    }

    if (UL_RE.test(line)) {
      const items: string[] = [];
      while (i < lines.length && UL_RE.test(lines[i])) {
        items.push(lines[i].replace(UL_RE, ''));
        i++;
      }
      blocks.push({ type: 'ul', items });
      continue;
    }

    if (OL_RE.test(line)) {
      const items: string[] = [];
      while (i < lines.length && OL_RE.test(lines[i])) {
        items.push(lines[i].replace(OL_RE, ''));
        i++;
      }
      blocks.push({ type: 'ol', items });
      continue;
    }

    if (QUOTE_RE.test(line)) {
      const body: string[] = [];
      while (i < lines.length && QUOTE_RE.test(lines[i])) {
        body.push(lines[i].replace(QUOTE_RE, ''));
        i++;
      }
      blocks.push({ type: 'quote', text: body.join('\n') });
      continue;
    }

    if (!line.trim()) {
      i++;
      continue;
    }

    const para: string[] = [];
    while (i < lines.length && lines[i].trim() && !isSpecialLine(lines[i])) {
      para.push(lines[i]);
      i++;
    }
    if (para.length) blocks.push({ type: 'p', text: para.join('\n') });
    else i++; // never stall
  }

  return blocks;
}

const INLINE_RE = /(\*\*[^*\n]+\*\*|`[^`\n]+`|\[[^\]\n]+\]\([^)\s]+\)|\*[^*\n]+\*)/g;

function renderInline(text: string, keyPrefix: string): React.ReactNode[] {
  const nodes: React.ReactNode[] = [];
  let last = 0;
  let index = 0;
  let match: RegExpExecArray | null;

  while ((match = INLINE_RE.exec(text)) !== null) {
    if (match.index > last) nodes.push(text.slice(last, match.index));
    const token = match[0];
    const key = `${keyPrefix}-t${index++}`;

    if (token.startsWith('**')) {
      nodes.push(
        <strong key={key} className="font-semibold text-white">
          {token.slice(2, -2)}
        </strong>
      );
    } else if (token.startsWith('`')) {
      nodes.push(
        <code
          key={key}
          className="rounded border border-cyan-400/10 bg-slate-800/80 px-1.5 py-0.5 font-mono text-[0.9em] text-cyan-200"
        >
          {token.slice(1, -1)}
        </code>
      );
    } else if (token.startsWith('[')) {
      const link = /^\[([^\]]+)\]\(([^)\s]+)\)$/.exec(token);
      if (link) {
        const href = link[2];
        // https://…, site paths (but NOT protocol-relative //host), #fragments, mailto.
        const safe = /^(https?:\/\/|\/(?!\/)|#|mailto:)/i.test(href) ? href : '#';
        nodes.push(
          <a
            key={key}
            href={safe}
            target="_blank"
            rel="noopener noreferrer nofollow"
            className="text-cyan-300 underline decoration-cyan-400/40 hover:decoration-cyan-300"
          >
            {link[1]}
          </a>
        );
      } else {
        nodes.push(token);
      }
    } else {
      nodes.push(
        <em key={key} className="italic text-slate-200">
          {token.slice(1, -1)}
        </em>
      );
    }

    last = match.index + token.length;
  }

  if (last < text.length) nodes.push(text.slice(last));
  return nodes;
}

export const Markdown: React.FC<{ text: string; className?: string }> = ({ text, className }) => {
  const blocks = useMemo(() => parseBlocks(text || ''), [text]);

  return (
    <div className={`space-y-2.5 ${className || ''}`}>
      {blocks.map((block, idx) => {
        const key = `blk${idx}`;
        switch (block.type) {
          case 'code':
            return (
              <div key={key} className="relative">
                {block.lang ? (
                  <span className="absolute right-2 top-2 rounded border border-white/5 bg-slate-800/80 px-1.5 py-0.5 font-mono text-[9px] uppercase tracking-wider text-slate-400">
                    {block.lang}
                  </span>
                ) : null}
                <pre className="overflow-x-auto rounded-xl border border-white/10 bg-slate-900/90 p-3 font-mono text-[11px] leading-relaxed text-slate-200">
                  <code>{block.text}</code>
                </pre>
              </div>
            );
          case 'heading':
            return (
              <p
                key={key}
                className={
                  block.level <= 2
                    ? 'pt-0.5 text-base font-bold tracking-wide text-white'
                    : 'pt-0.5 text-sm font-semibold text-slate-100'
                }
              >
                {renderInline(block.text, key)}
              </p>
            );
          case 'hr':
            return <hr key={key} className="border-white/10" />;
          case 'ul':
            return (
              <ul key={key} className="list-disc space-y-1 pl-5 text-slate-200">
                {block.items.map((item, j) => (
                  <li key={`${key}-${j}`}>{renderInline(item, `${key}-${j}`)}</li>
                ))}
              </ul>
            );
          case 'ol':
            return (
              <ol key={key} className="list-decimal space-y-1 pl-5 text-slate-200">
                {block.items.map((item, j) => (
                  <li key={`${key}-${j}`}>{renderInline(item, `${key}-${j}`)}</li>
                ))}
              </ol>
            );
          case 'quote':
            return (
              <blockquote key={key} className="border-l-2 border-cyan-400/40 pl-3 italic text-slate-300">
                {renderInline(block.text, key)}
              </blockquote>
            );
          default:
            return (
              <p key={key} className="whitespace-pre-wrap text-slate-200">
                {renderInline(block.text, key)}
              </p>
            );
        }
      })}
    </div>
  );
};
