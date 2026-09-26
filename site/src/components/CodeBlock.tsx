import { useState } from 'react';
import { CheckIcon, CopyIcon } from './Icons';

type Language = 'tsx' | 'ts' | 'bash';

const escape = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

const KEYWORDS = /\b(import|from|export|const|let|var|new|function|return|default|as|type|interface|await|async|if|else|true|false|null|undefined)\b/g;

/** Small regex highlighter: enough for install lines and short TS/TSX snippets. */
export function highlight(code: string, language: Language): string {
  const src = escape(code);
  if (language === 'bash') {
    return src
      .split('\n')
      .map((line) => line.replace(/^(\s*)(npm|npx|pnpm|yarn|bun)(\s+\w+)?/, '$1<span class="tok-keyword">$2</span><span class="tok-fn">$3</span>'))
      .join('\n');
  }
  // Order matters: comments and strings first so their contents are never re-tokenised.
  const pattern = /(\/\/[^\n]*|\/\*[\s\S]*?\*\/)|('(?:[^'\\]|\\.)*'|"(?:[^"\\]|\\.)*"|`(?:[^`\\]|\\.)*`)|(&lt;\/?)([A-Z][\w.]*|[a-z][\w-]*)|\b([a-zA-Z_$][\w$]*)(?==)|(\b\d+(?:\.\d+)?\b)|(\b(?:import|from|export|const|let|var|new|function|return|default|as|type|interface|await|async|if|else|true|false|null|undefined)\b)/g;
  return src.replace(pattern, (m, comment, str, tagOpen, tagName, attr, num, kw) => {
    if (comment) return `<span class="tok-comment">${comment}</span>`;
    if (str) return `<span class="tok-string">${str}</span>`;
    if (tagOpen) return `${tagOpen}<span class="tok-tag">${tagName}</span>`;
    if (attr) return `<span class="tok-attr">${attr}</span>`;
    if (num) return `<span class="tok-number">${num}</span>`;
    if (kw) return `<span class="tok-keyword">${kw}</span>`;
    return m;
  });
}

export function CodeBlock({ code, language = 'tsx', compact = false }: { code: string; language?: Language; compact?: boolean }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch {
      /* clipboard unavailable (insecure context); nothing to do */
    }
  };
  return (
    <div className={`code${compact ? ' code--compact' : ''}`}>
      <pre>
        <code dangerouslySetInnerHTML={{ __html: highlight(code, language) }} />
      </pre>
      <button type="button" className="code__copy" onClick={copy} aria-label={copied ? 'Copied' : 'Copy to clipboard'}>
        {copied ? <CheckIcon /> : <CopyIcon />}
      </button>
    </div>
  );
}

// keep the keyword list referenced for editors that fold the regex above
void KEYWORDS;
