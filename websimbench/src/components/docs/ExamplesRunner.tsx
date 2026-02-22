import { useCallback, useEffect, useMemo, useState } from 'react';
import type { RunnableExample } from '@/docs/types';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
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
  const [htmlCode, setHtmlCode] = useState(initialExample?.html ?? '');
  const [jsCode, setJsCode] = useState(initialExample?.javascript ?? '');
  const [srcDoc, setSrcDoc] = useState('');

  const selectedExample = useMemo(
    () => examples.find((example) => example.id === selectedExampleId) ?? examples[0],
    [examples, selectedExampleId]
  );

  const runCode = useCallback(() => {
    setSrcDoc(composeSrcDoc(htmlCode, jsCode));
  }, [htmlCode, jsCode]);

  const restorePreset = useCallback(() => {
    if (!selectedExample) {
      return;
    }

    setHtmlCode(selectedExample.html);
    setJsCode(selectedExample.javascript);
    setSrcDoc(composeSrcDoc(selectedExample.html, selectedExample.javascript));
  }, [selectedExample]);

  useEffect(() => {
    if (!selectedExample) {
      return;
    }

    setHtmlCode(selectedExample.html);
    setJsCode(selectedExample.javascript);
    setSrcDoc(composeSrcDoc(selectedExample.html, selectedExample.javascript));
  }, [selectedExample]);

  if (!selectedExample) {
    return null;
  }

  return (
    <div className="flex flex-col gap-4 rounded-xl border border-white/10 bg-black/20 p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex flex-col gap-1">
          <h3 className="text-sm font-semibold text-white">{selectedExample.title}</h3>
          <p className="text-xs text-gray-300 max-w-3xl">{selectedExample.description}</p>
        </div>

        <div className="flex items-center gap-2">
          <label className="text-xs uppercase tracking-wide text-gray-500" htmlFor="docs-example-select">
            Preset
          </label>
          <select
            id="docs-example-select"
            className="h-9 rounded-md border border-white/15 bg-black/40 px-2 text-xs text-white"
            value={selectedExample.id}
            onChange={(event) => setSelectedExampleId(event.target.value)}
          >
            {examples.map((example) => (
              <option key={example.id} value={example.id}>
                {example.title}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        <button
          onClick={runCode}
          className="inline-flex items-center gap-2 h-9 rounded-md bg-tropicalTeal text-jetBlack px-3 text-xs font-bold hover:brightness-110 transition"
          type="button"
        >
          <Play size={14} weight="fill" /> Run
        </button>

        <button
          onClick={restorePreset}
          className="inline-flex items-center gap-2 h-9 rounded-md border border-white/15 bg-black/30 text-white px-3 text-xs font-semibold hover:bg-black/50 transition"
          type="button"
        >
          <ArrowClockwise size={14} /> Reset Preset
        </button>
      </div>

      <Tabs defaultValue="javascript" className="gap-3">
        <TabsList className="bg-black/30 border border-white/10">
          <TabsTrigger value="javascript" className="data-active:bg-white/10 data-active:text-white">JavaScript</TabsTrigger>
          <TabsTrigger value="html" className="data-active:bg-white/10 data-active:text-white">HTML</TabsTrigger>
        </TabsList>

        <TabsContent value="javascript" className="m-0">
          <textarea
            value={jsCode}
            onChange={(event) => setJsCode(event.target.value)}
            className="w-full min-h-[260px] rounded-lg border border-white/10 bg-black/45 p-3 font-mono text-xs text-teaGreen focus:outline-none focus:ring-1 focus:ring-tropicalTeal/50"
          />
        </TabsContent>

        <TabsContent value="html" className="m-0">
          <textarea
            value={htmlCode}
            onChange={(event) => setHtmlCode(event.target.value)}
            className="w-full min-h-[260px] rounded-lg border border-white/10 bg-black/45 p-3 font-mono text-xs text-teaGreen focus:outline-none focus:ring-1 focus:ring-tropicalTeal/50"
          />
        </TabsContent>
      </Tabs>

      <div className="rounded-lg border border-white/10 overflow-hidden bg-black/40">
        <div className="px-3 py-2 border-b border-white/10 text-[11px] uppercase tracking-wide text-gray-400">
          Preview
        </div>
        <iframe
          title="Agentyx docs example preview"
          srcDoc={srcDoc}
          sandbox="allow-scripts allow-same-origin"
          className="w-full h-[460px] bg-black"
        />
      </div>
    </div>
  );
};
