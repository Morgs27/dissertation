import type { DocsCodeSnippet } from '@/docs/types';
import Prism from 'prismjs';
import 'prismjs/components/prism-clike';
import 'prismjs/components/prism-javascript';
import 'prismjs/components/prism-typescript';
import 'prismjs/components/prism-markup';
import 'prismjs/components/prism-bash';
import 'prismjs/components/prism-json';

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
    <div className="rounded-lg border border-white/[0.08] overflow-hidden bg-[#0c1317]">
      <div className="px-3.5 py-2 border-b border-white/[0.07] flex items-center justify-between bg-white/[0.02]">
        <span className="text-[11px] font-medium uppercase tracking-wide text-gray-400">
          {snippet.title}
        </span>
        <span className="text-[10px] uppercase tracking-wide text-gray-600 font-mono">
          {snippet.language}
        </span>
      </div>
      <pre className="text-[13px] leading-[1.7] p-4 overflow-x-auto m-0 bg-transparent">
        <code
          className="agentyx-code"
          dangerouslySetInnerHTML={{ __html: highlighted }}
        />
      </pre>
    </div>
  );
};
