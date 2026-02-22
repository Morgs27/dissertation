import { useCallback, useEffect, useMemo, useState } from 'react';
import type { RunnableExample } from '@/docs/types';
import { Play, ArrowClockwise } from '@phosphor-icons/react';

interface ExamplesRunnerProps {
  examples: RunnableExample[];
}

const composeSrcDoc = (html: string, javascript: string): string => {
  const safeJavaScript = javascript.replace(/<\/script>/gi, '<\\/script>');

  const runtimeScript = `\n<script type="module">\ntry {\n${safeJavaScript}\n} catch (error) {\n  console.error(error);\n  const pre = document.createElement('pre');\n  pre.textContent = String(error);\n  pre.style.color = '#ff8a8a';\n  pre.style.whiteSpace = 'pre-wrap';\n  pre.style.padding = '12px';\n  document.body.appendChild(pre);\n}\n</script>\n`;

  if (html.includes('</body>')) {
    return html.replace('</body>', `${runtimeScript}</body>`);
  }

  return `${html}${runtimeScript}`;
};

export const ExamplesRunner = ({ examples }: ExamplesRunnerProps) => {
  const initialExample = examples[0];
  const [selectedExampleId, setSelectedExampleId] = useState(initialExample?.id ?? '');
  const [activeFile, setActiveFile] = useState<'js' | 'html'>('js');
  const [htmlCode, setHtmlCode] = useState(initialExample?.html ?? '');
  const [jsCode, setJsCode] = useState(initialExample?.javascript ?? '');
  const [srcDoc, setSrcDoc] = useState('');

  const selectedExample = useMemo(
    () => examples.find((example) => example.id === selectedExampleId) ?? examples[0],
    [examples, selectedExampleId],
  );

  const runCode = useCallback(() => {
    setSrcDoc(composeSrcDoc(htmlCode, jsCode));
  }, [htmlCode, jsCode]);

  const restorePreset = useCallback(() => {
    if (!selectedExample) return;
    setHtmlCode(selectedExample.html);
    setJsCode(selectedExample.javascript);
    setSrcDoc(composeSrcDoc(selectedExample.html, selectedExample.javascript));
  }, [selectedExample]);

  useEffect(() => {
    if (!selectedExample) return;
    setHtmlCode(selectedExample.html);
    setJsCode(selectedExample.javascript);
    setSrcDoc(composeSrcDoc(selectedExample.html, selectedExample.javascript));
    setActiveFile('js');
  }, [selectedExample]);

  if (!selectedExample) return null;

  const currentCode = activeFile === 'js' ? jsCode : htmlCode;
  const setCurrentCode = activeFile === 'js' ? setJsCode : setHtmlCode;

  return (
    <div className="space-y-5">
      {/* ---- Example tabs ---- */}
      <div className="flex flex-wrap gap-1.5">
        {examples.map((ex) => {
          const isSelected = ex.id === selectedExampleId;
          return (
            <button
              key={ex.id}
              onClick={() => setSelectedExampleId(ex.id)}
              className={`px-3.5 py-2 rounded-lg text-xs font-medium transition-all ${
                isSelected
                  ? 'bg-tropicalTeal/[0.12] text-tropicalTeal border border-tropicalTeal/30'
                  : 'text-gray-500 border border-white/[0.06] hover:text-gray-300 hover:border-white/[0.12] hover:bg-white/[0.02]'
              }`}
            >
              {ex.title}
            </button>
          );
        })}
      </div>

      {/* ---- Description ---- */}
      <p className="text-sm text-gray-400">{selectedExample.description}</p>

      {/* ---- Sandbox editor ---- */}
      <div className="rounded-xl border border-white/[0.08] overflow-hidden bg-[#0c1317]">
        {/* Toolbar: file tabs + actions */}
        <div className="flex items-center justify-between border-b border-white/[0.07] bg-white/[0.02]">
          <div className="flex">
            <button
              onClick={() => setActiveFile('js')}
              className={`px-4 py-2.5 text-xs font-mono transition-all border-b-2 ${
                activeFile === 'js'
                  ? 'text-white border-tropicalTeal bg-white/[0.03]'
                  : 'text-gray-500 border-transparent hover:text-gray-300'
              }`}
            >
              index.js
            </button>
            <button
              onClick={() => setActiveFile('html')}
              className={`px-4 py-2.5 text-xs font-mono transition-all border-b-2 ${
                activeFile === 'html'
                  ? 'text-white border-tropicalTeal bg-white/[0.03]'
                  : 'text-gray-500 border-transparent hover:text-gray-300'
              }`}
            >
              index.html
            </button>
          </div>

          <div className="flex items-center gap-1.5 pr-2">
            <button
              onClick={runCode}
              className="inline-flex items-center gap-1.5 h-7 rounded-md bg-tropicalTeal text-jetBlack px-3 text-[11px] font-bold hover:brightness-110 transition"
              type="button"
            >
              <Play size={12} weight="fill" />
              Run
            </button>
            <button
              onClick={restorePreset}
              className="inline-flex items-center gap-1.5 h-7 rounded-md border border-white/[0.1] bg-white/[0.03] text-gray-400 px-2.5 text-[11px] font-medium hover:text-white hover:bg-white/[0.06] transition"
              type="button"
            >
              <ArrowClockwise size={12} />
              Reset
            </button>
          </div>
        </div>

        {/* Code area */}
        <textarea
          value={currentCode}
          onChange={(e) => setCurrentCode(e.target.value)}
          spellCheck={false}
          className="w-full min-h-[300px] p-4 font-mono text-[13px] leading-[1.7] text-[#c9d8e0] bg-transparent border-none resize-y focus:outline-none focus:ring-0 selection:bg-tropicalTeal/20"
        />
      </div>

      {/* ---- Preview panel ---- */}
      <div className="rounded-xl border border-white/[0.08] overflow-hidden">
        {/* Window chrome */}
        <div className="flex items-center gap-3 px-3.5 py-2 border-b border-white/[0.07] bg-[#0c1317]">
          <div className="flex gap-1.5">
            <div className="w-2.5 h-2.5 rounded-full bg-[#ff5f57]/60" />
            <div className="w-2.5 h-2.5 rounded-full bg-[#febc2e]/60" />
            <div className="w-2.5 h-2.5 rounded-full bg-[#28c840]/60" />
          </div>
          <span className="text-[11px] text-gray-500 font-mono">Output</span>
        </div>

        <iframe
          title="Agentyx sandbox preview"
          srcDoc={srcDoc}
          sandbox="allow-scripts allow-same-origin"
          className="w-full h-[480px] bg-black"
        />
      </div>
    </div>
  );
};
