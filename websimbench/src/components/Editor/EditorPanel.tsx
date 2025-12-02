import { Tabs, TabList, Tab, Button, Spinner, TabPanels, TabPanel } from '@chakra-ui/react';
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
  backgroundColor: 'rgba(0, 0, 0, 0.2)',
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
    <Tabs variant="enclosed" colorScheme="teal" h="100%" display="flex" flexDirection="column">
      <TabList bg="rgba(0,0,0,0.2)">
        <Tab>Sim Code</Tab>
        <Button size="xs" ml={2} onClick={handleSaveCode} colorScheme="teal" variant="ghost">Save</Button>
        <Button size="xs" as="label" cursor="pointer" colorScheme="teal" variant="ghost">
          Load
          <input type="file" hidden accept=".js,.txt" onChange={handleLoadCode} />
        </Button>
        <Tab>
          WASM
          {isCompiling && <Spinner size="xs" ml={2} />}
        </Tab>
        <Tab>
          JavaScript
          {isCompiling && <Spinner size="xs" ml={2} />}
        </Tab>
        <Tab>
          WGSL
          {isCompiling && <Spinner size="xs" ml={2} />}
        </Tab>
      </TabList>
      <TabPanels flex="1" overflow="hidden">
        <TabPanel h="100%" p={0} overflowY="auto">
          <Editor
            value={code}
            onValueChange={setCode}
            highlight={code => highlight(code, languages.js, 'js')}
            padding={16}
            style={editorStyle}
            textareaClassName="focus:outline-none"
          />
        </TabPanel>
        <TabPanel h="100%" p={0} overflowY="auto">
          <Editor
            value={compiledCode.wasm}
            onValueChange={() => { }}
            highlight={code => highlight(code, languages.wasm || languages.js, 'wasm')}
            padding={16}
            readOnly
            style={editorStyle}
          />
        </TabPanel>
        <TabPanel h="100%" p={0} overflowY="auto">
          <Editor
            value={compiledCode.js}
            onValueChange={() => { }}
            highlight={code => highlight(code, languages.js, 'js')}
            padding={16}
            readOnly
            style={editorStyle}
          />
        </TabPanel>
        <TabPanel h="100%" p={0} overflowY="auto">
          <Editor
            value={compiledCode.wgsl}
            onValueChange={() => { }}
            highlight={code => highlight(code, languages.clike || languages.js, 'clike')}
            padding={16}
            readOnly
            style={editorStyle}
          />
        </TabPanel>
      </TabPanels>
    </Tabs>
  );
};

