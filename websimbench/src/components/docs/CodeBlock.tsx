import type { DocsCodeSnippet } from '@/docs/types';
import Prism from 'prismjs';
import 'prismjs/components/prism-clike';
import 'prismjs/components/prism-javascript';
import 'prismjs/components/prism-typescript';
import 'prismjs/components/prism-markup';
import 'prismjs/components/prism-bash';
import 'prismjs/components/prism-json';
import 'prismjs/themes/prism-dark.css';

interface CodeBlockProps {
  snippet: DocsCodeSnippet;
}

if (!(Prism.languages as Record<string, unknown>).dsl) {
  (Prism.languages as Record<string, unknown>).dsl = Prism.languages.extend('javascript', {
    keyword: /\b(input|var|if|else|for|foreach|as|species|moveForward|turn|borderWrapping|borderBounce|limitSpeed|updatePosition|deposit|sense|neighbors|mean|random|enableTrails|avoidObstacles|print)\b/,
  });
}

const languageMap: Record<DocsCodeSnippet['language'], string> = {
  bash: 'bash',
  ts: 'typescript',
  js: 'javascript',
  html: 'markup',
  dsl: 'dsl',
  json: 'json',
};

export const CodeBlock = ({ snippet }: CodeBlockProps) => {
  const prismLanguage = languageMap[snippet.language] ?? 'javascript';
  const grammar = Prism.languages[prismLanguage] ?? Prism.languages.javascript;
  const highlighted = Prism.highlight(snippet.code, grammar, prismLanguage);

  return (
    <div className="rounded-lg border border-white/10 bg-black/40 overflow-hidden">
      <div className="px-3 py-2 border-b border-white/10 flex items-center justify-between bg-black/30">
        <span className="text-[11px] font-semibold uppercase tracking-wide text-gray-300">
          {snippet.title}
        </span>
        <span className="text-[10px] uppercase tracking-wide text-gray-500">
          {snippet.language}
        </span>
      </div>
      <pre className={`text-xs leading-relaxed p-3 overflow-x-auto language-${prismLanguage}`}>
        <code
          className={`language-${prismLanguage}`}
          dangerouslySetInnerHTML={{ __html: highlighted }}
        />
      </pre>
    </div>
  );
};
