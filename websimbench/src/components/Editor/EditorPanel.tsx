import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { CircleNotch, FloppyDisk, UploadSimple, Cube, FileJs, GraphicsCard, PencilLine } from "@phosphor-icons/react";
import Editor from 'react-simple-code-editor';
import { highlight, languages } from 'prismjs';
import 'prismjs/components/prism-clike';
import 'prismjs/components/prism-javascript';
import 'prismjs/components/prism-wasm';
import 'prismjs/themes/prism-dark.css';

interface EditorPanelProps {
  code: string;
  setCode: (code: string) => void;
  handleSaveCode: () => void;
  handleLoadCode: (e: React.ChangeEvent<HTMLInputElement>) => void;
  compiledCode: { js: string; wasm: string; wgsl: string };
  isCompiling: boolean;
}

const editorStyle = {
  fontFamily: '"Fira code", "Fira Mono", monospace',
  fontSize: 14,
  minHeight: '100%',
  backgroundColor: 'rgba(0, 0, 0, 0.1)',
};

export const EditorPanel = ({
  code,
  setCode,
  handleSaveCode,
  handleLoadCode,
  compiledCode,
  isCompiling
}: EditorPanelProps) => {
  return (
    <Tabs defaultValue="sim-code" className="h-full flex flex-col bg-[#16262b]">
      <div className="h-12 flex items-center justify-between px-3 bg-black/40 border-b border-white/5 shrink-0">
        <TabsList className="bg-transparent h-8 p-0 gap-1">
          <TabsTrigger value="sim-code" className="h-8 px-4 data-[state=active]:bg-white/10 data-[state=active]:text-white rounded-md text-xs font-bold transition-all flex items-center gap-2">
            <PencilLine size={14} />
            Editor
          </TabsTrigger>
          <TabsTrigger value="wasm" className="h-8 px-4 data-[state=active]:bg-white/10 data-[state=active]:text-white rounded-md text-xs font-bold transition-all flex items-center gap-2">
            <Cube size={14} />
            WASM
          </TabsTrigger>
          <TabsTrigger value="javascript" className="h-8 px-4 data-[state=active]:bg-white/10 data-[state=active]:text-white rounded-md text-xs font-bold transition-all flex items-center gap-2">
            <FileJs size={14} />
            JS
          </TabsTrigger>
          <TabsTrigger value="wgsl" className="h-8 px-4 data-[state=active]:bg-white/10 data-[state=active]:text-white rounded-md text-xs font-bold transition-all flex items-center gap-2">
            <GraphicsCard size={14} />
            WGSL
          </TabsTrigger>
        </TabsList>

        <div className="flex gap-2">
          {isCompiling && (
            <div className="flex items-center gap-2 px-3 py-1 bg-tropicalTeal/10 text-tropicalTeal rounded-md text-[10px] font-bold uppercase tracking-wider">
              <CircleNotch size={14} className="animate-spin" />
              Compiling...
            </div>
          )}
          <Button
            size="xs"
            variant="ghost"
            onClick={handleSaveCode}
            className="text-gray-400 hover:text-white hover:bg-white/5 transition-colors flex items-center gap-1.5"
          >
            <FloppyDisk size={14} />
            Save
          </Button>
          <div className="relative">
            <Button
              size="xs"
              variant="ghost"
              className="text-gray-400 hover:text-white hover:bg-white/5 transition-colors flex items-center gap-1.5"
            >
              <UploadSimple size={14} />
              Load
            </Button>
            <input
              type="file"
              className="absolute inset-0 opacity-0 cursor-pointer"
              accept=".js,.txt"
              onChange={handleLoadCode}
            />
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-hidden relative">
        <TabsContent value="sim-code" className="h-full p-0 m-0 overflow-y-auto focus-visible:outline-none">
          <Editor
            value={code}
            onValueChange={setCode}
            highlight={code => highlight(code, languages.js, 'js')}
            padding={16}
            style={editorStyle}
            textareaClassName="focus:outline-none"
          />
        </TabsContent>
        <TabsContent value="wasm" className="h-full p-0 m-0 overflow-y-auto focus-visible:outline-none">
          <Editor
            value={compiledCode.wasm}
            onValueChange={() => { }}
            highlight={code => highlight(code, languages.wasm || languages.js, 'wasm')}
            padding={16}
            readOnly
            style={editorStyle}
          />
        </TabsContent>
        <TabsContent value="javascript" className="h-full p-0 m-0 overflow-y-auto focus-visible:outline-none">
          <Editor
            value={compiledCode.js}
            onValueChange={() => { }}
            highlight={code => highlight(code, languages.js, 'js')}
            padding={16}
            readOnly
            style={editorStyle}
          />
        </TabsContent>
        <TabsContent value="wgsl" className="h-full p-0 m-0 overflow-y-auto focus-visible:outline-none">
          <Editor
            value={compiledCode.wgsl}
            onValueChange={() => { }}
            highlight={code => highlight(code, languages.clike || languages.js, 'clike')}
            padding={16}
            readOnly
            style={editorStyle}
          />
        </TabsContent>
      </div>
    </Tabs>
  );
};
