import { useRef } from 'react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { CircleNotch, FloppyDisk, UploadSimple, PencilLineIcon, CubeIcon, FileJsIcon, GraphicsCardIcon, BookOpen } from "@phosphor-icons/react";
import Editor from 'react-simple-code-editor';
import { highlight, languages } from 'prismjs';
import 'prismjs/components/prism-clike';
import 'prismjs/components/prism-javascript';
import 'prismjs/components/prism-wasm';
import 'prismjs/themes/prism-dark.css';

import { PREMADE_SIMULATIONS } from '../config/premadeSimulations';

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
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleLoadPremade = (simCode: string) => {
    // Confirm before overwriting if the code is not empty? 
    // For now, just overwrite as requested by "load" behavior usually implies replacement.
    // If we wanted to be safer we could check if code !== DEFAULT_CODE etc.
    setCode(simCode);
  };

  return (
    <Tabs defaultValue="sim-code" className="h-full flex flex-col bg-[#16262b]">
      <div className="h-12 flex items-center justify-between px-3 bg-black/40 border-b border-white/5 shrink-0">
        <TabsList className="bg-transparent h-8 p-0 gap-1">
          <TabsTrigger value="sim-code" className="h-8 px-4 data-[state=active]:bg-white/10 data-[state=active]:text-white rounded-md text-xs font-bold transition-all flex items-center gap-2">
            <PencilLineIcon />
            Editor
          </TabsTrigger>
          <TabsTrigger value="wasm" className="h-8 px-4 data-[state=active]:bg-white/10 data-[state=active]:text-white rounded-md text-xs font-bold transition-all flex items-center gap-2">
            <CubeIcon size={18} />
            WASM
          </TabsTrigger>
          <TabsTrigger value="javascript" className="h-8 px-4 data-[state=active]:bg-white/10 data-[state=active]:text-white rounded-md text-xs font-bold transition-all flex items-center gap-2">
            <FileJsIcon size={18} />
            JS
          </TabsTrigger>
          <TabsTrigger value="wgsl" className="h-8 px-4 data-[state=active]:bg-white/10 data-[state=active]:text-white rounded-md text-xs font-bold transition-all flex items-center gap-2">
            <GraphicsCardIcon size={18} />
            WGSL
          </TabsTrigger>
        </TabsList>

        <div className="flex gap-2">
          {isCompiling && (
            <div className="flex items-center gap-2 px-3 py-1 bg-tropicalTeal/10 text-tropicalTeal rounded-md text-[10px] font-bold uppercase tracking-wider">
              <CircleNotch size={18} className="animate-spin" />
              Compiling...
            </div>
          )}

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                size="icon-lg"
                className="h-8 w-8 text-tropicalTeal hover:text-tropicalTeal hover:bg-white/10"
                title="Premade Simulations"
              >
                <BookOpen size={18} />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-48 bg-[#16262b] border-white/10 text-white">
              {Object.entries(PREMADE_SIMULATIONS).map(([name, simCode]) => (
                <DropdownMenuItem
                  key={name}
                  onClick={() => handleLoadPremade(simCode)}
                  className="cursor-pointer hover:bg-white/10 focus:bg-white/10 focus:text-white"
                >
                  {name}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>

          <Button
            variant="ghost"
            size="icon-lg"
            className="h-8 w-8 text-tropicalTeal hover:text-tropicalTeal hover:bg-white/10"
            onClick={handleSaveCode}
            title="Save Simulation"
          >
            <FloppyDisk size={18} />
          </Button>

          <Button
            variant="ghost"
            size="icon-lg"
            className="h-8 w-8 text-tropicalTeal hover:text-tropicalTeal hover:bg-white/10"
            onClick={() => fileInputRef.current?.click()}
            title="Load Simulation"
          >
            <UploadSimple size={18} />
          </Button>
          <input
            type="file"
            ref={fileInputRef}
            onChange={handleLoadCode}
            className="hidden"
            accept=".js,.ts,.txt,.sim"
          />
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
